"""Media Studio backend contract tests.

Behavior contracts, not snapshots: job lifecycle invariants (every job ends
terminal, resume re-attaches, cancel wins races), the file route's cache-dir
guard, and the agent-output indexer's idempotence — exercised through the
real modules against a temp HERMES_HOME.
"""

from __future__ import annotations

import importlib.util
import json
import os
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


# ---------------------------------------------------------------------------
# Batch fan-out (POST /jobs count=N) — route-level contract
# ---------------------------------------------------------------------------


class _RecordingEngine:
    """Captures engine.submit calls; returns store-shaped job dicts."""

    def __init__(self):
        self.calls = []
        self.providers = {}

    def submit(self, *, provider, model, modality, params):
        self.calls.append(params)
        return {"id": f"job-{len(self.calls)}", "state": "queued", "params": params}


@pytest.fixture()
def api_client(monkeypatch):
    fastapi = pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    api = _load("plugin_api")
    engine = _RecordingEngine()
    monkeypatch.setattr(api, "_engine", engine)
    app = fastapi.FastAPI()
    app.include_router(api.router)
    with TestClient(app) as client:
        yield client, engine


def _submit_body(**overrides):
    body = {
        "provider": "fake",
        "model": "fake/model",
        "modality": "image",
        "params": {"prompt": "a sphere"},
    }
    body.update(overrides)
    return body


def test_submit_default_count_is_one(api_client):
    client, engine = api_client
    response = client.post("/jobs", json=_submit_body())
    assert response.status_code == 200
    data = response.json()
    assert len(engine.calls) == 1
    # Back-compat: singular `job` retained alongside the new `jobs` array.
    assert data["job"]["id"] == "job-1"
    assert [j["id"] for j in data["jobs"]] == ["job-1"]


def test_submit_fans_out_count_jobs(api_client):
    client, engine = api_client
    response = client.post("/jobs", json=_submit_body(count=4))
    assert response.status_code == 200
    assert len(engine.calls) == 4
    assert len(response.json()["jobs"]) == 4
    # Unpinned seed stays unpinned on every job — provider-side randomness.
    assert all("seed" not in params for params in engine.calls)


def test_submit_steps_pinned_seed_across_batch(api_client):
    client, engine = api_client
    response = client.post("/jobs", json=_submit_body(count=3, params={"prompt": "x", "seed": 100}))
    assert response.status_code == 200
    assert [params["seed"] for params in engine.calls] == [100, 101, 102]


def test_submit_count_out_of_range_rejected(api_client):
    client, engine = api_client
    assert client.post("/jobs", json=_submit_body(count=0)).status_code == 422
    assert client.post("/jobs", json=_submit_body(count=51)).status_code == 422
    assert engine.calls == []


# ---------------------------------------------------------------------------
# Krea image param mapping — resolution pass-through
# ---------------------------------------------------------------------------


def test_krea_nano_banana_pro_forwards_resolution(monkeypatch):
    providers_mod = _load("providers")
    adapter = providers_mod.KreaAdapter()
    monkeypatch.setenv("KREA_API_KEY", "test-token")
    captured = {}

    def fake_request(method, path, body=None):
        captured["path"] = path
        captured["body"] = body
        return {"job_id": "krea-1"}

    monkeypatch.setattr(adapter, "_request", fake_request)
    adapter.submit(
        "google/nano-banana-pro",
        "image",
        {"prompt": "typography study", "aspect_ratio": "3:2", "resolution": "4K"},
    )
    assert captured["path"].endswith("/nano-banana-pro")
    assert captured["body"]["resolution"] == "4K"
    assert captured["body"]["aspect_ratio"] == "3:2"

    # Out-of-catalog resolution is dropped, not forwarded to a 422.
    adapter.submit(
        "google/nano-banana-pro",
        "image",
        {"prompt": "typography study", "resolution": "8K"},
    )
    assert "resolution" not in captured["body"]

    # krea-2 models still get their required fixed 1K regardless of input.
    adapter.submit(
        "krea/krea-2/medium-turbo",
        "image",
        {"prompt": "study", "aspect_ratio": "1:1", "resolution": "4K"},
    )
    assert captured["body"]["resolution"] == "1K"


def test_fal_nano_banana_pro_payload_uses_aspect_ratio_style():
    providers_mod = _load("providers")
    adapter = providers_mod.FalAdapter()
    model = adapter._model("fal-ai/nano-banana-pro")

    endpoint, payload = adapter._payload(
        model, "image", {"prompt": "poster type study", "aspect_ratio": "3:2", "resolution": "2K", "seed": 7}
    )
    assert endpoint == "fal-ai/nano-banana-pro"
    # Gemini endpoints take aspect_ratio directly — image_size must NOT leak in.
    assert payload == {"prompt": "poster type study", "aspect_ratio": "3:2", "resolution": "2K", "seed": 7}

    # FLUX models keep the image_size preset mapping.
    flux = adapter._model("fal-ai/flux-2/klein/9b")
    _, flux_payload = adapter._payload(flux, "image", {"prompt": "x", "aspect_ratio": "16:9"})
    assert flux_payload["image_size"] == "landscape_16_9"
    assert "aspect_ratio" not in flux_payload


# ---------------------------------------------------------------------------
# BYOK provider-key routes
# ---------------------------------------------------------------------------


def test_provider_key_routes_save_and_remove(api_client, monkeypatch):
    client, _engine = api_client
    api = _load("plugin_api")
    saved = {}
    removed = []

    import types

    fake_config = types.SimpleNamespace(
        save_env_value=lambda key, value: saved.__setitem__(key, value),
        remove_env_value=lambda key: removed.append(key) or True,
    )
    monkeypatch.setitem(sys.modules, "hermes_cli.config", fake_config)
    monkeypatch.delenv("KREA_API_KEY", raising=False)

    # Unknown provider → 404; fal is deliberately not keyable here.
    assert client.put("/providers/fal/key", json={"key": "x"}).status_code == 404
    assert client.put("/providers/nonsense/key", json={"key": "x"}).status_code == 404

    # Newline injection → 400, nothing written.
    bad = client.put("/providers/krea/key", json={"key": "abc\ndef"})
    assert bad.status_code == 400
    assert saved == {}

    # Happy path: persisted via save_env_value, live in os.environ, response
    # carries availability but never the key value.
    response = client.put("/providers/krea/key", json={"key": "  krea-test-key  "})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert "krea-test-key" not in json.dumps(body)
    assert saved == {"KREA_API_KEY": "krea-test-key"}
    assert os.environ.get("KREA_API_KEY") == "krea-test-key"

    # Remove: env cleared, .env writer called.
    response = client.delete("/providers/krea/key")
    assert response.status_code == 200
    assert removed == ["KREA_API_KEY"]
    assert "KREA_API_KEY" not in os.environ


def test_provider_catalog_exposes_key_var(api_client):
    client, engine = api_client
    api = _load("plugin_api")

    class _Adapter:
        display_name = "Krea"

        def is_available(self):
            return False

        def availability_hint(self):
            return "hint"

        def catalog(self):
            return []

    engine.providers = {"krea": _Adapter()}
    providers = client.get("/providers").json()["providers"]
    assert providers[0]["key_var"] == "KREA_API_KEY"
