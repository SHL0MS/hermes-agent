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


def test_agent_indexer_imports_settled_files_only(store, tmp_path, monkeypatch):
    """Chat generations land while the app runs: the indexer imports settled
    generation-shaped files, skips studio materializations, mid-download files
    (fresh mtime, zero size), already-known paths, and — the shared-cache
    trap — inbound media without provenance (user-sent screenshots land as
    img_<hex> via the gateway's attachment cache). Sidecar-bearing files
    import regardless of name shape. Re-runnable (live rescan)."""
    import os as _os

    api = _load("plugin_api")
    home = tmp_path / "hermes"
    (home / "cache" / "images").mkdir(parents=True)
    (home / "cache" / "videos").mkdir(parents=True)
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr(api._engine_mod, "make_thumbnail", lambda *_: None)

    old = time.time() - 60
    settled = home / "cache" / "images" / "image_20260812_010101_aa11bb22.png"
    settled.write_bytes(b"png")
    _os.utime(settled, (old, old))

    studio = home / "cache" / "images" / "studio_fal_x.png"
    studio.write_bytes(b"png")
    _os.utime(studio, (old, old))

    fresh = home / "cache" / "images" / "image_20260812_020202_cc33dd44.png"
    fresh.write_bytes(b"partial")  # mtime = now -> quiescence skip

    empty = home / "cache" / "videos" / "video_zero.mp4"
    empty.write_bytes(b"")
    _os.utime(empty, (old, old))

    # Inbound screenshot (gateway attachment cache shape): no sidecar, no
    # generation-shaped name -> never imported.
    screenshot = home / "cache" / "images" / "img_59a29310f2e9.png"
    screenshot.write_bytes(b"png")
    _os.utime(screenshot, (old, old))

    # Odd name but WITH a provenance sidecar (chat-capture hook) -> imported.
    hooked = home / "cache" / "images" / "oddly-named.png"
    hooked.write_bytes(b"png")
    _os.utime(hooked, (old, old))
    (home / "cache" / "images" / "oddly-named.png.msmeta.json").write_text(
        json.dumps({"provider": "fal", "model": "x", "params": {"prompt": "p"}})
    )

    assert api._index_agent_media(store) == 2
    paths = store.known_result_paths()
    assert str(settled) in paths and str(hooked) in paths
    assert str(screenshot) not in paths
    assert str(studio) not in paths and str(fresh) not in paths and str(empty) not in paths

    # Second pass: nothing new -> 0; then a file settles -> picked up.
    assert api._index_agent_media(store) == 0
    _os.utime(fresh, (old, old))
    assert api._index_agent_media(store) == 1
    assert str(fresh) in store.known_result_paths()
    # The screenshot stays out on every pass.
    assert str(screenshot) not in store.known_result_paths()


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

    def fake_request(method, path, body=None, base=None, bearer=None):
        captured["path"] = path
        captured["body"] = body
        captured["base"] = base
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

    # NBP via Krea takes an input image as image_urls[] (edit-style).
    adapter.submit(
        "google/nano-banana-pro",
        "image",
        {"prompt": "restyle", "image_url": "data:image/png;base64,aWM="},
    )
    assert captured["body"]["image_urls"] == ["data:image/png;base64,aWM="]


def test_krea_routes_managed_vs_direct(monkeypatch):
    """Subscriber (no key): krea-2 rides the managed gateway and the job ref
    remembers the route; wallet-only models are hidden from the catalog.
    BYOK key present: everything goes direct."""
    import json as _json
    import types

    providers_mod = _load("providers")
    adapter = providers_mod.KreaAdapter()
    monkeypatch.delenv("KREA_API_KEY", raising=False)
    gateway = types.SimpleNamespace(
        gateway_origin="https://krea-gateway.example.com",
        nous_user_token="nous-tok",
    )
    monkeypatch.setattr(adapter, "_managed_gateway", lambda: gateway)
    captured = {}

    def fake_request(method, path, body=None, base=None, bearer=None):
        captured.update(path=path, base=base, bearer=bearer)
        return {"job_id": "j1", "status": "completed", "result": {"urls": []}}

    monkeypatch.setattr(adapter, "_request", fake_request)

    ref = adapter.submit("krea/krea-2/large", "image", {"prompt": "x", "aspect_ratio": "1:1"})
    assert captured["base"] == "https://krea-gateway.example.com"
    assert captured["bearer"] == "nous-tok"
    assert _json.loads(ref.ref)["via"] == "managed"

    # Status polls the SAME route the job was issued on.
    adapter.status(ref)
    assert captured["base"] == "https://krea-gateway.example.com"

    # Wallet-only models are hidden without a key; visible with one.
    ids = {m["id"] for m in adapter.catalog()}
    assert "kling/kling-2.5" not in ids
    assert "krea/krea-2/large" in ids
    monkeypatch.setenv("KREA_API_KEY", "direct-key")
    ids_with_key = {m["id"] for m in adapter.catalog()}
    assert "kling/kling-2.5" in ids_with_key

    # With a key, managed models STILL prefer portal credits (an empty Krea
    # wallet must not 402 models the subscription covers)…
    ref2 = adapter.submit("krea/krea-2/large", "image", {"prompt": "x"})
    assert captured["base"] == "https://krea-gateway.example.com"
    assert _json.loads(ref2.ref)["via"] == "managed"

    # …while wallet-only models use the key, and a key WITHOUT a gateway
    # (no subscription) goes direct for everything.
    adapter.submit("kling/kling-2.5", "video", {"prompt": "x", "duration": 5})
    assert captured["base"] == providers_mod._KREA_BASE
    assert captured["bearer"] == "direct-key"
    monkeypatch.setattr(adapter, "_managed_gateway", lambda: None)
    ref3 = adapter.submit("krea/krea-2/large", "image", {"prompt": "x"})
    assert captured["base"] == providers_mod._KREA_BASE
    assert _json.loads(ref3.ref)["via"] == "direct"
    monkeypatch.setattr(adapter, "_managed_gateway", lambda: gateway)

    # Legacy plain-string refs (pre-managed builds) resolve as direct.
    legacy = providers_mod.ProviderJobRef(ref="legacy-job-id")
    adapter.status(legacy)
    assert captured["path"] == "/jobs/legacy-job-id"
    assert captured["base"] == providers_mod._KREA_BASE


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


def test_fal_payload_styles_match_harvested_schemas(monkeypatch):
    """One assertion per payload family, pinned to the fal OpenAPI dumps."""
    providers_mod = _load("providers")
    adapter = providers_mod.FalAdapter()

    # Seedream: resolution folds into image_size as auto_NK.
    seedream = adapter._model("bytedance/seedream/v5/lite/text-to-image")
    _, p = adapter._payload(seedream, "image", {"prompt": "x", "resolution": "4K"})
    assert p["image_size"] == "auto_4K"

    # GPT Image 2: the resolution control maps to the quality knob.
    gpt = adapter._model("fal-ai/gpt-image-2")
    _, p = adapter._payload(gpt, "image", {"prompt": "x", "aspect_ratio": "16:9", "resolution": "high"})
    assert p["quality"] == "high"
    assert p["image_size"] == "landscape_16_9"

    # GPT Image 1.5: literal pixel dimensions.
    gpt15 = adapter._model("fal-ai/gpt-image-1.5")
    _, p = adapter._payload(gpt15, "image", {"prompt": "x", "aspect_ratio": "3:2", "resolution": "medium"})
    assert p["image_size"] == "1536x1024"
    assert p["quality"] == "medium"

    # Edit routing: a start image on an edit-capable model swaps endpoint and
    # sends image_urls as an ARRAY (data URI accepted).
    import base64

    tiny_png = "data:image/png;base64," + base64.b64encode(b"png-bytes").decode()
    nb2 = adapter._model("fal-ai/nano-banana-2")
    endpoint, p = adapter._payload(nb2, "image", {"prompt": "restyle", "image_url": tiny_png})
    assert endpoint == "fal-ai/nano-banana-2/edit"
    assert p["image_urls"] == [tiny_png]

    # Clarity upscaler: prompt optional, image required, factor numeric.
    clarity = adapter._model("fal-ai/clarity-upscaler")
    endpoint, p = adapter._payload(clarity, "image", {"image_url": tiny_png, "resolution": "4x"})
    assert endpoint == "fal-ai/clarity-upscaler"
    assert p["image_url"] == tiny_png
    assert p["upscale_factor"] == 4.0
    assert "prompt" not in p
    import pytest as _pytest

    with _pytest.raises(providers_mod.MediaProviderError):
        adapter._payload(clarity, "image", {"prompt": "no image"})

    # Nano Banana Pro: edit endpoint exists on fal but is NOT gateway-priced
    # (probed live 2026-08-12: BILLING_ERROR unsupported_pricing_meter). With
    # a FAL_KEY it routes; without one it fails fast with alternatives.
    nbp = adapter._model("fal-ai/nano-banana-pro")
    monkeypatch.setattr(adapter, "_direct_key", lambda: "fal-key")
    endpoint, p = adapter._payload(nbp, "image", {"prompt": "edit", "image_url": tiny_png})
    assert endpoint == "fal-ai/nano-banana-pro/edit"
    assert p["image_urls"] == [tiny_png]
    monkeypatch.setattr(adapter, "_direct_key", lambda: None)
    with _pytest.raises(providers_mod.MediaProviderError, match="portal gateway"):
        adapter._payload(nbp, "image", {"prompt": "edit", "image_url": tiny_png})

    # Veo: duration takes an s-suffix string.
    veo = adapter._model("veo3.1")
    _, p = adapter._payload(veo, "video", {"prompt": "x", "duration": 8, "audio": True})
    assert p["duration"] == "8s"
    assert p["generate_audio"] is True

    # Seedance: duration is a bare-string enum.
    seedance = adapter._model("seedance-2.5")
    _, p = adapter._payload(seedance, "video", {"prompt": "x", "duration": 6})
    assert p["duration"] == "6"

    # Pixverse: audio flag is generate_audio_switch.
    pixverse = adapter._model("pixverse-v6")
    _, p = adapter._payload(pixverse, "video", {"prompt": "x", "audio": False})
    assert p["generate_audio_switch"] is False
    assert "generate_audio" not in p

    # Kling 4K: start image goes to start_image_url; prompt optional with it.
    kling = adapter._model("kling-v3-4k")
    endpoint, p = adapter._payload(kling, "video", {"image_url": tiny_png, "duration": 5})
    assert endpoint == "fal-ai/kling-video/v3/4k/image-to-video"
    assert p["start_image_url"] == tiny_png
    assert "prompt" not in p

    # Gemini Omni Flash is i2v-only: text-to-video submits are refused with
    # guidance, and aspect_ratio IS sent on i2v (schema requires it there).
    omni = adapter._model("gemini-omni-flash")
    with _pytest.raises(providers_mod.MediaProviderError):
        adapter._payload(omni, "video", {"prompt": "x"})
    _, p = adapter._payload(omni, "video", {"prompt": "x", "image_url": tiny_png, "aspect_ratio": "16:9"})
    assert p["aspect_ratio"] == "16:9"

    # LTX: sizing rides video_size presets, not aspect_ratio.
    ltx = adapter._model("ltx-2.3-22b")
    _, p = adapter._payload(ltx, "video", {"prompt": "x", "aspect_ratio": "16:9"})
    assert p["video_size"] == "landscape_16_9"
    assert "aspect_ratio" not in p


def test_fal_catalog_covers_gateway_pricing_rules():
    """Every fal endpoint with an enabled gateway pricing rule (2026-08-12)
    is reachable through the catalog — as a model id or a routed endpoint —
    except the two documented exclusions."""
    providers_mod = _load("providers")
    reachable = set()
    for m in providers_mod.FAL_IMAGE_MODELS:
        reachable.add(m["id"])
        if m.get("edit_endpoint"):
            reachable.add(m["edit_endpoint"])
    for m in providers_mod.FAL_VIDEO_MODELS:
        for key in ("text_endpoint", "image_endpoint"):
            if m.get(key):
                reachable.add(m[key])

    gateway_endpoints = {
        "alibaba/qwen-image-3/edit", "alibaba/qwen-image-3/text-to-image",
        "bytedance/seedream/v5/lite/text-to-image", "bytedance/seedream/v5/pro/edit",
        "bytedance/seedream/v5/pro/text-to-image", "fal-ai/flux-2-pro",
        "fal-ai/flux-2/klein/9b", "fal-ai/gpt-image-1.5", "fal-ai/gpt-image-2",
        "fal-ai/ideogram/v3", "fal-ai/krea/v2/large/text-to-image",
        "fal-ai/krea/v2/medium/text-to-image", "fal-ai/nano-banana",
        "fal-ai/nano-banana-2", "fal-ai/nano-banana-2/edit", "fal-ai/nano-banana-pro",
        "fal-ai/qwen-image", "fal-ai/recraft/v4/pro/text-to-image",
        "fal-ai/recraft/v4.1/text-to-image", "fal-ai/z-image/turbo",
        "google/nano-banana-2-lite", "google/nano-banana-2-lite/edit",
        "ideogram/v4/fast", "ideogram/v4/instant", "microsoft/mai-image-2.5-pro",
        "alibaba/happy-horse/image-to-video", "alibaba/happy-horse/text-to-video",
        "blackforestlabs/flux-3/image-to-video", "blackforestlabs/flux-3/text-to-video",
        "bytedance/seedance-2.0/image-to-video", "bytedance/seedance-2.0/text-to-video",
        "bytedance/seedance-2.0/mini/image-to-video", "bytedance/seedance-2.0/mini/text-to-video",
        "bytedance/seedance-2.5/image-to-video", "bytedance/seedance-2.5/text-to-video",
        "fal-ai/kling-video/v3/4k/image-to-video", "fal-ai/kling-video/v3/4k/text-to-video",
        "fal-ai/ltx-2.3-22b/image-to-video", "fal-ai/ltx-2.3-22b/text-to-video",
        "fal-ai/pixverse/v6/image-to-video", "fal-ai/pixverse/v6/text-to-video",
        "fal-ai/veo3.1", "fal-ai/veo3.1/image-to-video",
        "google/gemini-omni-flash/image-to-video",
        "minimax/h3/image-to-video", "minimax/h3/text-to-video",
        "xai/grok-imagine-video/v1.5/image-to-video", "xai/grok-imagine-video/v1.5/text-to-video",
    }
    # Documented exclusions: billing alias + video upscaler (no upload UI yet).
    excluded = {"openai/gpt-image-2", "fal-ai/clarity-upscaler", "fal-ai/seedvr/upscale/video"}
    missing = gateway_endpoints - reachable - excluded
    assert not missing, f"gateway endpoints not reachable from the catalog: {sorted(missing)}"


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


def test_provider_catalog_key_on_file_tracks_env(api_client, monkeypatch):
    """key_on_file answers 'is a BYOK key present', independent of available —
    a managed-gateway provider is available keyless, and the UI needs the
    distinction to keep the paste form reachable after a key removal."""
    client, engine = api_client

    class _Adapter:
        display_name = "Krea"

        def is_available(self):
            return True  # managed route keeps it available without a key

        def availability_hint(self):
            return "hint"

        def catalog(self):
            return []

    engine.providers = {"krea": _Adapter()}

    monkeypatch.delenv("KREA_API_KEY", raising=False)
    providers = client.get("/providers").json()["providers"]
    assert providers[0]["available"] is True
    assert providers[0]["key_on_file"] is False

    monkeypatch.setenv("KREA_API_KEY", "k")
    providers = client.get("/providers").json()["providers"]
    assert providers[0]["key_on_file"] is True


def test_oversized_input_image_reencodes_for_wire_without_touching_disk(tmp_path):
    """A local input over the 12MB data-URI cap is re-encoded in memory (JPEG,
    stepping resolution only if needed); the on-disk original is byte-identical
    afterward and the data URI fits the cap."""
    import base64

    from PIL import Image

    providers_mod = _load("providers")

    # Random RGB noise defeats PNG compression → comfortably >12MB on disk.
    import random

    random.seed(7)
    img = Image.frombytes(
        "RGB", (2600, 2600), bytes(random.getrandbits(8) for _ in range(2600 * 2600 * 3))
    )
    src = tmp_path / "huge.png"
    img.save(src, "PNG")
    assert src.stat().st_size > providers_mod._MAX_INPUT_IMAGE_BYTES

    before = src.read_bytes()
    uri = providers_mod.normalize_image_input(str(src))

    assert uri.startswith("data:image/jpeg;base64,")
    payload = base64.b64decode(uri.split(",", 1)[1])
    assert len(payload) <= providers_mod._MAX_INPUT_IMAGE_BYTES
    # Same pixels, still a decodable image, original untouched.
    assert src.read_bytes() == before
    reloaded = Image.open(__import__("io").BytesIO(payload))
    assert reloaded.size == (2600, 2600)


def test_small_input_image_passes_through_unrecoded(tmp_path):
    """Under-cap files keep their original bytes and mime — no re-encode."""
    import base64

    from PIL import Image

    providers_mod = _load("providers")
    img = Image.new("RGB", (64, 64), (200, 30, 90))
    src = tmp_path / "small.png"
    img.save(src, "PNG")

    uri = providers_mod.normalize_image_input(str(src))

    assert uri.startswith("data:image/png;base64,")
    assert base64.b64decode(uri.split(",", 1)[1]) == src.read_bytes()


def test_favorite_column_migrates_persists_and_defaults_off(store, tmp_path):
    """The favorite flag: default 0 on new rows, round-trips through
    update_job, and survives reopen (ALTER-based migration is additive)."""
    job_id = store.import_file(
        provider="agent", model="tool", modality="image",
        result_path=str(tmp_path / "x.png"), thumb_path=None,
        source="agent", created_at=time.time(),
    )
    row = store.get_job(job_id)
    assert not row.get("favorite")

    store.update_job(job_id, favorite=1)
    assert store.get_job(job_id)["favorite"] == 1

    # Reopen the same DB file: migration must be idempotent and the flag kept.
    path = tmp_path / "media_studio.db"
    store.close()
    reopened = engine_mod.MediaStore(path=path)
    try:
        assert reopened.get_job(job_id)["favorite"] == 1
    finally:
        reopened.close()


def test_multi_image_edit_routes_ordered_array(monkeypatch, tmp_path):
    """NBP composes up to its max_images references: a list of local files
    normalizes to an ordered image_urls array on the edit endpoint; over-cap
    is rejected with the model's own limit; single-string input still works."""
    from PIL import Image

    providers_mod = _load("providers")
    adapter = providers_mod.FalAdapter()
    monkeypatch.setattr(adapter, "_direct_key", lambda: "k")
    model = adapter._model("fal-ai/nano-banana-pro")

    paths = []
    for i in range(3):
        p = tmp_path / f"ref{i}.png"
        Image.new("RGB", (8, 8), (i * 40, 10, 10)).save(p, "PNG")
        paths.append(str(p))

    endpoint, payload = adapter._image_payload(model, {"prompt": "compose", "image_url": paths})
    assert endpoint == "fal-ai/nano-banana-pro/edit"
    assert len(payload["image_urls"]) == 3
    assert all(u.startswith("data:image/png;base64,") for u in payload["image_urls"])

    # Single string keeps working (back-compat wire shape).
    _, single = adapter._image_payload(model, {"prompt": "x", "image_url": paths[0]})
    assert len(single["image_urls"]) == 1

    # Over the model's cap fails with the cap in the message.
    too_many = paths * 3  # 9 > max_images=8
    with pytest.raises(providers_mod.MediaProviderError, match="at most 8"):
        adapter._image_payload(model, {"prompt": "x", "image_url": too_many})
