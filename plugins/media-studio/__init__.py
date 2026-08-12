"""Media Studio — Hermes plugin shell.

Two jobs:

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
   - local paths already in the cache dirs -> left alone (indexer sees them)

   The studio's throttled rescan then registers the file within seconds.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

# Media-producing tools and the result fields that carry their artifact.
_MEDIA_TOOLS = {
    "image_generate": ("image", "agent_visible_image"),
    "video_generate": ("video", "agent_visible_video"),
    "bfl_flux3_get_result": ("saved_path", "path", "video"),
    "xai_video_edit": ("video", "saved_path"),
    "xai_video_extend": ("video", "saved_path"),
}

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


def _materialize(value: str, modality: str) -> None:
    """Bring one artifact under cache/{images,videos}. Runs off-thread."""
    cache = _hermes_home() / "cache" / ("images" if modality == "image" else "videos")
    try:
        if value.startswith(("http://", "https://")):
            if modality == "image":
                from agent.image_gen_provider import save_url_image

                save_url_image(value, prefix="image_chat")
            else:
                from agent.video_gen_provider import save_url_video

                save_url_video(value, prefix="video_chat")
            return

        source = Path(value.removeprefix("file://")).expanduser()
        if not source.is_file():
            return
        try:
            if source.resolve().is_relative_to(cache.resolve()):
                return  # already where the indexer watches
        except (OSError, ValueError):
            pass
        cache.mkdir(parents=True, exist_ok=True)
        target = cache / source.name
        if target.exists():
            return
        try:
            os.link(source, target)  # same volume: free, instant
        except OSError:
            import shutil

            shutil.copy2(source, target)
    except Exception as exc:  # noqa: BLE001 — never surface into the agent loop
        logger.debug("media-studio: could not materialize %s: %s", value[:120], exc)


def _on_post_tool_call(tool_name: str = "", result=None, **_kwargs) -> None:
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
            args=(value, modality),
            name="media-studio-materialize",
            daemon=True,
        ).start()


def register(ctx):
    """Hermes plugin entry point."""
    try:
        ctx.register_hook("post_tool_call", _on_post_tool_call)
    except Exception:  # noqa: BLE001 — hook surface unavailable (old core)
        logger.debug("media-studio: post_tool_call hook not registered", exc_info=True)
    return None
