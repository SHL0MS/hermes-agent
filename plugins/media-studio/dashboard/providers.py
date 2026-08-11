"""Media Studio provider adapters.

Each adapter implements the narrow contract the engine consumes:

    name / display_name / is_available()
    catalog()                       -> [ModelInfo dict]
    schema(model_id)                -> {core: {...}, extras: [FieldSpec]}
    submit(model, modality, params) -> ProviderJobRef
    status(ref)                     -> JobStatus
    result(ref)                     -> [url]
    cancel(ref)                     -> bool

Adapters normalize the CORE param set (prompt, image_url, aspect_ratio,
resolution, duration, seed, negative_prompt, audio) and pass through
whitelisted extras. They raise MediaProviderError with a user-facing
message for provider-reported failures.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .engine import JobStatus, MediaProviderError, ProviderJobRef
else:
    try:
        from .engine import JobStatus, MediaProviderError, ProviderJobRef
    except ImportError:  # loaded standalone by the dashboard mounter (no package)
        import sys as _sys

        _engine = _sys.modules["hermes_media_studio_engine"]
        JobStatus = _engine.JobStatus
        MediaProviderError = _engine.MediaProviderError
        ProviderJobRef = _engine.ProviderJobRef

logger = logging.getLogger(__name__)


_DATA_URI_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}
_MAX_INPUT_IMAGE_BYTES = 12 * 1024 * 1024


def normalize_image_input(value: Optional[str]) -> Optional[str]:
    """Accept http(s)/data URLs as-is; convert a LOCAL FILE PATH (the library
    chaining case) to a base64 data URI both fal and Krea accept."""
    if not value:
        return None
    value = str(value).strip()
    if value.startswith(("http://", "https://", "data:")):
        return value
    import base64
    from pathlib import Path as _Path

    path = _Path(value.removeprefix("file://"))
    if not path.is_file():
        raise MediaProviderError(f"Input image not found: {path}")
    mime = _DATA_URI_MIME.get(path.suffix.lower())
    if mime is None:
        raise MediaProviderError(f"Unsupported input image type: {path.suffix}")
    data = path.read_bytes()
    if len(data) > _MAX_INPUT_IMAGE_BYTES:
        raise MediaProviderError("Input image exceeds 12MB — downscale it first")
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


# ---------------------------------------------------------------------------
# FAL — through the Nous managed fal-queue gateway (no key needed for
# subscribers) or direct FAL_KEY. Reuses the exact client plumbing the
# in-tree image/video tools use.
# ---------------------------------------------------------------------------

# Curated launch catalog. Endpoint ids + payload shapes match the in-tree
# tool catalogs (tools/image_generation_tool.py IMAGE_MODELS and
# plugins/video_gen/fal/__init__.py FAL_FAMILIES) — the payloads below were
# taken from those, not invented.
FAL_IMAGE_MODELS: List[Dict[str, Any]] = [
    {
        "id": "fal-ai/flux-2/klein/9b",
        "display": "FLUX 2 Klein 9B",
        "modality": "image",
        "tier": "fast",
        "supports": {"aspect_ratio": True, "seed": True},
        "note": "Default Hermes image model. Fast, strong aesthetics.",
    },
    {
        "id": "fal-ai/flux-2-pro",
        "display": "FLUX 2 Pro",
        "modality": "image",
        "tier": "quality",
        "supports": {"aspect_ratio": True, "seed": True},
        "note": "Higher fidelity, slower.",
    },
]

FAL_VIDEO_MODELS: List[Dict[str, Any]] = [
    {
        "id": "pixverse-v6",
        "display": "Pixverse v6",
        "modality": "video",
        "tier": "fast",
        "text_endpoint": "fal-ai/pixverse/v6/text-to-video",
        "image_endpoint": "fal-ai/pixverse/v6/image-to-video",
        "supports": {
            "aspect_ratio": True,
            "resolution": True,
            "duration": True,
            "negative_prompt": True,
            "seed": True,
            "image_url": True,
        },
        "resolutions": ["360p", "540p", "720p", "1080p"],
        "durations": [5, 8],
        "note": "Cheap and quick.",
    },
    {
        "id": "veo3.1",
        "display": "Veo 3.1",
        "modality": "video",
        "tier": "quality",
        "text_endpoint": "fal-ai/veo3.1",
        "image_endpoint": "fal-ai/veo3.1/image-to-video",
        "supports": {
            "aspect_ratio": True,
            "resolution": True,
            "duration": True,
            "audio": True,
            "negative_prompt": True,
            "seed": True,
            "image_url": True,
        },
        "aspect_ratios": ["16:9", "9:16"],
        "resolutions": ["720p", "1080p"],
        "durations": [4, 6, 8],
        "note": "Best overall quality; native audio.",
    },
]

# FLUX image_size presets keyed by the UI's aspect value.
_FAL_IMAGE_SIZE = {
    "1:1": "square_hd",
    "16:9": "landscape_16_9",
    "9:16": "portrait_16_9",
    "4:3": "landscape_4_3",
    "3:4": "portrait_4_3",
}


class FalAdapter:
    name = "fal"
    display_name = "fal.ai"
    deadline_s = 30 * 60

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._managed = None
        self._managed_config = None

    # -- availability ------------------------------------------------------

    def _direct_key(self) -> Optional[str]:
        return os.environ.get("FAL_KEY") or None

    def _managed_gateway(self):
        try:
            from tools.managed_tool_gateway import resolve_managed_tool_gateway

            return resolve_managed_tool_gateway("fal-queue")
        except Exception:  # noqa: BLE001 — gateway resolution is optional
            return None

    def is_available(self) -> bool:
        return bool(self._direct_key() or self._managed_gateway())

    def availability_hint(self) -> str:
        return (
            "Needs a Nous subscription (managed gateway) or FAL_KEY in ~/.hermes/.env."
        )

    # -- catalog -----------------------------------------------------------

    def catalog(self) -> List[Dict[str, Any]]:
        return [dict(m) for m in FAL_IMAGE_MODELS + FAL_VIDEO_MODELS]

    def _model(self, model_id: str) -> Dict[str, Any]:
        for entry in FAL_IMAGE_MODELS + FAL_VIDEO_MODELS:
            if entry["id"] == model_id:
                return entry
        raise MediaProviderError(f"Unknown fal model '{model_id}'")

    # -- client ------------------------------------------------------------

    def _client(self):
        """Return an object with submit(endpoint, arguments) -> handle."""
        from tools.fal_common import _ManagedFalSyncClient, import_fal_client

        fal_client = import_fal_client()
        gateway = self._managed_gateway()
        key = self._direct_key()
        if gateway is not None and not key:
            config = (gateway.gateway_origin.rstrip("/"), gateway.nous_user_token)
            with self._lock:
                if self._managed is None or self._managed_config != config:
                    self._managed = _ManagedFalSyncClient(
                        fal_client,
                        key=gateway.nous_user_token,
                        queue_run_origin=gateway.gateway_origin,
                    )
                    self._managed_config = config
                return self._managed
        if not key:
            raise MediaProviderError(self.availability_hint())
        return fal_client.SyncClient(key=key)

    # -- job loop ----------------------------------------------------------

    def _payload(self, model: Dict[str, Any], modality: str, params: Dict[str, Any]) -> tuple:
        prompt = str(params.get("prompt") or "").strip()
        if not prompt:
            raise MediaProviderError("Prompt is required")
        supports = model.get("supports", {})
        image_url = normalize_image_input(params.get("image_url")) if supports.get("image_url") else None

        if modality == "image":
            payload: Dict[str, Any] = {"prompt": prompt}
            aspect = params.get("aspect_ratio") or "16:9"
            payload["image_size"] = _FAL_IMAGE_SIZE.get(aspect, "landscape_16_9")
            if params.get("seed") is not None and supports.get("seed"):
                payload["seed"] = int(params["seed"])
            return model["id"], payload

        endpoint = model["image_endpoint"] if image_url else model["text_endpoint"]
        payload = {"prompt": prompt}
        if image_url:
            payload["image_url"] = image_url
        if supports.get("aspect_ratio") and params.get("aspect_ratio"):
            allowed = model.get("aspect_ratios")
            if not allowed or params["aspect_ratio"] in allowed:
                payload["aspect_ratio"] = params["aspect_ratio"]
        if supports.get("resolution") and params.get("resolution"):
            payload["resolution"] = params["resolution"]
        if supports.get("duration") and params.get("duration"):
            payload["duration"] = int(params["duration"])
        if supports.get("negative_prompt") and params.get("negative_prompt"):
            payload["negative_prompt"] = params["negative_prompt"]
        if supports.get("audio") and params.get("audio") is not None:
            payload["generate_audio"] = bool(params["audio"])
        if supports.get("seed") and params.get("seed") is not None:
            payload["seed"] = int(params["seed"])
        return endpoint, payload

    def submit(self, model_id: str, modality: str, params: Dict[str, Any]) -> ProviderJobRef:
        model = self._model(model_id)
        endpoint, payload = self._payload(model, modality, params)
        client = self._client()
        try:
            handle = client.submit(endpoint, arguments=payload)
        except Exception as exc:  # noqa: BLE001 — normalize to a user-facing error
            raise MediaProviderError(_fal_error_message(exc, endpoint)) from exc
        return ProviderJobRef(
            ref=json.dumps(
                {
                    "request_id": handle.request_id,
                    "response_url": handle.response_url,
                    "status_url": handle.status_url,
                    "cancel_url": handle.cancel_url,
                }
            )
        )

    def _handle(self, ref: ProviderJobRef):
        from tools.fal_common import import_fal_client

        fal_client = import_fal_client()
        data = json.loads(ref.ref)
        client = self._client()
        http_client = getattr(client, "_http_client", None) or getattr(
            getattr(client, "_sync_client", None), "_client", None
        )
        if http_client is None:
            # Direct SyncClient path — its own attribute.
            http_client = getattr(client, "_client", None)
        if http_client is None:
            raise MediaProviderError("fal client is missing its HTTP transport")
        from fal_client.client import SyncRequestHandle

        return SyncRequestHandle(
            request_id=data["request_id"],
            response_url=data["response_url"],
            status_url=data["status_url"],
            cancel_url=data["cancel_url"],
            client=http_client,
        )

    def status(self, ref: ProviderJobRef) -> JobStatus:
        import fal_client as fal_module

        handle = self._handle(ref)
        try:
            status = handle.status(with_logs=False)
        except Exception as exc:  # noqa: BLE001
            raise MediaProviderError(_fal_error_message(exc, "status")) from exc
        if isinstance(status, fal_module.Completed):
            return JobStatus(state="done")
        if isinstance(status, fal_module.Queued):
            return JobStatus(state="queued", progress=f"queue position {status.position}")
        return JobStatus(state="running")

    def result(self, ref: ProviderJobRef) -> List[str]:
        handle = self._handle(ref)
        try:
            data = handle.get()
        except Exception as exc:  # noqa: BLE001
            raise MediaProviderError(_fal_error_message(exc, "result")) from exc
        urls: List[str] = []
        for key in ("images", "videos"):
            for item in data.get(key) or []:
                url = item.get("url") if isinstance(item, dict) else None
                if url:
                    urls.append(url)
        for key in ("image", "video"):
            item = data.get(key)
            if isinstance(item, dict) and item.get("url"):
                urls.append(item["url"])
        return urls

    def cancel(self, ref: ProviderJobRef) -> bool:
        try:
            self._handle(ref).cancel()
            return True
        except Exception:  # noqa: BLE001 — best-effort
            return False


def _fal_error_message(exc: BaseException, context: str) -> str:
    from tools.fal_common import _extract_http_status

    status = _extract_http_status(exc)
    if status == 402:
        return "fal: insufficient credits (HTTP 402)."
    if status == 403:
        return f"fal: access denied for {context} (HTTP 403) — model may not be enabled on the gateway."
    if status == 422:
        return f"fal: invalid request for {context} (HTTP 422): {exc}"
    if status == 429:
        return "fal: rate limited (HTTP 429), try again shortly."
    return f"fal: {context} failed: {exc}"


# ---------------------------------------------------------------------------
# Krea — public REST API (api.krea.ai). Verified live 2026-08-11: bearer
# token auth, POST /generate/... -> {job_id}, GET /jobs/{id} -> status +
# result.urls. 402 means the separate API wallet needs a top-up.
# ---------------------------------------------------------------------------

KREA_MODELS: List[Dict[str, Any]] = [
    {
        "id": "krea/krea-2/medium-turbo",
        "display": "Krea 2 Medium Turbo",
        "modality": "image",
        "tier": "fast",
        "path": "/generate/image/krea/krea-2/medium-turbo",
        "supports": {"aspect_ratio": True, "seed": True},
        "aspect_ratios": ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"],
        "note": "Fastest Krea 2. Required: prompt, aspect_ratio, resolution 1K.",
    },
    {
        "id": "krea/krea-2/large",
        "display": "Krea 2 Large",
        "modality": "image",
        "tier": "quality",
        "path": "/generate/image/krea/krea-2/large",
        "supports": {"aspect_ratio": True, "seed": True},
        "aspect_ratios": ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"],
        "note": "Krea's flagship for expressive photorealism.",
    },
    {
        "id": "google/nano-banana-pro",
        "display": "Nano Banana Pro",
        "modality": "image",
        "tier": "quality",
        "path": "/generate/image/google/nano-banana-pro",
        "supports": {"aspect_ratio": True},
        "note": "Best-in-class typography and instruction following.",
    },
    {
        "id": "kling/kling-2.5",
        "display": "Kling 2.5",
        "modality": "video",
        "tier": "quality",
        "path": "/generate/video/kling/kling-2.5",
        "supports": {"aspect_ratio": True, "duration": True, "image_url": True},
        "durations": [5, 10],
        "note": "Strong motion quality; accepts a start image.",
    },
    {
        "id": "minimax/hailuo-2.3",
        "display": "Hailuo 2.3",
        "modality": "video",
        "tier": "fast",
        "path": "/generate/video/minimax/hailuo-2.3",
        "supports": {"duration": True, "image_url": True},
        "durations": [6, 10],
        "note": "Fast iteration video.",
    },
]

_KREA_BASE = "https://api.krea.ai"


class KreaAdapter:
    name = "krea"
    display_name = "Krea"
    deadline_s = 30 * 60

    def _token(self) -> Optional[str]:
        return os.environ.get("KREA_API_KEY") or None

    def is_available(self) -> bool:
        return bool(self._token())

    def availability_hint(self) -> str:
        return "Set KREA_API_KEY in ~/.hermes/.env (create one at krea.ai/settings/api-tokens)."

    def catalog(self) -> List[Dict[str, Any]]:
        return [dict(m) for m in KREA_MODELS]

    def _model(self, model_id: str) -> Dict[str, Any]:
        for entry in KREA_MODELS:
            if entry["id"] == model_id:
                return entry
        raise MediaProviderError(f"Unknown Krea model '{model_id}'")

    def _request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        token = self._token()
        if not token:
            raise MediaProviderError(self.availability_hint())
        request = urllib.request.Request(
            f"{_KREA_BASE}{path}",
            method=method,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            data=json.dumps(body).encode() if body is not None else None,
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode() or "{}")
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = json.loads(exc.read().decode()).get("message", "")
            except Exception:  # noqa: BLE001
                pass
            if exc.code == 402:
                raise MediaProviderError(
                    "Krea: API balance is empty (HTTP 402). Top up the API wallet at "
                    "krea.ai/settings/api-tokens — it is separate from the app's compute balance."
                ) from exc
            if exc.code in (401, 403):
                raise MediaProviderError(f"Krea: auth failed (HTTP {exc.code}). Check KREA_API_KEY.") from exc
            raise MediaProviderError(f"Krea: HTTP {exc.code} {detail or exc.reason}") from exc
        except OSError as exc:
            raise MediaProviderError(f"Krea: network error: {exc}") from exc

    def submit(self, model_id: str, modality: str, params: Dict[str, Any]) -> ProviderJobRef:
        model = self._model(model_id)
        prompt = str(params.get("prompt") or "").strip()
        if not prompt:
            raise MediaProviderError("Prompt is required")
        supports = model.get("supports", {})
        body: Dict[str, Any] = {"prompt": prompt}
        if modality == "image":
            aspect = params.get("aspect_ratio") or "16:9"
            allowed = model.get("aspect_ratios")
            if allowed and aspect not in allowed:
                aspect = allowed[0]
            if supports.get("aspect_ratio"):
                body["aspect_ratio"] = aspect
            if model["id"].startswith("krea/"):
                body["resolution"] = "1K"
        else:
            if supports.get("duration") and params.get("duration"):
                body["duration"] = int(params["duration"])
            if supports.get("aspect_ratio") and params.get("aspect_ratio"):
                body["aspect_ratio"] = params["aspect_ratio"]
            start_image = normalize_image_input(params.get("image_url")) if supports.get("image_url") else None
            if start_image:
                body["start_image"] = start_image
        if supports.get("seed") and params.get("seed") is not None:
            body["seed"] = int(params["seed"])
        data = self._request("POST", model["path"], body)
        job_id = data.get("job_id")
        if not job_id:
            raise MediaProviderError(f"Krea: submit returned no job_id: {data}")
        return ProviderJobRef(ref=str(job_id))

    def status(self, ref: ProviderJobRef) -> JobStatus:
        data = self._request("GET", f"/jobs/{ref.ref}")
        state = str(data.get("status") or "")
        if state == "completed":
            return JobStatus(state="done")
        if state == "failed":
            error = data.get("error") or {}
            code = error.get("code", "unknown") if isinstance(error, dict) else str(error)
            return JobStatus(state="failed", error=f"Krea job failed ({code})")
        if state in ("pending", "queued"):
            return JobStatus(state="queued")
        return JobStatus(state="running")

    def result(self, ref: ProviderJobRef) -> List[str]:
        data = self._request("GET", f"/jobs/{ref.ref}")
        result = data.get("result") or {}
        urls = result.get("urls") or []
        return [u for u in urls if isinstance(u, str)]

    def cancel(self, ref: ProviderJobRef) -> bool:
        try:
            self._request("DELETE", f"/jobs/{ref.ref}")
            return True
        except MediaProviderError:
            return False


def build_providers() -> Dict[str, Any]:
    return {adapter.name: adapter for adapter in (FalAdapter(), KreaAdapter())}
