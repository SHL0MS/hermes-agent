"""Media Studio — Hermes plugin shell.

Three jobs:

1. Let the plugin registry resolve/enable the plugin (the FastAPI backend in
   ``dashboard/`` is mounted by the dashboard plugin system; the desktop UI is
   the built ``plugin.js`` under ``~/.hermes/desktop-plugins/``).

2. A ``post_tool_call`` hook that makes chat generations reach the library.
   The library indexer watches ``$HERMES_HOME/cache/{images,videos}`` — but
   not every generation path writes there. The managed fal image provider
   returns a ``fal.media`` URL without materializing a file, and FLUX 3 video
   saves to ``~/Downloads`` on desktop. The hook watches the media tools'
   results and materializes into the watched dirs:

   - http(s) URL results   -> downloaded (size-capped, background thread)
   - local paths elsewhere -> hardlinked in (copy fallback; same-volume free)
   - local paths already in the cache dirs -> sidecar only (indexer imports)

   Each materialized artifact gets a ``<file>.msmeta.json`` provenance
   sidecar (tool params + originating session id) that the indexer consumes,
   so agent rows carry their prompt and link back to their chat.

3. An agent tool, ``media_studio_generate``: queue generations on the
   studio's durable engine instead of blocking the agent loop for the length
   of a render. Returns job ids immediately (or waits when asked); results
   land in the library with full provenance.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Media-producing tools -> (result fields carrying the artifact).
_MEDIA_TOOLS = {
    "image_generate": ("image", "agent_visible_image"),
    "video_generate": ("video", "agent_visible_video"),
    "bfl_flux3_get_result": ("saved_path", "path", "video"),
    "xai_video_edit": ("video", "saved_path"),
    "xai_video_extend": ("video", "saved_path"),
}

# Args worth preserving as provenance (whitelist — never dump raw args:
# they can carry data URIs or upload tokens).
_PROVENANCE_ARG_KEYS = (
    "prompt",
    "aspect_ratio",
    "resolution",
    "duration",
    "seed",
    "negative_prompt",
    "image_url",
    "model",
)

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_VIDEO_EXTS = {".mp4", ".webm", ".mov", ".mkv"}

# Per-process dedupe so retries/polls of the same artifact don't refetch.
_handled: set = set()
_handled_lock = threading.Lock()
_MAX_HANDLED = 2048


def _hermes_home() -> Path:
    try:
        from hermes_constants import get_hermes_home

        return get_hermes_home()
    except Exception:  # noqa: BLE001 — standalone/test fallback
        env = os.environ.get("HERMES_HOME")
        return Path(env) if env else Path.home() / ".hermes"


def _modality_for(value: str, field: str) -> str:
    suffix = Path(value.split("?", 1)[0]).suffix.lower()
    if suffix in _IMAGE_EXTS:
        return "image"
    if suffix in _VIDEO_EXTS:
        return "video"
    return "image" if "image" in field else "video"


def _already_handled(value: str) -> bool:
    with _handled_lock:
        if value in _handled:
            return True
        if len(_handled) >= _MAX_HANDLED:
            _handled.clear()
        _handled.add(value)
        return False


def _write_sidecar(target: Path, meta: Optional[Dict[str, Any]]) -> None:
    """Provenance sidecar the indexer consumes (and deletes) at import."""
    if not meta:
        return
    try:
        Path(str(target) + ".msmeta.json").write_text(json.dumps(meta), encoding="utf-8")
    except OSError:
        pass


def _materialize(value: str, modality: str, meta: Optional[Dict[str, Any]] = None) -> None:
    """Bring one artifact under cache/{images,videos}. Runs off-thread."""
    cache = _hermes_home() / "cache" / ("images" if modality == "image" else "videos")
    try:
        if value.startswith(("http://", "https://")):
            if modality == "image":
                from agent.image_gen_provider import save_url_image

                saved = save_url_image(value, prefix="image_chat")
            else:
                from agent.video_gen_provider import save_url_video

                saved = save_url_video(value, prefix="video_chat")
            _write_sidecar(Path(saved), meta)
            return

        source = Path(value.removeprefix("file://")).expanduser()
        if not source.is_file():
            return
        try:
            if source.resolve().is_relative_to(cache.resolve()):
                # Already where the indexer watches — provenance only.
                _write_sidecar(source, meta)
                return
        except (OSError, ValueError):
            pass
        cache.mkdir(parents=True, exist_ok=True)
        target = cache / source.name
        if not target.exists():
            try:
                os.link(source, target)  # same volume: free, instant
            except OSError:
                import shutil

                shutil.copy2(source, target)
        _write_sidecar(target, meta)
    except Exception as exc:  # noqa: BLE001 — never surface into the agent loop
        logger.debug("media-studio: could not materialize %s: %s", value[:120], exc)


def _provenance_meta(tool_name: str, args, session_id: str) -> Optional[Dict[str, Any]]:
    params: Dict[str, Any] = {}
    if isinstance(args, dict):
        for key in _PROVENANCE_ARG_KEYS:
            value = args.get(key)
            if value is None or (isinstance(value, str) and not value.strip()):
                continue
            if isinstance(value, str) and value.startswith("data:"):
                continue  # never persist inline payloads
            params[key] = value
    meta: Dict[str, Any] = {"provider": "agent", "model": str(params.pop("model", "")) or tool_name}
    if params:
        meta["params"] = params
    if session_id:
        meta["session_id"] = session_id
    return meta


def _on_post_tool_call(tool_name: str = "", result=None, args=None, session_id: str = "", **_kwargs) -> None:
    fields = _MEDIA_TOOLS.get(tool_name)
    if not fields:
        return
    data = result
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except (TypeError, ValueError):
            return
    if not isinstance(data, dict) or data.get("success") is False:
        return
    meta = _provenance_meta(tool_name, args, str(session_id or ""))
    for field in fields:
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            continue
        value = value.strip()
        if value.startswith("data:"):
            continue
        if _already_handled(value):
            continue
        modality = _modality_for(value, field)
        threading.Thread(
            target=_materialize,
            args=(value, modality, meta),
            name="media-studio-materialize",
            daemon=True,
        ).start()


# ---------------------------------------------------------------------------
# Agent tool: queue generations on the studio engine (non-blocking)
# ---------------------------------------------------------------------------

_DEFAULT_MODELS = {"image": "fal-ai/nano-banana-pro", "video": "veo3.1"}
_WAIT_POLL_S = 3.0
_WAIT_CAP_S = 15 * 60.0


def _dashboard_module():
    """The mounted dashboard plugin module (same process as the web server).

    ``None`` when the dashboard isn't mounted (plain CLI without the serve
    backend) — the tool then reports how to get it instead of half-working.
    """
    import sys

    return sys.modules.get("hermes_dashboard_plugin_media-studio")


def _tool_error(message: str) -> str:
    return json.dumps({"success": False, "error": message})


def _media_studio_generate(args: Dict[str, Any], session_id: str = "", **_kw) -> str:
    mod = _dashboard_module()
    if mod is None:
        return _tool_error(
            "Media Studio backend is not mounted in this process. It runs inside "
            "the desktop app / `hermes serve`; from there this tool queues jobs."
        )
    prompt = str(args.get("prompt") or "").strip()
    if not prompt:
        return _tool_error("prompt is required")
    modality = str(args.get("modality") or "image").strip().lower()
    if modality not in ("image", "video"):
        return _tool_error("modality must be 'image' or 'video'")
    provider = str(args.get("provider") or "fal").strip()
    model = str(args.get("model") or "").strip() or _DEFAULT_MODELS[modality]
    try:
        count = max(1, min(8, int(args.get("count") or 1)))
    except (TypeError, ValueError):
        count = 1

    params: Dict[str, Any] = {"prompt": prompt}
    for key in ("aspect_ratio", "resolution", "negative_prompt", "image_url"):
        value = args.get(key)
        if isinstance(value, str) and value.strip():
            params[key] = value.strip()
    if args.get("duration") is not None:
        try:
            params["duration"] = int(args["duration"])
        except (TypeError, ValueError):
            pass
    seed = args.get("seed")

    engine = mod._ensure_engine()
    jobs = []
    try:
        for index in range(count):
            job_params = dict(params)
            if seed is not None:
                try:
                    job_params["seed"] = int(seed) + index * 100
                except (TypeError, ValueError):
                    pass
            jobs.append(
                engine.submit(
                    provider=provider,
                    model=model,
                    modality=modality,
                    params=job_params,
                    session_id=str(session_id or "") or None,
                )
            )
    except Exception as exc:  # noqa: BLE001 — surface the provider message
        if jobs:
            return json.dumps(
                {
                    "success": True,
                    "queued": [j["id"] for j in jobs],
                    "warning": f"only {len(jobs)}/{count} queued: {exc}",
                }
            )
        return _tool_error(str(exc))

    job_ids = [j["id"] for j in jobs]
    if not args.get("wait"):
        return json.dumps(
            {
                "success": True,
                "queued": job_ids,
                "model": model,
                "note": (
                    "Generation runs in the Media Studio queue; results appear in its "
                    "library (and this response is not blocked on them). Poll by "
                    "re-calling with wait=true only if the files are needed in-turn."
                ),
            }
        )

    # wait=true: block (bounded) until every job is terminal, return paths.
    store = mod._store
    deadline = time.monotonic() + _WAIT_CAP_S
    while time.monotonic() < deadline:
        rows = [store.get_job(job_id) for job_id in job_ids]
        if all(row and row["state"] in ("done", "failed", "cancelled", "expired") for row in rows):
            return json.dumps(
                {
                    "success": all(row["state"] == "done" for row in rows),
                    "jobs": [
                        {"id": row["id"], "state": row["state"], "paths": row["result_paths"], "error": row["error"]}
                        for row in rows
                    ],
                }
            )
        time.sleep(_WAIT_POLL_S)
    return json.dumps({"success": False, "queued": job_ids, "error": "timed out waiting; jobs continue in the studio queue"})


_TOOL_SCHEMA = {
    "name": "media_studio_generate",
    "description": (
        "Queue image/video generation on the Media Studio's durable queue and return "
        "immediately — do NOT block your turn waiting for renders. Results land in the "
        "studio library (the user watches them arrive live) tagged with this session. "
        "Models: any Media Studio catalog id (defaults: image fal-ai/nano-banana-pro, "
        "video veo3.1; fast drafts fal-ai/z-image/turbo). Set wait=true ONLY when the "
        "file path is needed later this same turn."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "prompt": {"type": "string", "description": "Generation prompt."},
            "modality": {"type": "string", "enum": ["image", "video"], "default": "image"},
            "model": {"type": "string", "description": "Catalog model id; omit for the modality default."},
            "provider": {"type": "string", "enum": ["fal", "krea"], "default": "fal"},
            "count": {"type": "integer", "minimum": 1, "maximum": 8, "default": 1, "description": "Variations (pinned seed steps per job)."},
            "aspect_ratio": {"type": "string", "description": "e.g. 16:9, 1:1, 9:16 (model-dependent)."},
            "resolution": {"type": "string", "description": "e.g. 1K/2K/4K or 720p/1080p (model-dependent)."},
            "duration": {"type": "integer", "description": "Video seconds (model-dependent)."},
            "seed": {"type": "integer"},
            "negative_prompt": {"type": "string"},
            "image_url": {"type": "string", "description": "Start image: local path or URL (image-to-video / edit)."},
            "wait": {"type": "boolean", "default": False, "description": "Block until finished and return file paths."},
        },
        "required": ["prompt"],
    },
}


def register(ctx):
    """Hermes plugin entry point."""
    try:
        ctx.register_hook("post_tool_call", _on_post_tool_call)
    except Exception:  # noqa: BLE001 — hook surface unavailable (old core)
        logger.debug("media-studio: post_tool_call hook not registered", exc_info=True)
    try:
        ctx.register_tool(
            name="media_studio_generate",
            toolset="media_studio",
            schema=_TOOL_SCHEMA,
            handler=_media_studio_generate,
            description="Queue media generation in the Media Studio",
            emoji="🎬",
        )
    except Exception:  # noqa: BLE001 — tool surface unavailable
        logger.debug("media-studio: tool registration failed", exc_info=True)
    return None
