"""Media Studio — durable generation job engine.

Provider-agnostic submit → poll → materialize loop with a SQLite store.
Adapters (`providers/`) speak the narrow `MediaProvider` contract; this
module owns job state, polling threads, downloads, and thumbnails.

Design notes
------------
* Jobs are DURABLE: rows live in ``$HERMES_HOME/media_studio.db`` (separate
  file from state.db so we never contend with the gateway's write lock).
  On process start, ``resume_pending()`` re-attaches pollers to any job
  that was in flight when the previous process exited.
* Poll loops are BOUNDED: coarse interval, monotonic wall-clock deadline.
  Every job ends in a terminal state (done / failed / cancelled / expired).
* Results MATERIALIZE locally at completion (provider CDN URLs expire).
  Images land in ``cache/images/``, video in ``cache/videos/``, audio in
  ``cache/music/`` — the same directories the agent's own tools write to,
  so the library indexer treats both sources uniformly. Thumbnails live
  in ``cache/media_thumbs/``.
"""

from __future__ import annotations

import datetime
import json
import logging
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

# Terminal job states. Anything else is in flight.
TERMINAL_STATES = frozenset({"done", "failed", "cancelled", "expired"})

POLL_INTERVAL_S = 2.5
# Videos can run long; images never should. Providers may override per job.
DEFAULT_DEADLINE_S = 30 * 60


def _hermes_home() -> Path:
    from hermes_constants import get_hermes_home

    return get_hermes_home()


def db_path() -> Path:
    return _hermes_home() / "media_studio.db"


def thumbs_dir() -> Path:
    path = _hermes_home() / "cache" / "media_thumbs"
    path.mkdir(parents=True, exist_ok=True)
    return path


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS media_jobs (
    id            TEXT PRIMARY KEY,
    provider      TEXT NOT NULL,
    model         TEXT NOT NULL,
    modality      TEXT NOT NULL,             -- 'image' | 'video'
    params        TEXT NOT NULL DEFAULT '{}',
    state         TEXT NOT NULL DEFAULT 'queued',
    provider_ref  TEXT,
    progress      TEXT,
    error         TEXT,
    source        TEXT NOT NULL DEFAULT 'studio',
    session_id    TEXT,                      -- originating chat (provenance)
    result_paths  TEXT NOT NULL DEFAULT '[]',
    thumb_paths   TEXT NOT NULL DEFAULT '[]',
    created_at    REAL NOT NULL,
    finished_at   REAL
);
CREATE INDEX IF NOT EXISTS idx_media_jobs_created ON media_jobs (created_at DESC);
CREATE TABLE IF NOT EXISTS media_events (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id     TEXT NOT NULL,
    kind       TEXT NOT NULL,                -- 'created' | 'state' | 'progress'
    payload    TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL
);
"""


class MediaStore:
    """SQLite-backed job store. WAL mode; one writer lock in-process."""

    def __init__(self, path: Optional[Path] = None):
        self._path = path or db_path()
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(self._path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.executescript(_SCHEMA)
        self._migrate()
        self._conn.commit()
        try:
            _backfill_audio_durations(self._conn)
            self._conn.commit()
        except Exception:  # noqa: BLE001 — never block boot over backfill
            pass

    def _migrate(self) -> None:
        """Additive column migrations for DBs created by older builds.
        CREATE IF NOT EXISTS skips existing tables, so new columns need ALTER."""
        columns = {row["name"] for row in self._conn.execute("PRAGMA table_info(media_jobs)")}
        if "session_id" not in columns:
            self._conn.execute("ALTER TABLE media_jobs ADD COLUMN session_id TEXT")
        if "favorite" not in columns:
            self._conn.execute("ALTER TABLE media_jobs ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0")

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # -- writes ------------------------------------------------------------

    def create_job(
        self,
        *,
        provider: str,
        model: str,
        modality: str,
        params: Dict[str, Any],
        source: str = "studio",
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        job_id = uuid.uuid4().hex[:16]
        now = time.time()
        with self._lock:
            self._conn.execute(
                "INSERT INTO media_jobs (id, provider, model, modality, params, state, source, session_id, created_at)"
                " VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)",
                (job_id, provider, model, modality, json.dumps(params), source, session_id, now),
            )
            self._append_event_locked(job_id, "created", {"state": "queued"})
            self._conn.commit()
        return self.get_job(job_id)  # type: ignore[return-value]

    def import_file(
        self,
        *,
        provider: str,
        model: str,
        modality: str,
        result_path: str,
        thumb_path: Optional[str],
        source: str,
        created_at: float,
        params: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
    ) -> str:
        """Register an already-materialized file (agent output) as a done job."""
        job_id = uuid.uuid4().hex[:16]
        # Audio rows carry a measured duration in params.duration_s so the
        # library card shows track length without a lazy measure per card.
        try:
            if modality == "audio":
                merged = dict(params or {})
                if "duration_s" not in merged:
                    dur = _probe_audio_duration_s(result_path)
                    if dur is not None:
                        merged["duration_s"] = dur
                params = merged
        except Exception:  # noqa: BLE001 — never block a library row over a probe
            pass
        with self._lock:
            self._conn.execute(
                "INSERT INTO media_jobs (id, provider, model, modality, params, state, source,"
                " session_id, result_paths, thumb_paths, created_at, finished_at)"
                " VALUES (?, ?, ?, ?, ?, 'done', ?, ?, ?, ?, ?, ?)",
                (
                    job_id,
                    provider,
                    model,
                    modality,
                    json.dumps(params or {}),
                    source,
                    session_id,
                    json.dumps([result_path]),
                    json.dumps([thumb_path] if thumb_path else []),
                    created_at,
                    created_at,
                ),
            )
            self._append_event_locked(job_id, "state", {"state": "done"})
            self._conn.commit()
        return job_id

    def update_job(self, job_id: str, **fields: Any) -> None:
        if not fields:
            return
        cols, vals = [], []
        for key, value in fields.items():
            if key in {"params", "result_paths", "thumb_paths"} and not isinstance(value, str):
                value = json.dumps(value)
            cols.append(f"{key} = ?")
            vals.append(value)
        vals.append(job_id)
        with self._lock:
            self._conn.execute(f"UPDATE media_jobs SET {', '.join(cols)} WHERE id = ?", vals)
            self._conn.commit()

    def set_state(self, job_id: str, state: str, *, error: Optional[str] = None, progress: Optional[str] = None) -> None:
        fields: Dict[str, Any] = {"state": state}
        if error is not None:
            fields["error"] = error
        if progress is not None:
            fields["progress"] = progress
        if state in TERMINAL_STATES:
            fields["finished_at"] = time.time()
        self.update_job(job_id, **fields)
        with self._lock:
            self._append_event_locked(job_id, "state", {"state": state, "error": error, "progress": progress})
            self._conn.commit()

    def emit_progress(self, job_id: str, progress: str) -> None:
        self.update_job(job_id, progress=progress)
        with self._lock:
            self._append_event_locked(job_id, "progress", {"progress": progress})
            self._conn.commit()

    def _append_event_locked(self, job_id: str, kind: str, payload: Dict[str, Any]) -> None:
        self._conn.execute(
            "INSERT INTO media_events (job_id, kind, payload, created_at) VALUES (?, ?, ?, ?)",
            (job_id, kind, json.dumps(payload), time.time()),
        )

    def delete_job(self, job_id: str) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM media_jobs WHERE id = ?", (job_id,))
            self._conn.execute("DELETE FROM media_events WHERE job_id = ?", (job_id,))
            self._conn.commit()

    # -- reads -------------------------------------------------------------

    @staticmethod
    def _row_to_job(row: sqlite3.Row) -> Dict[str, Any]:
        job = dict(row)
        for key in ("params", "result_paths", "thumb_paths"):
            try:
                job[key] = json.loads(job.get(key) or ("[]" if key.endswith("paths") else "{}"))
            except (TypeError, ValueError):
                job[key] = [] if key.endswith("paths") else {}
        return job

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._conn.execute("SELECT * FROM media_jobs WHERE id = ?", (job_id,)).fetchone()
        return self._row_to_job(row) if row else None

    def list_jobs(
        self,
        *,
        states: Optional[List[str]] = None,
        modality: Optional[str] = None,
        provider: Optional[str] = None,
        limit: int = 200,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        where, vals = [], []
        if states:
            where.append(f"state IN ({','.join('?' * len(states))})")
            vals.extend(states)
        if modality:
            where.append("modality = ?")
            vals.append(modality)
        if provider:
            where.append("provider = ?")
            vals.append(provider)
        clause = f"WHERE {' AND '.join(where)}" if where else ""
        vals.extend([limit, offset])
        with self._lock:
            rows = self._conn.execute(
                f"SELECT * FROM media_jobs {clause} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                vals,
            ).fetchall()
        return [self._row_to_job(r) for r in rows]

    def events_since(self, seq: int, limit: int = 500) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM media_events WHERE seq > ? ORDER BY seq ASC LIMIT ?",
                (seq, limit),
            ).fetchall()
        out = []
        for row in rows:
            event = dict(row)
            try:
                event["payload"] = json.loads(event["payload"])
            except (TypeError, ValueError):
                event["payload"] = {}
            out.append(event)
        return out

    def last_event_seq(self) -> int:
        with self._lock:
            row = self._conn.execute("SELECT COALESCE(MAX(seq), 0) AS seq FROM media_events").fetchone()
        return int(row["seq"])

    def known_result_paths(self) -> set:
        with self._lock:
            rows = self._conn.execute("SELECT result_paths FROM media_jobs").fetchall()
        known: set = set()
        for row in rows:
            try:
                known.update(json.loads(row["result_paths"] or "[]"))
            except (TypeError, ValueError):
                continue
        return known


# ---------------------------------------------------------------------------
# Thumbnails
# ---------------------------------------------------------------------------

THUMB_EDGE = 480


def _probe_audio_duration_s(path: str) -> Optional[float]:
    """Duration of an audio file, seconds, via ffprobe; None when unavailable."""
    try:
        import subprocess

        proc = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, timeout=20,
        )
        return float(proc.stdout.strip()) if proc.returncode == 0 else None
    except Exception:  # noqa: BLE001
        return None


def _backfill_audio_durations(conn) -> int:
    """Fill params.duration_s for existing audio rows missing it. Bounded so a
    big library doesn't stall boot; the indexer lands the same value for new
    files on import. Returns rows updated."""
    import sqlite3 as _sql

    updated = 0
    try:
        rows = conn.execute(
            "SELECT id, result_paths, params FROM media_jobs WHERE modality='audio' LIMIT 200"
        ).fetchall()
    except _sql.Error:
        return 0
    for row in rows:
        try:
            params = json.loads(row["params"] or "{}")
        except (TypeError, ValueError):
            params = {}
        if params.get("duration_s"):
            continue
        try:
            paths = json.loads(row["result_paths"] or "[]")
        except (TypeError, ValueError):
            paths = []
        if not paths:
            continue
        target = str(paths[0])
        if not target.startswith("/"):
            target = str(_hermes_home() / "cache" / "music" / target)
        dur = _probe_audio_duration_s(target)
        if dur is None:
            continue
        params["duration_s"] = dur
        conn.execute("UPDATE media_jobs SET params=? WHERE id=?", (json.dumps(params), row["id"]))
        updated += 1
    return updated


def make_thumbnail(source: Path, modality: str) -> Optional[str]:
    """Write a small preview beside the grid's needs; never raise.

    Audio gets a procedural cover so the library grid isn't a grey box:
    the first 2s of PCM rendered as a dark waveform strip on a deep
    indigo/purple gradient (musical, on-brand, no noise textures)."""
    try:
        out = thumbs_dir() / f"{source.stem}_thumb.jpg"
        if out.exists():
            return str(out)
        if modality == "audio":
            return _make_audio_thumbnail(source, out)
        if modality == "video":
            import subprocess

            proc = subprocess.run(
                [
                    "ffmpeg", "-v", "error", "-y", "-ss", "0.5", "-i", str(source),
                    "-frames:v", "1", "-vf", f"scale={THUMB_EDGE}:-2", str(out),
                ],
                capture_output=True,
                timeout=60,
            )
            return str(out) if proc.returncode == 0 and out.exists() else None
        from PIL import Image

        with Image.open(source) as img:
            img.thumbnail((THUMB_EDGE, THUMB_EDGE))
            img.convert("RGB").save(out, "JPEG", quality=85)
        return str(out)
    except Exception as exc:  # noqa: BLE001 — thumbs are best-effort
        logger.debug("media_studio: thumbnail failed for %s: %s", source, exc)
        return None


def _make_audio_thumbnail(source: Path, out: Path) -> Optional[str]:
    """Procedural cover for audio: real PCM amplitude (first 2 s, ffmpeg-decoded)
    as a center-out dark waveform over a deep indigo gradient."""
    import subprocess

    try:
        proc = subprocess.run(
            ["ffmpeg", "-v", "error", "-t", "2", "-i", str(source),
             "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
            capture_output=True, timeout=60,
        )
        pcm = proc.stdout
        if proc.returncode != 0 or len(pcm) < 200:
            return None
        from PIL import Image, ImageDraw

        W, H = THUMB_EDGE, THUMB_EDGE
        img = Image.new("RGB", (W, H))
        # Vertical gradient: deep indigo top -> darker violet bottom.
        top, bottom = (30, 27, 75), (12, 10, 38)
        for y in range(H):
            t = y / max(1, H - 1)
            color = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
            ImageDraw.Draw(img).line([(0, y), (W, y)], fill=color)
        # Waveform from actual amplitude.
        import array

        samples = array.array("h")
        samples.frombytes(pcm[: (len(pcm) // 2) * 2])
        n = len(samples)
        draw = ImageDraw.Draw(img)
        mid = H // 2
        accent = (167, 139, 250)  # violet-400
        for x in range(W):
            chunk = samples[(x * n) // W : ((x + 1) * n) // W] or [0]
            peak = max(abs(v) for v in chunk) / 32768.0
            half = max(1, round(peak * (H * 0.42)))
            shade = tuple(round(c * (0.55 + 0.45 * peak)) for c in accent)
            draw.line([(x, mid - half), (x, mid + half)], fill=shade)
        img.save(out, "JPEG", quality=85)
        return str(out)
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.debug("media_studio: audio thumbnail failed for %s: %s", source, exc)
        return None


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


@dataclass
class ProviderJobRef:
    """Opaque handle an adapter returns from submit() and consumes elsewhere."""

    ref: str
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class JobStatus:
    state: str  # 'queued' | 'running' | 'done' | 'failed'
    progress: Optional[str] = None
    error: Optional[str] = None


class MediaProviderError(RuntimeError):
    """Raised by adapters for provider-reported failures (message is user-facing)."""


class MediaEngine:
    """Owns the pollers. One instance per process, created by the router."""

    def __init__(self, store: MediaStore, providers: Dict[str, Any]):
        self.store = store
        self.providers = providers
        self._threads: Dict[str, threading.Thread] = {}
        self._cancels: Dict[str, threading.Event] = {}
        self._lock = threading.Lock()

    # -- lifecycle ----------------------------------------------------------

    def submit(
        self,
        *,
        provider: str,
        model: str,
        modality: str,
        params: Dict[str, Any],
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        adapter = self.providers.get(provider)
        if adapter is None:
            raise MediaProviderError(f"Unknown provider '{provider}'")
        job = self.store.create_job(
            provider=provider, model=model, modality=modality, params=params, session_id=session_id
        )
        self._start_worker(job)
        return job

    def resume_pending(self) -> int:
        """Re-attach pollers after process restart. Returns resumed count."""
        pending = self.store.list_jobs(states=["queued", "running"], limit=100)
        for job in pending:
            if job["provider"] not in self.providers:
                self.store.set_state(job["id"], "failed", error="Provider unavailable after restart")
                continue
            self._start_worker(job)
        return len(pending)

    def cancel(self, job_id: str) -> bool:
        job = self.store.get_job(job_id)
        if job is None or job["state"] in TERMINAL_STATES:
            return False
        event = self._cancels.get(job_id)
        if event is not None:
            event.set()
        adapter = self.providers.get(job["provider"])
        ref = job.get("provider_ref")
        if adapter is not None and ref:
            try:
                adapter.cancel(ProviderJobRef(ref=ref))
            except Exception as exc:  # noqa: BLE001 — cancel is best-effort upstream
                logger.debug("media_studio: provider cancel failed for %s: %s", job_id, exc)
        self.store.set_state(job_id, "cancelled")
        return True

    # -- worker -------------------------------------------------------------

    def _start_worker(self, job: Dict[str, Any]) -> None:
        cancel = threading.Event()
        thread = threading.Thread(target=self._run_job, args=(job, cancel), daemon=True, name=f"media-{job['id']}")
        with self._lock:
            self._cancels[job["id"]] = cancel
            self._threads[job["id"]] = thread
        thread.start()

    def _run_job(self, job: Dict[str, Any], cancel: threading.Event) -> None:
        job_id = job["id"]
        adapter = self.providers[job["provider"]]
        try:
            ref_value = job.get("provider_ref")
            if ref_value:
                ref = ProviderJobRef(ref=ref_value)
            else:
                ref = adapter.submit(job["model"], job["modality"], dict(job["params"]))
                self.store.update_job(job_id, provider_ref=ref.ref)
            self.store.set_state(job_id, "running")

            deadline = time.monotonic() + float(getattr(adapter, "deadline_s", DEFAULT_DEADLINE_S))
            last_progress: Optional[str] = None
            while True:
                if cancel.is_set():
                    return  # cancel() already wrote the terminal state
                if time.monotonic() > deadline:
                    self.store.set_state(job_id, "expired", error="Generation exceeded its deadline")
                    return
                status = adapter.status(ref)
                if status.state == "failed":
                    self.store.set_state(job_id, "failed", error=status.error or "Provider reported failure")
                    return
                if status.state == "done":
                    break
                if status.progress and status.progress != last_progress:
                    last_progress = status.progress
                    self.store.emit_progress(job_id, status.progress)
                cancel.wait(POLL_INTERVAL_S)

            urls = adapter.result(ref)
            if not urls:
                self.store.set_state(job_id, "failed", error="Provider returned no output")
                return
            paths = [self._materialize(url, job["modality"], job["provider"]) for url in urls]
            thumbs = [make_thumbnail(Path(p), job["modality"]) for p in paths]
            self.store.update_job(job_id, result_paths=paths, thumb_paths=[t for t in thumbs if t])
            self.store.set_state(job_id, "done")
        except MediaProviderError as exc:
            self.store.set_state(job_id, "failed", error=str(exc))
        except Exception as exc:  # noqa: BLE001 — a worker must never die silently
            logger.exception("media_studio: job %s crashed", job_id)
            self.store.set_state(job_id, "failed", error=f"{type(exc).__name__}: {exc}")
        finally:
            with self._lock:
                self._threads.pop(job_id, None)
                self._cancels.pop(job_id, None)

    @staticmethod
    def _materialize(url: str, modality: str, provider: str) -> str:
        if modality == "audio":
            import urllib.request

            music_dir = _hermes_home() / "cache" / "music"
            music_dir.mkdir(parents=True, exist_ok=True)
            name = url.split("?", 1)[0].rstrip("/").rsplit("/", 1)[-1] or "song.mp3"
            target = music_dir / f"studio_{provider}_{name}"
            with urllib.request.urlopen(url, timeout=300) as resp:
                target.write_bytes(resp.read())
            return str(target)
        if modality == "video":
            from agent.video_gen_provider import save_url_video

            return str(save_url_video(url, prefix=f"studio_{provider}"))
        from agent.image_gen_provider import save_url_image

        return str(save_url_image(url, prefix=f"studio_{provider}"))
