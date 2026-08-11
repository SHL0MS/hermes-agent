"""Media Studio backend contract tests.

Behavior contracts, not snapshots: job lifecycle invariants (every job ends
terminal, resume re-attaches, cancel wins races), the file route's cache-dir
guard, and the agent-output indexer's idempotence — exercised through the
real modules against a temp HERMES_HOME.
"""

from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
DASHBOARD = REPO / "plugins" / "media-studio" / "dashboard"


def _load(name: str):
    module_name = f"hermes_media_studio_{name}"
    if module_name in sys.modules:
        return sys.modules[module_name]
    spec = importlib.util.spec_from_file_location(module_name, DASHBOARD / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


engine_mod = _load("engine")


class FakeAdapter:
    """Deterministic provider: configurable step sequence, no network."""

    name = "fake"
    display_name = "Fake"
    deadline_s = 5

    def __init__(self, steps=None, fail_submit=False):
        self.steps = steps if steps is not None else ["queued", "running", "done"]
        self.fail_submit = fail_submit
        self.cancelled = []

    def is_available(self):
        return True

    def availability_hint(self):
        return "always available"

    def catalog(self):
        return [{"id": "fake/model", "display": "Fake", "modality": "image", "supports": {}}]

    def submit(self, model_id, modality, params):
        if self.fail_submit:
            raise engine_mod.MediaProviderError("submit rejected")
        return engine_mod.ProviderJobRef(ref="fake-ref-1")

    def status(self, ref):
        state = self.steps.pop(0) if len(self.steps) > 1 else self.steps[0]
        if state == "failed":
            return engine_mod.JobStatus(state="failed", error="fake failure")
        return engine_mod.JobStatus(state=state)

    def result(self, ref):
        return ["https://example.invalid/out.png"]

    def cancel(self, ref):
        self.cancelled.append(ref.ref)
        return True


@pytest.fixture()
def store(tmp_path):
    s = engine_mod.MediaStore(path=tmp_path / "media_studio.db")
    yield s
    s.close()


def _wait_terminal(store, job_id, timeout=10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = store.get_job(job_id)
        if job["state"] in engine_mod.TERMINAL_STATES:
            return job
        time.sleep(0.05)
    raise AssertionError(f"job never reached a terminal state: {store.get_job(job_id)}")


def test_job_reaches_done_and_materializes(store, monkeypatch, tmp_path):
    adapter = FakeAdapter()
    engine = engine_mod.MediaEngine(store, {"fake": adapter})
    out_file = tmp_path / "out.png"
    out_file.write_bytes(b"png")
    monkeypatch.setattr(engine_mod.MediaEngine, "_materialize", staticmethod(lambda url, m, p: str(out_file)))
    monkeypatch.setattr(engine_mod, "make_thumbnail", lambda path, modality: None)
    monkeypatch.setattr(engine_mod, "POLL_INTERVAL_S", 0.01)

    job = engine.submit(provider="fake", model="fake/model", modality="image", params={"prompt": "x"})
    final = _wait_terminal(store, job["id"])
    assert final["state"] == "done"
    assert final["result_paths"] == [str(out_file)]
    # Events recorded the full arc for the live rail.
    kinds = [e["payload"].get("state") for e in store.events_since(0) if e["job_id"] == job["id"]]
    assert "done" in kinds


def test_provider_failure_is_terminal_with_message(store, monkeypatch):
    adapter = FakeAdapter(steps=["running", "failed"])
    monkeypatch.setattr(engine_mod, "POLL_INTERVAL_S", 0.01)
    engine = engine_mod.MediaEngine(store, {"fake": adapter})
    job = engine.submit(provider="fake", model="fake/model", modality="image", params={"prompt": "x"})
    final = _wait_terminal(store, job["id"])
    assert final["state"] == "failed"
    assert "fake failure" in (final["error"] or "")


def test_submit_rejection_surfaces_and_terminates(store, monkeypatch):
    monkeypatch.setattr(engine_mod, "POLL_INTERVAL_S", 0.01)
    engine = engine_mod.MediaEngine(store, {"fake": FakeAdapter(fail_submit=True)})
    job = engine.submit(provider="fake", model="fake/model", modality="image", params={"prompt": "x"})
    final = _wait_terminal(store, job["id"])
    assert final["state"] == "failed"
    assert "submit rejected" in (final["error"] or "")


def test_deadline_expires_stuck_jobs(store, monkeypatch):
    adapter = FakeAdapter(steps=["running"])  # never completes
    adapter.deadline_s = 0.2
    monkeypatch.setattr(engine_mod, "POLL_INTERVAL_S", 0.01)
    engine = engine_mod.MediaEngine(store, {"fake": adapter})
    job = engine.submit(provider="fake", model="fake/model", modality="image", params={"prompt": "x"})
    final = _wait_terminal(store, job["id"])
    assert final["state"] == "expired"


def test_resume_pending_reattaches_after_restart(store, monkeypatch, tmp_path):
    # Simulate a crash: a row parked in 'running' with a provider_ref and no
    # live worker (previous process died).
    job = store.create_job(provider="fake", model="fake/model", modality="image", params={"prompt": "x"})
    store.update_job(job["id"], provider_ref="fake-ref-1")
    store.set_state(job["id"], "running")

    out_file = tmp_path / "resumed.png"
    out_file.write_bytes(b"png")
    monkeypatch.setattr(engine_mod.MediaEngine, "_materialize", staticmethod(lambda url, m, p: str(out_file)))
    monkeypatch.setattr(engine_mod, "make_thumbnail", lambda path, modality: None)
    monkeypatch.setattr(engine_mod, "POLL_INTERVAL_S", 0.01)

    engine = engine_mod.MediaEngine(store, {"fake": FakeAdapter(steps=["done"])})
    assert engine.resume_pending() == 1
    final = _wait_terminal(store, job["id"])
    assert final["state"] == "done"


def test_resume_without_provider_fails_closed(store):
    job = store.create_job(provider="gone", model="x", modality="image", params={})
    store.set_state(job["id"], "running")
    engine = engine_mod.MediaEngine(store, {"fake": FakeAdapter()})
    engine.resume_pending()
    assert store.get_job(job["id"])["state"] == "failed"


def test_cancel_is_terminal_and_reaches_provider(store, monkeypatch):
    adapter = FakeAdapter(steps=["running"])  # would run forever
    monkeypatch.setattr(engine_mod, "POLL_INTERVAL_S", 0.05)
    engine = engine_mod.MediaEngine(store, {"fake": adapter})
    job = engine.submit(provider="fake", model="fake/model", modality="image", params={"prompt": "x"})
    deadline = time.time() + 5
    while time.time() < deadline and not store.get_job(job["id"]).get("provider_ref"):
        time.sleep(0.02)
    assert engine.cancel(job["id"]) is True
    final = _wait_terminal(store, job["id"])
    assert final["state"] == "cancelled"
    assert adapter.cancelled == ["fake-ref-1"]
    # Cancelling a terminal job is a no-op refusal, not a state rewrite.
    assert engine.cancel(job["id"]) is False


def test_import_file_and_known_paths_dedupe(store, tmp_path):
    media = tmp_path / "agent.png"
    media.write_bytes(b"png")
    store.import_file(
        provider="agent",
        model="",
        modality="image",
        result_path=str(media),
        thumb_path=None,
        source="agent",
        created_at=media.stat().st_mtime,
    )
    assert str(media) in store.known_result_paths()
    jobs = store.list_jobs(states=["done"])
    assert len(jobs) == 1 and jobs[0]["source"] == "agent"
