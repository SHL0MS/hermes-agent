"""Media Studio dashboard plugin — backend API routes.

Mounted at ``/api/plugins/media-studio/`` by the dashboard plugin system
(``hermes_cli/web_server.py::_mount_plugin_api_routes``). HTTP routes ride
the dashboard's session-token auth middleware; the ``/events`` WebSocket
authorizes upgrades through the same shared gate the kanban plugin uses.

Surface (all relative to the mount):

    GET  /health                 -> {ok, providers: {name: {available, hint}}}
    GET  /providers              -> provider + model catalog
    GET  /jobs?state=&modality=  -> job list (library + queue)
    POST /jobs                   -> submit {provider, model, modality, params}
    GET  /jobs/{id}              -> one job
    POST /jobs/{id}/cancel       -> cancel
    DELETE /jobs/{id}            -> remove row (files stay on disk)
    GET  /file?path=&thumb=      -> stream a result file (path-guarded)
    WS   /events                 -> {events: [...]} frames tailing media_events
"""

from __future__ import annotations

import asyncio
import importlib
import importlib.util
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Module loading: the dashboard imports this file as a standalone module
# (spec_from_file_location), so relative imports don't resolve. Load our
# siblings the same way the file itself was loaded.
# ---------------------------------------------------------------------------

_HERE = Path(__file__).parent


def _load_sibling(name: str):
    module_name = f"hermes_media_studio_{name}"
    if module_name in sys.modules:
        return sys.modules[module_name]
    spec = importlib.util.spec_from_file_location(module_name, _HERE / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(module_name, None)
        raise
    return module


_engine_mod = _load_sibling("engine")
# providers.py does `from .engine import ...`; loaded standalone there is no
# package context, so pre-alias the engine module under the name it wants.
sys.modules.setdefault("hermes_media_studio_providers_engine", _engine_mod)
_providers_mod = _load_sibling("providers")

MediaStore = _engine_mod.MediaStore
MediaEngine = _engine_mod.MediaEngine
MediaProviderError = _engine_mod.MediaProviderError
TERMINAL_STATES = _engine_mod.TERMINAL_STATES

_store: Any = None
_engine: Any = None
_indexed_once = False
_state_lock = None


def _ensure_engine():
    """Lazy singleton — build the store/engine on first request, resume
    in-flight jobs from the previous process, and index agent output."""
    global _store, _engine, _indexed_once
    if _engine is not None:
        return _engine
    _store = MediaStore()
    _engine = MediaEngine(_store, _providers_mod.build_providers())
    resumed = _engine.resume_pending()
    if resumed:
        logger.info("media-studio: resumed %d in-flight job(s)", resumed)
    if not _indexed_once:
        _indexed_once = True
        try:
            imported = _index_agent_media(_store)
            if imported:
                logger.info("media-studio: indexed %d agent media file(s)", imported)
        except Exception:  # noqa: BLE001 — indexing must never block boot
            logger.exception("media-studio: agent media indexing failed")
    return _engine


# ---------------------------------------------------------------------------
# Agent-output indexing: pick up files the agent's own image/video tools
# materialized under $HERMES_HOME/cache/{images,videos}, so chat generations
# appear in the library with zero tool changes.
# ---------------------------------------------------------------------------

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_VIDEO_EXTS = {".mp4", ".webm", ".mov", ".mkv"}


def _index_agent_media(store) -> int:
    from hermes_constants import get_hermes_home

    cache = get_hermes_home() / "cache"
    known = store.known_result_paths()
    imported = 0
    for sub, exts, modality in (("images", _IMAGE_EXTS, "image"), ("videos", _VIDEO_EXTS, "video")):
        directory = cache / sub
        if not directory.is_dir():
            continue
        for path in sorted(directory.iterdir()):
            if not path.is_file() or path.suffix.lower() not in exts:
                continue
            resolved = str(path)
            if resolved in known:
                continue
            # Studio materializations are already rows; agent files carry the
            # tool's own prefix (image_/video_/<provider>_...). Register them
            # under source=agent with the file's mtime as its timestamp.
            if path.name.startswith("studio_"):
                continue
            thumb = _engine_mod.make_thumbnail(path, modality)
            store.import_file(
                provider="agent",
                model="",
                modality=modality,
                result_path=resolved,
                thumb_path=thumb,
                source="agent",
                created_at=path.stat().st_mtime,
            )
            imported += 1
    return imported


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class SubmitBody(BaseModel):
    provider: str
    model: str
    modality: str = Field(pattern="^(image|video)$")
    params: Dict[str, Any] = Field(default_factory=dict)
    count: int = Field(1, ge=1, le=50, description="fan out N identical jobs (seed varied per job)")


class ProviderKeyBody(BaseModel):
    key: str = Field(min_length=1, max_length=512)


# BYOK: which providers accept a pasted key, and which env var it lands in.
# Server-side allow-list — the client never chooses the env var name. fal is
# deliberately absent: subscribers ride the managed gateway; direct FAL_KEY
# setup stays in `hermes setup tools` where its interaction with the gateway
# is explained.
PROVIDER_KEY_VARS: Dict[str, str] = {
    "krea": "KREA_API_KEY",
}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/health")
def health() -> Dict[str, Any]:
    engine = _ensure_engine()
    providers = {}
    for name, adapter in engine.providers.items():
        available = False
        try:
            available = bool(adapter.is_available())
        except Exception:  # noqa: BLE001
            available = False
        providers[name] = {
            "available": available,
            "display": adapter.display_name,
            "hint": adapter.availability_hint(),
        }
    return {"ok": True, "providers": providers}


@router.get("/providers")
def provider_catalog() -> Dict[str, Any]:
    engine = _ensure_engine()
    out = []
    for name, adapter in engine.providers.items():
        try:
            available = bool(adapter.is_available())
        except Exception:  # noqa: BLE001
            available = False
        out.append(
            {
                "name": name,
                "display": adapter.display_name,
                "available": available,
                "hint": adapter.availability_hint(),
                "models": adapter.catalog(),
                "key_var": PROVIDER_KEY_VARS.get(name),
                # Whether the BYOK key is actually on file — availability alone
                # can't answer this for providers with a managed (keyless) route.
                "key_on_file": bool(
                    PROVIDER_KEY_VARS.get(name) and os.environ.get(PROVIDER_KEY_VARS[name])
                ),
            }
        )
    return {"providers": out}


@router.put("/providers/{provider}/key")
def set_provider_key(provider: str, body: ProviderKeyBody) -> Dict[str, Any]:
    """BYOK: store a provider API key in ~/.hermes/.env and make it live in
    this process. Allow-listed providers only; the value is never echoed."""
    env_var = PROVIDER_KEY_VARS.get(provider)
    if env_var is None:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' does not take a key here")
    key = body.key.strip()
    if not key or any(c in key for c in "\r\n"):
        raise HTTPException(status_code=400, detail="Invalid key")
    try:
        from hermes_cli.config import save_env_value

        save_env_value(env_var, key)
    except Exception as exc:  # noqa: BLE001 — managed installs raise here
        raise HTTPException(status_code=400, detail=f"Could not save key: {exc}")
    # .env is read at process start — export for THIS process so the adapter
    # sees it without a backend restart.
    os.environ[env_var] = key
    engine = _ensure_engine()
    adapter = engine.providers.get(provider)
    available = False
    if adapter is not None:
        try:
            available = bool(adapter.is_available())
        except Exception:  # noqa: BLE001
            available = False
    return {"ok": True, "available": available}


@router.delete("/providers/{provider}/key")
def clear_provider_key(provider: str) -> Dict[str, Any]:
    """Remove a BYOK provider key from ~/.hermes/.env and this process."""
    env_var = PROVIDER_KEY_VARS.get(provider)
    if env_var is None:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' does not take a key here")
    try:
        from hermes_cli.config import remove_env_value

        remove_env_value(env_var)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not remove key: {exc}")
    os.environ.pop(env_var, None)
    return {"ok": True, "available": False}


@router.get("/jobs")
def list_jobs(
    state: Optional[str] = Query(None, description="comma-separated state filter"),
    modality: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    _ensure_engine()
    states = [s.strip() for s in state.split(",") if s.strip()] if state else None
    jobs = _store.list_jobs(states=states, modality=modality, provider=provider, limit=limit, offset=offset)
    return {"jobs": jobs, "cursor": _store.last_event_seq()}


@router.post("/jobs")
def submit_job(body: SubmitBody) -> Dict[str, Any]:
    engine = _ensure_engine()
    jobs = []
    try:
        for index in range(body.count):
            params = dict(body.params)
            # A pinned seed must not collapse the batch into N identical
            # results — step it per job. Unpinned stays unpinned (provider
            # randomizes each job independently).
            if index > 0 and params.get("seed") is not None:
                try:
                    params["seed"] = int(params["seed"]) + index
                except (TypeError, ValueError):
                    params.pop("seed", None)
            jobs.append(
                engine.submit(provider=body.provider, model=body.model, modality=body.modality, params=params)
            )
    except MediaProviderError as exc:
        # Partial fan-out is fine: already-submitted jobs keep running and
        # sit in the queue; the client surfaces the error for the rest.
        if not jobs:
            raise HTTPException(status_code=400, detail=str(exc))
        return {"job": jobs[0], "jobs": jobs, "error": str(exc)}
    return {"job": jobs[0], "jobs": jobs}


@router.get("/jobs/{job_id}")
def get_job(job_id: str) -> Dict[str, Any]:
    _ensure_engine()
    job = _store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job": job}


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str) -> Dict[str, Any]:
    engine = _ensure_engine()
    if not engine.cancel(job_id):
        raise HTTPException(status_code=409, detail="Job is not cancellable")
    return {"ok": True}


@router.delete("/jobs/{job_id}")
def delete_job(job_id: str) -> Dict[str, Any]:
    engine = _ensure_engine()
    job = _store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["state"] not in TERMINAL_STATES:
        engine.cancel(job_id)
    _store.delete_job(job_id)
    return {"ok": True}


def _allowed_media_roots() -> List[Path]:
    from hermes_constants import get_hermes_home

    cache = get_hermes_home() / "cache"
    return [cache / "images", cache / "videos", cache / "media_thumbs"]


_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
}


@router.get("/file")
def get_file(path: str = Query(...)) -> FileResponse:
    """Stream a result/thumb file. Locked to the media cache directories so
    the dashboard token can't read arbitrary disk through this route."""
    target = Path(path).resolve()
    if not any(target.is_relative_to(root.resolve()) for root in _allowed_media_roots() if root.exists()):
        raise HTTPException(status_code=403, detail="Path outside media cache")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    media_type = _MEDIA_TYPES.get(target.suffix.lower())
    if media_type is None:
        raise HTTPException(status_code=404, detail="Unsupported media type")
    return FileResponse(target, media_type=media_type, headers={"Cache-Control": "private, max-age=86400"})


@router.websocket("/events")
async def events(ws: WebSocket) -> None:
    """Tail media_events. Frame: {events: [{seq, job_id, kind, payload}]}.
    Auth: the dashboard's shared WS gate (token / ticket / internal)."""
    try:
        from hermes_cli.web_server import _ws_auth_ok

        if not _ws_auth_ok(ws):
            await ws.close(code=4401)
            return
    except ImportError:
        # Standalone/test mounting — no dashboard gate to delegate to.
        pass
    await ws.accept()
    _ensure_engine()
    cursor_param = ws.query_params.get("since")
    cursor = int(cursor_param) if cursor_param and cursor_param.isdigit() else _store.last_event_seq()
    try:
        while True:
            events_batch = await asyncio.to_thread(_store.events_since, cursor)
            if events_batch:
                cursor = events_batch[-1]["seq"]
                await ws.send_text(json.dumps({"events": events_batch}))
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        return
    except Exception:  # noqa: BLE001 — normal on shutdown
        return
