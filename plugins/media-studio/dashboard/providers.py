"""Media Studio provider adapters.

Each adapter implements the narrow contract the engine consumes:

    name / display_name / is_available()
    catalog()                       -> [ModelInfo dict]
    submit(model, modality, params) -> ProviderJobRef
    status(ref)                     -> JobStatus
    result(ref)                     -> [url]
    cancel(ref)                     -> bool

Adapters normalize the CORE param set (prompt, image_url, aspect_ratio,
resolution, duration, seed, negative_prompt, audio) and translate it into
each endpoint's real schema. Payload shapes were harvested from fal's
per-endpoint OpenAPI (https://fal.ai/api/openapi/queue/openapi.json), not
invented — see /tmp/fal_schemas or the repo docs for the raw dumps.

Catalog dicts carry UI-facing capability data (supports/aspect_ratios/
resolutions/durations/requires) plus private payload-translation fields
(payload_style, *_param, *_endpoint) the frontend ignores.
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


def _fit_image_for_wire(path, cap: int) -> tuple:
    """Re-encode a COPY of an oversized input so it fits the data-URI cap.

    The file on disk is never modified — this only shapes the bytes that ride
    the request. Strategy: keep full resolution and try high-quality JPEG
    first (a 2K/4K PNG is usually 3-6x larger than a q92 JPEG of the same
    pixels); step the long edge down only when that still doesn't fit. Alpha
    sources stay PNG so transparency survives. Returns (bytes, mime).
    """
    import io

    from PIL import Image

    with Image.open(path) as img:
        img.load()
        mode_alpha = img.mode in ("RGBA", "LA") or (
            img.mode == "P" and "transparency" in img.info
        )
        # Mode alone over-reports: clipboard/screenshot PNGs carry a fully
        # opaque alpha channel. Only real transparency forces the PNG path.
        has_alpha = False
        if mode_alpha:
            rgba = img.convert("RGBA")
            extrema = rgba.getchannel("A").getextrema()
            # getextrema() on a single band returns (min, max) ints.
            alpha_min = extrema[0] if isinstance(extrema, tuple) else extrema
            has_alpha = float(alpha_min) < 255  # type: ignore[arg-type]
            base = rgba if has_alpha else rgba.convert("RGB")
        else:
            base = img.convert("RGB")

    for long_edge in (None, 4096, 3072, 2048, 1536):
        frame = base
        if long_edge is not None and max(base.size) > long_edge:
            scale = long_edge / max(base.size)
            frame = base.resize(
                (max(1, round(base.width * scale)), max(1, round(base.height * scale))),
                Image.Resampling.LANCZOS,
            )
        candidates = (
            [("PNG", {"optimize": True})]
            if has_alpha
            else [("JPEG", {"quality": 92}), ("JPEG", {"quality": 85})]
        )
        for fmt, kwargs in candidates:
            buf = io.BytesIO()
            frame.save(buf, fmt, **kwargs)
            if buf.tell() <= cap:
                logger.info(
                    "media-studio: input %s re-encoded for the wire (%s, %dpx long edge, %dKB)",
                    path.name, fmt, max(frame.size), buf.tell() // 1024,
                )
                return buf.getvalue(), ("image/png" if fmt == "PNG" else "image/jpeg")

    raise MediaProviderError(
        f"Input image can't be fit under {cap // (1024 * 1024)}MB even at 1536px — use a smaller source"
    )


def normalize_image_input(value: Optional[str]) -> Optional[str]:
    """Accept http(s)/data URLs as-is; convert a LOCAL FILE PATH (the library
    chaining case) to a base64 data URI both fal and Krea accept. Oversized
    files are transparently re-encoded for the wire (original untouched)."""
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
        data, mime = _fit_image_for_wire(path, _MAX_INPUT_IMAGE_BYTES)
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def _normalize_image_inputs(value: Any, model: Dict[str, Any]) -> List[str]:
    """Normalize one-or-many reference images. The UI sends a list when the
    model declares `max_images` > 1 (multi-reference edits — NBP composes up
    to 8); a plain string stays the single-image path. Order is preserved
    (reference order matters to composition models)."""
    raw = value if isinstance(value, (list, tuple)) else [value]
    urls = [u for u in (normalize_image_input(v) for v in raw if v) if u]
    cap = int(model.get("max_images") or 1)
    if len(urls) > cap:
        raise MediaProviderError(
            f"{model.get('display') or model.get('id')} accepts at most {cap} reference image(s); got {len(urls)}"
        )
    return urls


# ---------------------------------------------------------------------------
# FAL — through the Nous managed fal-queue gateway (no key needed for
# subscribers) or direct FAL_KEY. Reuses the exact client plumbing the
# in-tree image/video tools use.
#
# Catalog mirrors the Tool Gateway's enabled pricing rules (2026-08-12):
# every live image/video endpoint is represented except
#   - openai/gpt-image-2 (billing alias of fal-ai/gpt-image-2)
#   - fal-ai/seedvr/upscale/video (needs video-upload plumbing; later)
# Edit endpoints fold into their base model via `edit_endpoint` — chaining a
# start image routes there automatically.
# ---------------------------------------------------------------------------

_PRESET_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4"]
_NANO_ASPECTS = ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"]

FAL_IMAGE_MODELS: List[Dict[str, Any]] = [
    {
        "id": "fal-ai/nano-banana-pro",
        "display": "Nano Banana Pro",
        "modality": "image",
        "tier": "quality",
        "payload_style": "aspect",
        "edit_endpoint": "fal-ai/nano-banana-pro/edit",
        "edit_requires_key": True,
        "max_images": 8,
        "supports": {"aspect_ratio": True, "resolution": True, "seed": True, "image_url": True},
        "aspect_ratios": _NANO_ASPECTS,
        "resolutions": ["1K", "2K", "4K"],
        "note": (
            "Gemini 3 Pro Image — best-in-class typography. 4K costs ~2x. Edits aren't "
            "priced on the portal gateway yet (needs FAL_KEY, or Krea's NBP)."
        ),
    },
    {
        "id": "fal-ai/nano-banana-2",
        "display": "Nano Banana 2",
        "modality": "image",
        "tier": "quality",
        "payload_style": "aspect",
        "edit_endpoint": "fal-ai/nano-banana-2/edit",
        "max_images": 4,
        "supports": {"aspect_ratio": True, "resolution": True, "seed": True, "image_url": True},
        "aspect_ratios": ["auto"] + _NANO_ASPECTS,
        "resolutions": ["0.5K", "1K", "2K", "4K"],
        "note": "Gemini 3 image. Start image routes to the edit endpoint.",
    },
    {
        "id": "google/nano-banana-2-lite",
        "display": "Nano Banana 2 Lite",
        "modality": "image",
        "tier": "fast",
        "payload_style": "aspect",
        "edit_endpoint": "google/nano-banana-2-lite/edit",
        "supports": {"aspect_ratio": True, "seed": True, "image_url": True},
        "aspect_ratios": ["auto"] + _NANO_ASPECTS,
        "note": "Cheapest Gemini-family image; edits too.",
    },
    {
        "id": "fal-ai/nano-banana",
        "display": "Nano Banana",
        "modality": "image",
        "tier": "fast",
        "payload_style": "aspect",
        "supports": {"aspect_ratio": True, "seed": True},
        "aspect_ratios": _NANO_ASPECTS,
        "note": "First-gen Gemini image — cheap and quick.",
    },
    {
        "id": "fal-ai/flux-2/klein/9b",
        "display": "FLUX 2 Klein 9B",
        "modality": "image",
        "tier": "fast",
        "supports": {"aspect_ratio": True, "seed": True},
        "aspect_ratios": _PRESET_ASPECTS,
        "note": "Default Hermes image model. Fast, strong aesthetics.",
    },
    {
        "id": "fal-ai/flux-2-pro",
        "display": "FLUX 2 Pro",
        "modality": "image",
        "tier": "quality",
        "supports": {"aspect_ratio": True, "seed": True},
        "aspect_ratios": _PRESET_ASPECTS,
        "note": "Higher fidelity, slower.",
    },
    {
        "id": "fal-ai/gpt-image-2",
        "display": "GPT Image 2",
        "modality": "image",
        "tier": "quality",
        "resolution_param": "quality",
        "supports": {"aspect_ratio": True, "resolution": True},
        "aspect_ratios": _PRESET_ASPECTS,
        "resolutions": ["auto", "low", "medium", "high"],
        "note": "OpenAI's latest image model. The quality knob is the cost knob.",
    },
    {
        "id": "fal-ai/gpt-image-1.5",
        "display": "GPT Image 1.5",
        "modality": "image",
        "tier": "fast",
        "payload_style": "pixels",
        "resolution_param": "quality",
        "supports": {"aspect_ratio": True, "resolution": True},
        "aspect_ratios": ["1:1", "3:2", "2:3"],
        "resolutions": ["low", "medium", "high"],
        "note": "Previous OpenAI image gen; cheaper.",
    },
    {
        "id": "fal-ai/ideogram/v3",
        "display": "Ideogram v3",
        "modality": "image",
        "tier": "quality",
        "supports": {"aspect_ratio": True, "seed": True, "negative_prompt": True},
        "aspect_ratios": _PRESET_ASPECTS,
        "note": "Typography and design strength.",
    },
    {
        "id": "ideogram/v4/fast",
        "display": "Ideogram v4 Fast",
        "modality": "image",
        "tier": "fast",
        "supports": {"aspect_ratio": True, "seed": True},
        "aspect_ratios": _PRESET_ASPECTS,
        "note": "New Ideogram generation, speed tier.",
    },
    {
        "id": "ideogram/v4/instant",
        "display": "Ideogram v4 Instant",
        "modality": "image",
        "tier": "fast",
        "supports": {"aspect_ratio": True, "seed": True},
        "aspect_ratios": _PRESET_ASPECTS,
        "note": "Fastest Ideogram; near-realtime.",
    },
    {
        "id": "bytedance/seedream/v5/pro/text-to-image",
        "display": "Seedream v5 Pro",
        "modality": "image",
        "tier": "quality",
        "payload_style": "seedream",
        "edit_endpoint": "bytedance/seedream/v5/pro/edit",
        "supports": {"aspect_ratio": True, "resolution": True, "image_url": True},
        "aspect_ratios": _PRESET_ASPECTS,
        "resolutions": ["1K", "2K"],
        "note": "ByteDance flagship; strong realism. Start image = edit mode.",
    },
    {
        "id": "bytedance/seedream/v5/lite/text-to-image",
        "display": "Seedream v5 Lite",
        "modality": "image",
        "tier": "fast",
        "payload_style": "seedream",
        "supports": {"aspect_ratio": True, "resolution": True},
        "aspect_ratios": _PRESET_ASPECTS,
        "resolutions": ["2K", "3K", "4K"],
        "note": "Cheap Seedream; up to 4K.",
    },
    {
        "id": "alibaba/qwen-image-3/text-to-image",
        "display": "Qwen Image 3",
        "modality": "image",
        "tier": "quality",
        "edit_endpoint": "alibaba/qwen-image-3/edit",
        "supports": {"aspect_ratio": True, "seed": True, "negative_prompt": True, "image_url": True},
        "aspect_ratios": _PRESET_ASPECTS,
        "note": "Strong text rendering; edits with a start image.",
    },
    {
        "id": "fal-ai/qwen-image",
        "display": "Qwen Image",
        "modality": "image",
        "tier": "fast",
        "supports": {"aspect_ratio": True, "seed": True, "negative_prompt": True},
        "aspect_ratios": _PRESET_ASPECTS,
        "note": "Previous Qwen generation.",
    },
    {
        "id": "fal-ai/recraft/v4/pro/text-to-image",
        "display": "Recraft v4 Pro",
        "modality": "image",
        "tier": "quality",
        "supports": {"aspect_ratio": True},
        "aspect_ratios": _PRESET_ASPECTS,
        "note": "Design/brand-asset strength (vector-style, layouts).",
    },
    {
        "id": "fal-ai/recraft/v4.1/text-to-image",
        "display": "Recraft v4.1",
        "modality": "image",
        "tier": "quality",
        "supports": {"aspect_ratio": True},
        "aspect_ratios": _PRESET_ASPECTS,
        "note": "Latest Recraft tuning.",
    },
    {
        "id": "fal-ai/z-image/turbo",
        "display": "Z-Image Turbo",
        "modality": "image",
        "tier": "fast",
        "supports": {"aspect_ratio": True, "seed": True},
        "aspect_ratios": _PRESET_ASPECTS,
        "note": "8-step turbo model — very cheap drafts.",
    },
    {
        "id": "microsoft/mai-image-2.5-pro",
        "display": "MAI Image 2.5 Pro",
        "modality": "image",
        "tier": "quality",
        "payload_style": "aspect",
        "supports": {"aspect_ratio": True},
        "aspect_ratios": ["auto", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
        "note": "Microsoft's image model.",
    },
    {
        "id": "fal-ai/krea/v2/large/text-to-image",
        "display": "Krea 2 Large (via fal)",
        "modality": "image",
        "tier": "quality",
        "payload_style": "aspect",
        "supports": {"aspect_ratio": True, "seed": True},
        "aspect_ratios": ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"],
        "note": "Krea's flagship, billed through portal credits here.",
    },
    {
        "id": "fal-ai/krea/v2/medium/text-to-image",
        "display": "Krea 2 Medium (via fal)",
        "modality": "image",
        "tier": "fast",
        "payload_style": "aspect",
        "supports": {"aspect_ratio": True, "seed": True},
        "aspect_ratios": ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"],
        "note": "Krea 2 mid-size, portal credits.",
    },
    {
        "id": "fal-ai/clarity-upscaler",
        "display": "Clarity Upscaler",
        "modality": "image",
        "tier": "fast",
        "payload_style": "clarity",
        "resolution_param": "upscale_factor",
        "requires": {"prompt": False, "image_url": True},
        "supports": {"resolution": True, "seed": True, "image_url": True},
        "resolutions": ["2x", "4x"],
        "note": "Upscale/enhance an existing image — chain from the library. Prompt optional.",
    },
]

FAL_VIDEO_MODELS: List[Dict[str, Any]] = [
    {
        "id": "veo3.1",
        "display": "Veo 3.1",
        "modality": "video",
        "tier": "quality",
        "text_endpoint": "fal-ai/veo3.1",
        "image_endpoint": "fal-ai/veo3.1/image-to-video",
        "duration_format": "suffix",
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
        "resolutions": ["720p", "1080p", "4k"],
        "durations": [4, 6, 8],
        "note": "Best overall quality; native audio; up to 4K.",
    },
    {
        "id": "flux-3-video",
        "display": "FLUX 3 Video",
        "modality": "video",
        "tier": "quality",
        "text_endpoint": "blackforestlabs/flux-3/text-to-video",
        "image_endpoint": "blackforestlabs/flux-3/image-to-video",
        "duration_format": "int",
        "supports": {
            "aspect_ratio": True,
            "resolution": True,
            "duration": True,
            "audio": True,
            "image_url": True,
        },
        "aspect_ratios": ["auto", "21:9", "2:1", "16:9", "4:3", "1:1", "3:4", "9:16"],
        "resolutions": ["720p", "1080p"],
        "durations": [5, 8, 10, 15],
        "note": "Black Forest Labs video with audio; up to 15s.",
    },
    {
        "id": "seedance-2.5",
        "display": "Seedance 2.5",
        "modality": "video",
        "tier": "quality",
        "text_endpoint": "bytedance/seedance-2.5/text-to-video",
        "image_endpoint": "bytedance/seedance-2.5/image-to-video",
        "duration_format": "str",
        "supports": {
            "aspect_ratio": True,
            "resolution": True,
            "duration": True,
            "audio": True,
            "image_url": True,
        },
        "aspect_ratios": ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        "resolutions": ["480p", "720p"],
        "durations": [4, 6, 8, 10],
        "note": "Latest Seedance; excellent motion.",
    },
    {
        "id": "seedance-2.0",
        "display": "Seedance 2.0",
        "modality": "video",
        "tier": "quality",
        "text_endpoint": "bytedance/seedance-2.0/text-to-video",
        "image_endpoint": "bytedance/seedance-2.0/image-to-video",
        "duration_format": "str",
        "supports": {
            "aspect_ratio": True,
            "resolution": True,
            "duration": True,
            "audio": True,
            "image_url": True,
        },
        "aspect_ratios": ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        "resolutions": ["480p", "720p", "1080p", "4k"],
        "durations": [4, 6, 8, 10],
        "note": "Full-size Seedance; up to 4K.",
    },
    {
        "id": "seedance-2.0-mini",
        "display": "Seedance 2.0 Mini",
        "modality": "video",
        "tier": "fast",
        "text_endpoint": "bytedance/seedance-2.0/mini/text-to-video",
        "image_endpoint": "bytedance/seedance-2.0/mini/image-to-video",
        "duration_format": "str",
        "supports": {
            "aspect_ratio": True,
            "resolution": True,
            "duration": True,
            "audio": True,
            "image_url": True,
        },
        "aspect_ratios": ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        "resolutions": ["480p", "720p"],
        "durations": [4, 6, 8, 10],
        "note": "Cheap Seedance for iteration.",
    },
    {
        "id": "kling-v3-4k",
        "display": "Kling v3 4K",
        "modality": "video",
        "tier": "quality",
        "text_endpoint": "fal-ai/kling-video/v3/4k/text-to-video",
        "image_endpoint": "fal-ai/kling-video/v3/4k/image-to-video",
        "duration_format": "str",
        "image_param": "start_image_url",
        "requires": {"prompt": False},
        "supports": {
            "aspect_ratio": True,
            "duration": True,
            "audio": True,
            "negative_prompt": True,
            "image_url": True,
        },
        "aspect_ratios": ["16:9", "9:16", "1:1"],
        "durations": [5, 8, 10],
        "note": "Kling's 4K tier; strong cinematography. Prompt optional with a start image.",
    },
    {
        "id": "ltx-2.3-22b",
        "display": "LTX 2.3 22B",
        "modality": "video",
        "tier": "fast",
        "text_endpoint": "fal-ai/ltx-2.3-22b/text-to-video",
        "image_endpoint": "fal-ai/ltx-2.3-22b/image-to-video",
        "size_param": "video_size",
        "supports": {
            "aspect_ratio": True,
            "audio": True,
            "negative_prompt": True,
            "seed": True,
            "image_url": True,
        },
        "aspect_ratios": _PRESET_ASPECTS,
        "note": "Open-source 22B; fast with native audio.",
    },
    {
        "id": "pixverse-v6",
        "display": "Pixverse v6",
        "modality": "video",
        "tier": "fast",
        "text_endpoint": "fal-ai/pixverse/v6/text-to-video",
        "image_endpoint": "fal-ai/pixverse/v6/image-to-video",
        "duration_format": "int",
        "audio_param": "generate_audio_switch",
        "supports": {
            "aspect_ratio": True,
            "resolution": True,
            "duration": True,
            "audio": True,
            "negative_prompt": True,
            "seed": True,
            "image_url": True,
        },
        "aspect_ratios": ["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9"],
        "resolutions": ["360p", "540p", "720p", "1080p"],
        "durations": [5, 8],
        "note": "Cheap and quick.",
    },
    {
        "id": "happy-horse",
        "display": "Happy Horse",
        "modality": "video",
        "tier": "quality",
        "text_endpoint": "alibaba/happy-horse/text-to-video",
        "image_endpoint": "alibaba/happy-horse/image-to-video",
        "duration_format": "int",
        "requires": {"prompt": False},
        "supports": {
            "aspect_ratio": True,
            "resolution": True,
            "duration": True,
            "seed": True,
            "image_url": True,
        },
        "aspect_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4"],
        "resolutions": ["720p", "1080p"],
        "durations": [5, 8, 10, 14],
        "note": "Alibaba's latest (Wan family); up to 14s. Prompt optional with a start image.",
    },
    {
        "id": "gemini-omni-flash",
        "display": "Gemini Omni Flash",
        "modality": "video",
        "tier": "fast",
        "text_endpoint": None,
        "image_endpoint": "google/gemini-omni-flash/image-to-video",
        "duration_format": "int",
        "i2v_aspect": True,
        "requires": {"image_url": True},
        "supports": {"aspect_ratio": True, "duration": True, "image_url": True},
        "aspect_ratios": ["16:9", "9:16"],
        "durations": [8],
        "note": "Image-to-video only — animate a start image.",
    },
    {
        "id": "minimax-h3",
        "display": "MiniMax H3",
        "modality": "video",
        "tier": "quality",
        "text_endpoint": "minimax/h3/text-to-video",
        "image_endpoint": "minimax/h3/image-to-video",
        "supports": {"aspect_ratio": True, "resolution": True, "image_url": True},
        "aspect_ratios": ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        "resolutions": ["768P", "2K", "4K"],
        "note": "Hailuo successor; up to 4K.",
    },
    {
        "id": "grok-imagine-v1.5",
        "display": "Grok Imagine v1.5",
        "modality": "video",
        "tier": "fast",
        "text_endpoint": "xai/grok-imagine-video/v1.5/text-to-video",
        "image_endpoint": "xai/grok-imagine-video/v1.5/image-to-video",
        "supports": {"aspect_ratio": True, "resolution": True, "image_url": True},
        "aspect_ratios": ["16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16"],
        "resolutions": ["480p", "720p", "1080p"],
        "note": "xAI's video model; quick 6s clips.",
    },
]

# FLUX-style image_size presets keyed by the UI's aspect value.
_FAL_IMAGE_SIZE = {
    "1:1": "square_hd",
    "16:9": "landscape_16_9",
    "9:16": "portrait_16_9",
    "4:3": "landscape_4_3",
    "3:4": "portrait_4_3",
}

# gpt-image-1.5 takes literal pixel dimensions.
_GPT15_PIXELS = {"1:1": "1024x1024", "3:2": "1536x1024", "2:3": "1024x1536"}


def _prompt_required(model: Dict[str, Any]) -> bool:
    return bool(model.get("requires", {}).get("prompt", True))


def _image_required(model: Dict[str, Any]) -> bool:
    return bool(model.get("requires", {}).get("image_url", False))


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

    # -- payload builders ----------------------------------------------------

    def _image_payload(self, model: Dict[str, Any], params: Dict[str, Any]) -> tuple:
        supports = model.get("supports", {})
        prompt = str(params.get("prompt") or "").strip()
        if not prompt and _prompt_required(model):
            raise MediaProviderError("Prompt is required")
        image_urls = (
            _normalize_image_inputs(params.get("image_url"), model) if supports.get("image_url") else []
        )
        image_url = image_urls[0] if image_urls else None
        if _image_required(model) and not image_url:
            raise MediaProviderError(f"{model['display']} needs a start image — pick one from the library")

        payload: Dict[str, Any] = {}
        if prompt:
            payload["prompt"] = prompt

        style = model.get("payload_style", "presets")
        aspect = str(params.get("aspect_ratio") or "").strip()
        allowed = model.get("aspect_ratios") or []
        if aspect and allowed and aspect not in allowed:
            aspect = ""

        resolution = str(params.get("resolution") or "").strip()
        allowed_res = model.get("resolutions") or []
        if resolution and allowed_res and resolution not in allowed_res:
            resolution = ""
        res_param = model.get("resolution_param", "resolution")

        endpoint = model["id"]

        if style == "clarity":
            # Enhancement endpoint: single image_url + numeric upscale_factor.
            payload["image_url"] = image_url
            if resolution:
                payload["upscale_factor"] = float(resolution.rstrip("x"))
        elif style == "aspect":
            if supports.get("aspect_ratio"):
                payload["aspect_ratio"] = aspect or (allowed[0] if allowed else "1:1")
            if supports.get("resolution") and resolution:
                payload[res_param] = resolution
        elif style == "pixels":
            payload["image_size"] = _GPT15_PIXELS.get(aspect, "1024x1024")
            if supports.get("resolution") and resolution:
                payload[res_param] = resolution
        elif style == "seedream":
            # Seedream: image_size is either an auto_NK resolution or a preset.
            if resolution:
                payload["image_size"] = f"auto_{resolution}"
            elif aspect:
                payload["image_size"] = _FAL_IMAGE_SIZE.get(aspect, "auto_2K")
        else:  # presets
            payload["image_size"] = _FAL_IMAGE_SIZE.get(aspect, "landscape_16_9")
            if supports.get("resolution") and resolution:
                payload[res_param] = resolution

        if supports.get("negative_prompt") and str(params.get("negative_prompt") or "").strip():
            payload["negative_prompt"] = str(params["negative_prompt"]).strip()
        if supports.get("seed") and params.get("seed") is not None:
            payload["seed"] = int(params["seed"])

        # A start image on an editing-capable model routes to the edit
        # endpoint, which takes image_urls (array — multi-reference edits
        # compose several inputs; order preserved).
        if image_url and style != "clarity":
            edit = model.get("edit_endpoint")
            if edit:
                # NBP's edit endpoint exists on fal but has no gateway pricing
                # rule yet — a managed submit dies in billing. Fail fast with
                # the real alternatives instead.
                if model.get("edit_requires_key") and not self._direct_key():
                    raise MediaProviderError(
                        f"{model['display']} edits aren't priced on the portal gateway yet. "
                        "Use Nano Banana 2 for edits, add FAL_KEY for direct fal billing, "
                        "or use Nano Banana Pro (Krea) with a Krea API key."
                    )
                endpoint = edit
                payload["image_urls"] = image_urls
                # Edit endpoints reject text-to-image sizing params.
                payload.pop("image_size", None)

        return endpoint, payload

    def _video_payload(self, model: Dict[str, Any], params: Dict[str, Any]) -> tuple:
        supports = model.get("supports", {})
        prompt = str(params.get("prompt") or "").strip()
        image_url = (
            normalize_image_input(params.get("image_url")) if supports.get("image_url") else None
        )
        if _image_required(model) and not image_url:
            raise MediaProviderError(f"{model['display']} needs a start image — pick one from the library")
        if not prompt and not (image_url and not _prompt_required(model)):
            raise MediaProviderError("Prompt is required")

        endpoint = model["image_endpoint"] if image_url else model.get("text_endpoint")
        if not endpoint:
            raise MediaProviderError(f"{model['display']} needs a start image — pick one from the library")

        payload: Dict[str, Any] = {}
        if prompt:
            payload["prompt"] = prompt
        if image_url:
            payload[model.get("image_param", "image_url")] = image_url

        # Aspect belongs to text-to-video (the start image fixes framing),
        # except models that explicitly take it on i2v.
        aspect = str(params.get("aspect_ratio") or "").strip()
        allowed = model.get("aspect_ratios") or []
        if supports.get("aspect_ratio") and aspect and (not allowed or aspect in allowed):
            if not image_url or model.get("i2v_aspect"):
                payload["aspect_ratio"] = aspect

        size_param = model.get("size_param")
        if size_param and not image_url:
            # LTX-style: video_size presets instead of aspect_ratio.
            payload.pop("aspect_ratio", None)
            if aspect:
                payload[size_param] = _FAL_IMAGE_SIZE.get(aspect, "landscape_16_9")

        resolution = str(params.get("resolution") or "").strip()
        allowed_res = model.get("resolutions") or []
        if supports.get("resolution") and resolution and (not allowed_res or resolution in allowed_res):
            payload["resolution"] = resolution

        if supports.get("duration") and params.get("duration"):
            value = int(params["duration"])
            fmt = model.get("duration_format", "int")
            payload["duration"] = (
                f"{value}s" if fmt == "suffix" else str(value) if fmt == "str" else value
            )

        if supports.get("negative_prompt") and str(params.get("negative_prompt") or "").strip():
            payload["negative_prompt"] = str(params["negative_prompt"]).strip()
        if supports.get("audio") and params.get("audio") is not None:
            payload[model.get("audio_param", "generate_audio")] = bool(params["audio"])
        if supports.get("seed") and params.get("seed") is not None:
            payload["seed"] = int(params["seed"])

        return endpoint, payload

    def _payload(self, model: Dict[str, Any], modality: str, params: Dict[str, Any]) -> tuple:
        if modality == "image":
            return self._image_payload(model, params)
        return self._video_payload(model, params)

    # -- job loop ----------------------------------------------------------

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
# Krea — two routes into the same REST contract:
#
#   MANAGED (Nous subscribers, portal credits): the krea-gateway passthrough
#   at {scheme}://krea-gateway.{domain}, bearer = Nous access token. Serves
#   the krea-2 image models (base tier). Verified live 2026-08-12: same
#   /generate/... POST -> {job_id}, /jobs/{id} GET shapes as the direct API.
#
#   DIRECT (BYOK, Krea's separate API wallet): api.krea.ai with KREA_API_KEY.
#   Unlocks the direct-only models (Nano Banana Pro via Krea, Kling, Hailuo).
#
# Jobs remember which route issued them (ref JSON carries "via"), so status/
# result/cancel always poll the same billing surface. Legacy plain-string
# refs from pre-managed builds resolve as direct.
# ---------------------------------------------------------------------------

KREA_MODELS: List[Dict[str, Any]] = [
    {
        "id": "krea/krea-2/medium-turbo",
        "display": "Krea 2 Medium Turbo",
        "modality": "image",
        "tier": "fast",
        "path": "/generate/image/krea/krea-2/medium-turbo",
        "managed": True,
        "supports": {"aspect_ratio": True, "seed": True},
        "aspect_ratios": ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"],
        "note": "Fastest Krea 2. Portal credits for subscribers.",
    },
    {
        "id": "krea/krea-2/medium",
        "display": "Krea 2 Medium",
        "modality": "image",
        "tier": "fast",
        "path": "/generate/image/krea/krea-2/medium",
        "managed": True,
        "supports": {"aspect_ratio": True, "seed": True},
        "aspect_ratios": ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"],
        "note": "Krea 2 mid-size. Portal credits for subscribers.",
    },
    {
        "id": "krea/krea-2/large",
        "display": "Krea 2 Large",
        "modality": "image",
        "tier": "quality",
        "path": "/generate/image/krea/krea-2/large",
        "managed": True,
        "supports": {"aspect_ratio": True, "seed": True},
        "aspect_ratios": ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"],
        "note": "Krea's flagship for expressive photorealism. Portal credits.",
    },
    {
        "id": "google/nano-banana-pro",
        "display": "Nano Banana Pro (Krea)",
        "modality": "image",
        "tier": "quality",
        "path": "/generate/image/google/nano-banana-pro",
        "max_images": 8,
        "supports": {"aspect_ratio": True, "resolution": True, "image_url": True},
        "aspect_ratios": ["21:9", "1:1", "4:3", "3:2", "2:3", "5:4", "4:5", "3:4", "16:9", "9:16"],
        "resolutions": ["1K", "2K", "4K"],
        "note": "Needs a Krea API key (separate wallet). Takes input images here — also on fal via portal credits (text-only).",
    },
    {
        "id": "kling/kling-2.5",
        "display": "Kling 2.5",
        "modality": "video",
        "tier": "quality",
        "path": "/generate/video/kling/kling-2.5",
        "supports": {"aspect_ratio": True, "duration": True, "image_url": True},
        "durations": [5, 10],
        "note": "Needs a Krea API key. Strong motion; accepts a start image.",
    },
    {
        "id": "minimax/hailuo-2.3",
        "display": "Hailuo 2.3",
        "modality": "video",
        "tier": "fast",
        "path": "/generate/video/minimax/hailuo-2.3",
        "supports": {"duration": True, "image_url": True},
        "durations": [6, 10],
        "note": "Needs a Krea API key. Fast iteration video.",
    },
]

_KREA_BASE = "https://api.krea.ai"


class KreaAdapter:
    name = "krea"
    display_name = "Krea"
    deadline_s = 30 * 60

    def _token(self) -> Optional[str]:
        return os.environ.get("KREA_API_KEY") or None

    def _managed_gateway(self):
        try:
            from tools.managed_tool_gateway import resolve_managed_tool_gateway

            return resolve_managed_tool_gateway("krea")
        except Exception:  # noqa: BLE001 — gateway resolution is optional
            return None

    def is_available(self) -> bool:
        return bool(self._token() or self._managed_gateway())

    def availability_hint(self) -> str:
        return (
            "Nous subscribers get the Krea 2 models via portal credits. Add a "
            "KREA_API_KEY (krea.ai/settings/api-tokens) to unlock Nano Banana "
            "Pro, Kling and Hailuo through Krea's own API wallet."
        )

    def catalog(self) -> List[Dict[str, Any]]:
        has_key = bool(self._token())
        has_managed = self._managed_gateway() is not None
        out = []
        for entry in KREA_MODELS:
            if not entry.get("managed") and not has_key and has_managed:
                # Subscriber without a BYOK key: only the managed models are
                # callable — hide the wallet-only rows instead of 401-baiting.
                continue
            out.append(dict(entry))
        return out

    def _model(self, model_id: str) -> Dict[str, Any]:
        for entry in KREA_MODELS:
            if entry["id"] == model_id:
                return entry
        raise MediaProviderError(f"Unknown Krea model '{model_id}'")

    def _route(self, model: Dict[str, Any]) -> tuple:
        """Pick (base_url, bearer, via) for a model. Managed-capable models
        prefer the gateway (portal credits, no wallet involved) whenever it
        resolves; the BYOK key serves the wallet-only models. A key holder
        without a subscription still gets everything direct."""
        if model.get("managed"):
            gateway = self._managed_gateway()
            if gateway is not None:
                return gateway.gateway_origin.rstrip("/"), gateway.nous_user_token, "managed"
        key = self._token()
        if key:
            return _KREA_BASE, key, "direct"
        raise MediaProviderError(self.availability_hint())

    def _route_for_via(self, via: str) -> tuple:
        if via == "managed":
            gateway = self._managed_gateway()
            if gateway is None:
                raise MediaProviderError("Krea: managed gateway unavailable (sign in to Nous)")
            return gateway.gateway_origin.rstrip("/"), gateway.nous_user_token
        key = self._token()
        if not key:
            raise MediaProviderError("Krea: KREA_API_KEY missing for a direct-API job")
        return _KREA_BASE, key

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        base: str = _KREA_BASE,
        bearer: Optional[str] = None,
    ) -> Dict[str, Any]:
        token = bearer or self._token()
        if not token:
            raise MediaProviderError(self.availability_hint())
        request = urllib.request.Request(
            f"{base}{path}",
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
                raw = json.loads(exc.read().decode())
                detail = raw.get("message", "") or (raw.get("error") or {}).get("message", "")
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
            if supports.get("resolution") and params.get("resolution"):
                allowed_res = model.get("resolutions")
                if not allowed_res or params["resolution"] in allowed_res:
                    body["resolution"] = params["resolution"]
            if model["id"].startswith("krea/"):
                # krea-2's schema requires resolution and only accepts 1K.
                body["resolution"] = "1K"
            # Krea's image schemas take image prompts as image_urls[] (data
            # URIs accepted) — NBP edit-style input rides this, including
            # multi-reference composition when the model allows it.
            input_images = (
                _normalize_image_inputs(params.get("image_url"), model) if supports.get("image_url") else []
            )
            if input_images:
                body["image_urls"] = input_images
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
        base, bearer, via = self._route(model)
        data = self._request("POST", model["path"], body, base=base, bearer=bearer)
        job_id = data.get("job_id")
        if not job_id:
            raise MediaProviderError(f"Krea: submit returned no job_id: {data}")
        return ProviderJobRef(ref=json.dumps({"id": str(job_id), "via": via}))

    def _parse_ref(self, ref: ProviderJobRef) -> tuple:
        """Return (job_id, base, bearer). Legacy refs are plain job-id strings
        from pre-managed builds — those were all direct-API jobs."""
        try:
            data = json.loads(ref.ref)
        except (TypeError, ValueError):
            data = None
        if isinstance(data, dict) and data.get("id"):
            base, bearer = self._route_for_via(str(data.get("via") or "direct"))
            return str(data["id"]), base, bearer
        base, bearer = self._route_for_via("direct")
        return str(ref.ref), base, bearer

    def status(self, ref: ProviderJobRef) -> JobStatus:
        job_id, base, bearer = self._parse_ref(ref)
        data = self._request("GET", f"/jobs/{job_id}", base=base, bearer=bearer)
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
        job_id, base, bearer = self._parse_ref(ref)
        data = self._request("GET", f"/jobs/{job_id}", base=base, bearer=bearer)
        result = data.get("result") or {}
        urls = result.get("urls") or []
        return [u for u in urls if isinstance(u, str)]

    def cancel(self, ref: ProviderJobRef) -> bool:
        try:
            job_id, base, bearer = self._parse_ref(ref)
            self._request("DELETE", f"/jobs/{job_id}", base=base, bearer=bearer)
            return True
        except MediaProviderError:
            return False


def build_providers() -> Dict[str, Any]:
    providers: Dict[str, Any] = {a.name: a for a in (FalAdapter(), KreaAdapter())}
    try:
        from .providers_minimax import MinimaxMusicAdapter
    except ImportError:  # loaded standalone by the dashboard mounter (no package)
        import importlib.util as _ilu
        import sys as _sys
        from pathlib import Path as _Path

        _spec = _ilu.spec_from_file_location(
            "hermes_media_studio_providers_minimax",
            _Path(__file__).parent / "providers_minimax.py",
        )
        if _spec and _spec.loader:
            _mod = _ilu.module_from_spec(_spec)
            _sys.modules[_spec.name] = _mod
            _spec.loader.exec_module(_mod)
            MinimaxMusicAdapter = _mod.MinimaxMusicAdapter
        else:  # pragma: no cover
            MinimaxMusicAdapter = None
    if MinimaxMusicAdapter is not None:
        minimax = MinimaxMusicAdapter()
        providers[minimax.name] = minimax
    return providers
