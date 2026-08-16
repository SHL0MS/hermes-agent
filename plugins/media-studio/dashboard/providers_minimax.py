"""MiniMax Music adapter for Media Studio — the craft-loop music provider.

Job model differs from fal/Krea on purpose: MiniMax's `/v1/music_generation`
is synchronous (one JSON response carries the finished song), so instead of
submit→poll, ``submit()`` runs the whole craft loop (compose → render →
analyze → refine, from ``hermes_music_craft``) in the engine's worker thread
and reports done with the best take's local path. ``status``/``result`` just
read the in-memory handle the submit thread left behind — generation time
(tmieout ~10 min on a 5-min song) is the deadline the job row already carries.

Credential reasoning mirrors the chat tool: managed Nous gateway preferred
(portal credits) once the route exists; ``MINIMAX_API_KEY`` the working BYOK
path today.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from .engine import JobStatus, MediaProviderError, ProviderJobRef
except ImportError:  # standalone dashboard load (no package context)
    import sys as _sys

    _engine = _sys.modules["hermes_media_studio_engine"]
    JobStatus = _engine.JobStatus
    MediaProviderError = _engine.MediaProviderError
    ProviderJobRef = _engine.ProviderJobRef

logger = logging.getLogger(__name__)

_API_DIRECT = "https://api.minimax.io/v1"
_TIMEOUT_S = 600


def _craft_available() -> Optional[str]:
    try:
        from hermes_music_craft import render_loop  # noqa: F401

        return None
    except Exception as e:  # noqa: BLE001
        return f"hermes-music-craft not installed ({e}); pip install -e ~/Documents/Work/nous/hermes-music-craft[audio]"


class MinimaxMusicAdapter:
    name = "minimax"
    display_name = "MiniMax"
    deadline_s = 20 * 60  # craft loop at max iterations + analysis

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: Dict[str, Dict[str, Any]] = {}  # job_id -> {state, progress, error, paths}

    # -- availability ------------------------------------------------------

    def _gateway(self):
        try:
            from tools.managed_tool_gateway import resolve_managed_tool_gateway

            return resolve_managed_tool_gateway("minimax")
        except Exception:  # noqa: BLE001
            return None

    def _api_key(self) -> Optional[str]:
        return (os.environ.get("MINIMAX_API_KEY") or "").strip() or None

    def is_available(self) -> bool:
        return (_craft_available() is None) and bool(self._api_key() or self._gateway())

    def availability_hint(self) -> str:
        craft = _craft_available()
        if craft:
            return craft
        if self._api_key() or self._gateway():
            return "Ready."
        return (
            "Set MINIMAX_API_KEY in ~/.hermes/.env (BYOK), or sign in to Nous "
            "— music bills portal credits once the minimax gateway route lands."
        )

    def catalog(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "music-3.0",
                "display": "Music 3.0",
                "modality": "audio",
                "tier": "quality",
                "supports": {
                    "mode": True, "reference_audio_url": True, "iterations": True,
                    "lyrics": True, "genre": True, "mood": True, "bpm": True, "key": True,
                    "vocal": True, "instrumental": True, "instrumentation": True,
                },
                "note": (
                    "Craft loop: composes, renders, measures, and refines "
                    "each take. Latest MiniMax music model."
                ),
            },
            {
                "id": "music-2.6",
                "display": "Music 2.6",
                "modality": "audio",
                "tier": "quality",
                "supports": {
                    "mode": True, "reference_audio_url": True, "iterations": True,
                    "lyrics": True, "genre": True, "mood": True, "bpm": True, "key": True,
                    "vocal": True, "instrumental": True, "instrumentation": True,
                },
                "note": "Previous generation — useful for comparing takes across models.",
            },
            {
                "id": "music-3.0-free",
                "display": "Music 3.0 Free",
                "modality": "audio",
                "tier": "fast",
                "supports": {
                    "mode": True, "iterations": True, "lyrics": True, "genre": True,
                    "mood": True, "bpm": True, "key": True, "vocal": True,
                    "instrumental": True, "instrumentation": True,
                },
                "note": "3 RPM free tier — draft takes before spending credits.",
            },
            {
                "id": "music-cover",
                "display": "Music Cover",
                "modality": "audio",
                "tier": "quality",
                "supports": {"reference_audio_url": True},
                "requires": {"reference_audio_url": True},
                "note": "Restyle a reference track (URL/base64).",
            },
        ]

    # -- job lifecycle -----------------------------------------------------

    def submit(self, model_id: str, modality: str, params: Dict[str, Any]) -> ProviderJobRef:
        if modality != "audio":
            raise MediaProviderError("MiniMax adapter serves modality='audio' only.")
        craft = _craft_available()
        if craft:
            raise MediaProviderError(craft)

        job_id = os.urandom(8).hex()
        with self._lock:
            self._jobs[job_id] = {
                "state": "queued", "progress": "queued", "error": None, "paths": [],
                # ride-through for two-step cover (consumed by _make_generate)
                "cover_feature_id": params.get("cover_feature_id") or None,
            }

        thread = threading.Thread(
            target=self._run, args=(job_id, model_id, dict(params)), daemon=True, name=f"minimax-{job_id}"
        )
        thread.start()
        return ProviderJobRef(ref=json.dumps({"job": job_id}))

    def status(self, ref: ProviderJobRef) -> JobStatus:
        job_id = json.loads(ref.ref)["job"]
        with self._lock:
            job = self._jobs.get(job_id) or {}
        state = job.get("state") or "queued"
        if state == "done":
            return JobStatus(state="done")
        if state == "failed":
            return JobStatus(state="failed", error=job.get("error") or "MiniMax job failed")
        return JobStatus(state=state, progress=job.get("progress") or "")

    def result(self, ref: ProviderJobRef) -> List[str]:
        job_id = json.loads(ref.ref)["job"]
        with self._lock:
            job = self._jobs.get(job_id) or {}
        paths = job.get("paths") or []
        return [f"file://{p}" for p in paths if p]

    def cancel(self, ref: ProviderJobRef) -> bool:
        job_id = json.loads(ref.ref)["job"]
        with self._lock:
            job = self._jobs.get(job_id)
            if job and job.get("state") not in ("done", "failed"):
                job["state"] = "failed"
                job["error"] = "cancelled"
                return True
        return False

    # -- interactive (non-job) passthroughs --------------------------------

    def lyrics_generate(self, prompt: str, mode: str = "write_full_song",
                        lyrics: Optional[str] = None, title: Optional[str] = None) -> Dict[str, Any]:
        """Lyrics helper — write_full_song or edit/continue (edit keeps
        `lyrics` as the working text). Returns {song_title, style_tags, lyrics}."""
        payload: Dict[str, Any] = {"mode": mode, "prompt": prompt or ""}
        if mode == "edit" and lyrics:
            payload["lyrics"] = lyrics[:3500]
        if title:
            payload["title"] = title[:120]
        body = self._post("/lyrics_generation", payload)
        return {
            "song_title": body.get("song_title") or title or "",
            "style_tags": body.get("style_tags") or "",
            "lyrics": body.get("lyrics") or "",
        }

    def cover_preprocess(self, *, audio_url: Optional[str] = None,
                         audio_base64: Optional[str] = None) -> Dict[str, Any]:
        """FREE analysis of a reference track: returns cover_feature_id (24h),
        ASR formatted_lyrics, and the timestamped structure segments."""
        if not audio_url and not audio_base64:
            raise MediaProviderError("cover_preprocess needs audio_url or audio_base64")
        payload: Dict[str, Any] = {"model": "music-cover"}
        if audio_base64:
            payload["audio_base64"] = audio_base64
        else:
            payload["audio_url"] = audio_url
        body = self._post("/music_cover_preprocess", payload)
        structure_raw = body.get("structure_result") or "{}"
        try:
            structure = json.loads(structure_raw)
        except (TypeError, ValueError):
            structure = {}
        return {
            "cover_feature_id": body.get("cover_feature_id") or "",
            "formatted_lyrics": body.get("formatted_lyrics") or "",
            "structure": structure,
            "audio_duration": body.get("audio_duration"),
            "trace_id": body.get("trace_id"),
        }

    # -- the loop ----------------------------------------------------------

    def _set(self, job_id: str, **fields) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.update(fields)

    def _cancelled(self, job_id: str) -> bool:
        with self._lock:
            return (self._jobs.get(job_id) or {}).get("error") == "cancelled"

    def _run(self, job_id: str, model_id: str, params: Dict[str, Any]) -> None:
        from hermes_music_craft import render_loop

        try:
            self._set(job_id, state="running", progress="composing")
            out_dir = _music_dir()

            # Brief: map the studio's params on top of the craft brief schema.
            brief: Dict[str, Any] = {}
            for key in ("genre", "mood", "moods", "bpm", "key", "production",
                        "tags", "instrumentation", "vocal", "duration_s"):
                if params.get(key):
                    brief[key] = params[key]
            lyrics = params.get("lyrics") or None
            # Free-text brief (prompt field) is the fallback genre+theme line.
            if not brief and params.get("prompt"):
                brief["genre"] = str(params["prompt"]).strip()

            iterations = max(1, min(4, int(params.get("iterations") or 2)))
            mode = str(params.get("mode") or ("cover" if model_id == "music-cover" else "song"))
            reference_url = params.get("reference_audio_url")
            instrumental = mode == "instrumental"

            generate = self._make_generate(model_id, mode, reference_url, job_id)

            result = render_loop(
                brief,
                generate,
                lyrics=lyrics,
                instrumental=instrumental,
                iterations=iterations,
                out_dir=str(out_dir),
                progress_cb=lambda msg: self._set(job_id, progress=msg),
            )

            best = result.get("best") or {}
            best_path = best.get("audio_path")
            if self._cancelled(job_id):
                return
            if not best_path:
                err = (best or {}).get("error") or _first_error(result) or "no successful take"
                self._set(job_id, state="failed", error=err)
                return
            self._set(
                job_id,
                state="done",
                progress="done",
                paths=[best_path],
                comparison=(best.get("comparison") or {}),
                provenance={
                    "composition": result.get("composition") or {},
                    "iterations": len(result.get("iterations") or []),
                    "quality_gate": result.get("quality_gate") or {},
                },
            )
        except Exception as exc:  # noqa: BLE001 — a worker must never die silently
            logger.exception("minimax: craft loop crashed for job %s", job_id)
            self._set(job_id, state="failed", error=f"{type(exc).__name__}: {exc}")

    def _make_generate(self, model_id: str, mode: str, reference_url: Optional[str], job_id: str):
        cover_feature_id = self._current_cover_feature_id(job_id)

        def generate(style_prompt: str, *, lyrics=None, negative_tags=None, out_dir=None) -> str:
            if self._cancelled(job_id):
                raise RuntimeError("cancelled")
            payload = self._payload(model_id, style_prompt, lyrics, mode, reference_url,
                                    cover_feature_id=cover_feature_id)
            body = self._post("/music_generation", payload)
            return _save_song(body, Path(out_dir or _music_dir()), style_prompt)

        return generate

    # cover_feature_id rides the submit params and is claimed by the first
    # (only) render pass of a cover job — two-step cover consumes it once.
    def _current_cover_feature_id(self, job_id: str) -> Optional[str]:
        with self._lock:
            job = self._jobs.get(job_id) or {}
        return job.get("cover_feature_id")

    def _payload(
        self,
        model_id: str,
        style_prompt: str,
        lyrics: Optional[str],
        mode: str,
        reference_url: Optional[str],
        cover_feature_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "model": model_id,
            "prompt": style_prompt,
            "audio_setting": {"sample_rate": 44100, "bitrate": 256000, "format": "mp3"},
            "output_format": "url",
        }
        if mode == "cover":
            if cover_feature_id:
                payload["cover_feature_id"] = cover_feature_id
                if not lyrics:
                    raise MediaProviderError("two-step cover needs edited lyrics")
                payload["lyrics"] = lyrics[:1000]
            else:
                if not reference_url:
                    raise MediaProviderError("cover mode needs a reference (URL, base64, or feature id)")
                if reference_url.startswith(("http://", "https://")):
                    payload["audio_url"] = reference_url
                else:
                    payload["audio_base64"] = _file_to_b64(reference_url)
                if lyrics:
                    payload["lyrics"] = lyrics[:1000]
        elif mode == "instrumental":
            payload["is_instrumental"] = True
        else:
            if lyrics and lyrics.strip():
                payload["lyrics"] = lyrics.strip()
            else:
                # MiniMax 2013s on lyrics_optimizer:true sent with an explicit
                # empty lyrics string — the field must be ABSENT for auto-write.
                payload["lyrics_optimizer"] = True
        return payload

    def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        gw = self._gateway()
        key = self._api_key()
        if gw is not None and _gateway_host_live(gw.gateway_origin):
            base, token = gw.gateway_origin.rstrip("/"), gw.nous_user_token
        elif key:
            base, token = _API_DIRECT, key
        else:
            raise MediaProviderError(self.availability_hint())
        req = urllib.request.Request(
            f"{base}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:400]
            raise MediaProviderError(f"MiniMax HTTP {e.code}: {detail}") from e
        except urllib.error.URLError as e:
            raise MediaProviderError(f"MiniMax request failed: {e.reason}") from e
        base_resp = body.get("base_resp") or {}
        code = base_resp.get("status_code", 0)
        if code not in (0, None):
            hints = {
                1002: "rate limited (RPM) — slow down",
                1004: "auth failed — check MINIMAX_API_KEY",
                1008: "insufficient balance — top up at platform.minimax.io",
                1026: "moderation — reword prompt/lyrics",
                2013: "invalid parameters",
                2049: "invalid API key format",
            }
            hint = hints.get(code, "")
            raise MediaProviderError(
                f"MiniMax error {code}: {base_resp.get('status_msg') or 'unknown'}"
                + (f" ({hint})" if hint else "")
            )
        return body


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _music_dir() -> Path:
    home = Path(os.environ.get("HERMES_HOME") or Path.home() / ".hermes")
    d = home / "cache" / "music"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _file_to_b64(path_or_b64: str) -> str:
    """Local file path → base64 (≤50MB). Already-base64 passes through."""
    import base64

    candidate = Path(str(path_or_b64).removeprefix("file://")).expanduser()
    if candidate.is_file():
        data = candidate.read_bytes()
        if len(data) > 50 * 1024 * 1024:
            raise MediaProviderError(f"reference audio too large ({len(data)//1048576}MB, cap 50MB)")
        return base64.b64encode(data).decode()
    return str(path_or_b64)


def _gateway_host_live(origin: str) -> bool:
    """Cheap route-exists probe: NXDOMAIN → the minimax route isn't onboarded,
    steer BYOK. Resolves to *something* → fronted."""
    import socket
    from urllib.parse import urlparse

    try:
        socket.getaddrinfo(urlparse(origin).hostname or "", 443)
    except OSError:
        return False
    return True


def _first_error(render_result: Dict[str, Any]) -> Optional[str]:
    for record in render_result.get("iterations") or []:
        if record.get("error"):
            return record["error"]
    return None


def _save_song(body: Dict[str, Any], out_dir: Path, style_prompt: str) -> str:
    """Materialize the rendered song from a music_generation response."""
    import re
    import time

    data = body.get("data") or {}
    audio = data.get("audio") or ""
    slug = re.sub(r"[^a-z0-9]+", "-", style_prompt.lower()).strip("-")[:40] or "song"
    dest = out_dir / f"{time.strftime('%Y%m%d-%H%M%S')}-{slug}.mp3"

    if audio.startswith("http"):
        # status 1 = in progress: the URL pre-exists the file; poll briefly.
        if data.get("status") == 1:
            deadline = time.time() + 60
            payload = None
            while time.time() < deadline:
                try:
                    with urllib.request.urlopen(audio, timeout=180) as r:
                        payload = r.read()
                    break
                except Exception:  # noqa: BLE001
                    time.sleep(3)
            if payload is None:
                raise RuntimeError("audio still rendering at result URL after 60s")
            dest.write_bytes(payload)
        else:
            with urllib.request.urlopen(audio, timeout=180) as r:
                dest.write_bytes(r.read())
    elif audio:
        dest.write_bytes(bytes.fromhex(audio))
    else:
        raise RuntimeError("MiniMax response carried no audio payload")
    return str(dest)
