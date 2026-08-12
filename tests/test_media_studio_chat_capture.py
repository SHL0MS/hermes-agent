"""Tests for the chat-generation hook in the plugin shell (__init__.py)."""

from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1] / "plugins" / "media-studio"


def _load_shell():
    spec = importlib.util.spec_from_file_location("hermes_media_studio_shell", REPO / "__init__.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["hermes_media_studio_shell"] = module
    spec.loader.exec_module(module)
    return module


def _drain_threads():
    import threading

    for thread in threading.enumerate():
        if thread.name == "media-studio-materialize":
            thread.join(timeout=10)


def test_hook_hardlinks_outside_files_into_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    shell = _load_shell()

    downloads = tmp_path / "Downloads"
    downloads.mkdir()
    clip = downloads / "flux3_clip.mp4"
    clip.write_bytes(b"mp4-bytes")

    shell._on_post_tool_call(
        tool_name="bfl_flux3_get_result",
        result=json.dumps({"success": True, "saved_path": str(clip)}),
    )
    _drain_threads()

    target = tmp_path / "hermes" / "cache" / "videos" / "flux3_clip.mp4"
    assert target.is_file() and target.read_bytes() == b"mp4-bytes"


def test_hook_skips_cache_files_failures_and_dupes(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    shell = _load_shell()

    cache_images = tmp_path / "hermes" / "cache" / "images"
    cache_images.mkdir(parents=True)
    already = cache_images / "image_x.png"
    already.write_bytes(b"png")

    # In-cache path: no new media file; a provenance sidecar is allowed
    # (the indexer consumes it at import and prunes it for known rows).
    shell._on_post_tool_call(
        tool_name="image_generate",
        result=json.dumps({"success": True, "image": str(already)}),
    )
    # Failure result: ignored.
    shell._on_post_tool_call(
        tool_name="image_generate",
        result=json.dumps({"success": False, "image": str(tmp_path / "nope.png")}),
    )
    # Non-media tool: ignored.
    shell._on_post_tool_call(tool_name="terminal", result=json.dumps({"success": True}))
    _drain_threads()

    media = sorted(p.name for p in cache_images.iterdir() if p.suffix != ".json")
    assert media == ["image_x.png"]

    # Dedupe: the same outside file is materialized once even if reported twice.
    outside = tmp_path / "elsewhere.png"
    outside.write_bytes(b"png2")
    for _ in range(2):
        shell._on_post_tool_call(
            tool_name="image_generate",
            result=json.dumps({"success": True, "image": str(outside)}),
        )
    _drain_threads()
    copies = [p for p in cache_images.iterdir() if p.name == "elsewhere.png"]
    assert len(copies) == 1


def test_hook_downloads_urls_via_agent_helpers(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    shell = _load_shell()
    calls = []

    class _FakeImageProvider:
        @staticmethod
        def save_url_image(url, prefix=""):
            calls.append(("image", url, prefix))
            saved = tmp_path / "saved.png"
            saved.write_bytes(b"png")
            return saved

    class _FakeVideoProvider:
        @staticmethod
        def save_url_video(url, prefix=""):
            calls.append(("video", url, prefix))
            saved = tmp_path / "saved.mp4"
            saved.write_bytes(b"mp4")
            return saved

    monkeypatch.setitem(sys.modules, "agent.image_gen_provider", _FakeImageProvider)
    monkeypatch.setitem(sys.modules, "agent.video_gen_provider", _FakeVideoProvider)
    monkeypatch.setitem(sys.modules, "agent", type(sys)("agent"))
    sys.modules["agent"].image_gen_provider = _FakeImageProvider
    sys.modules["agent"].video_gen_provider = _FakeVideoProvider

    shell._on_post_tool_call(
        tool_name="image_generate",
        result={"success": True, "image": "https://v3b.fal.media/files/x.png"},
        args={"prompt": "a lit match", "aspect_ratio": "1:1"},
        session_id="sess-123",
    )
    shell._on_post_tool_call(
        tool_name="video_generate",
        result={"success": True, "video": "https://cdn.example.com/clip.mp4"},
    )
    _drain_threads()

    kinds = {c[0] for c in calls}
    assert kinds == {"image", "video"}
    assert all(c[1].startswith("https://") for c in calls)

    # Provenance sidecar written next to the downloaded image: whitelisted
    # params + session id, ready for the indexer.
    sidecar = tmp_path / "saved.png.msmeta.json"
    assert sidecar.is_file()
    meta = json.loads(sidecar.read_text())
    assert meta["session_id"] == "sess-123"
    assert meta["params"]["prompt"] == "a lit match"
    assert meta["params"]["aspect_ratio"] == "1:1"


def test_indexer_consumes_provenance_sidecar(tmp_path, monkeypatch):
    """Files with a .msmeta.json import with prompt/session; the sidecar is
    deleted after import and never indexed as media itself."""
    import importlib.util as ilu
    import os as _os

    home = tmp_path / "hermes"
    (home / "cache" / "images").mkdir(parents=True)
    monkeypatch.setenv("HERMES_HOME", str(home))

    spec = ilu.spec_from_file_location("ms_api_prov", REPO / "dashboard" / "plugin_api.py")
    api = ilu.module_from_spec(spec)
    sys.modules["ms_api_prov"] = api
    spec.loader.exec_module(api)
    monkeypatch.setattr(api._engine_mod, "make_thumbnail", lambda *_: None)

    store = api._engine_mod.MediaStore(path=tmp_path / "prov.db")
    old = time.time() - 60

    image = home / "cache" / "images" / "image_chat_prov.png"
    image.write_bytes(b"png")
    _os.utime(image, (old, old))
    sidecar = home / "cache" / "images" / "image_chat_prov.png.msmeta.json"
    sidecar.write_text(
        json.dumps(
            {
                "provider": "agent",
                "model": "image_generate",
                "params": {"prompt": "brass astrolabe"},
                "session_id": "sess-777",
            }
        )
    )

    assert api._index_agent_media(store) == 1
    assert not sidecar.exists(), "sidecar must be consumed"
    jobs = store.list_jobs(states=["done"])
    assert len(jobs) == 1
    row = jobs[0]
    assert row["params"]["prompt"] == "brass astrolabe"
    assert row["session_id"] == "sess-777"
    assert row["model"] == "image_generate"
    store.close()


def test_agent_tool_queues_on_engine(tmp_path, monkeypatch):
    """media_studio_generate submits N jobs (seed stepped) with the session
    stamped, returns immediately without waiting, and reports cleanly when
    the dashboard module is absent."""
    shell = _load_shell()

    class _FakeEngine:
        def __init__(self):
            self.calls = []

        def submit(self, *, provider, model, modality, params, session_id=None):
            self.calls.append({"provider": provider, "model": model, "modality": modality, "params": params, "session_id": session_id})
            return {"id": f"job-{len(self.calls)}", "state": "queued"}

    engine = _FakeEngine()
    fake_mod = type(sys)("hermes_dashboard_plugin_media-studio")
    fake_mod._ensure_engine = lambda: engine
    fake_mod._store = None
    monkeypatch.setitem(sys.modules, "hermes_dashboard_plugin_media-studio", fake_mod)

    out = json.loads(
        shell._media_studio_generate(
            {"prompt": "poster study", "count": 3, "seed": 10, "aspect_ratio": "16:9"},
            session_id="sess-9",
        )
    )
    assert out["success"] is True
    assert out["queued"] == ["job-1", "job-2", "job-3"]
    assert [c["params"]["seed"] for c in engine.calls] == [10, 110, 210]
    assert all(c["session_id"] == "sess-9" for c in engine.calls)
    assert engine.calls[0]["params"]["aspect_ratio"] == "16:9"
    assert engine.calls[0]["model"] == "fal-ai/nano-banana-pro"  # image default

    # No dashboard mounted -> honest error, no crash.
    monkeypatch.delitem(sys.modules, "hermes_dashboard_plugin_media-studio")
    out = json.loads(shell._media_studio_generate({"prompt": "x"}))
    assert out["success"] is False and "not mounted" in out["error"]

    # Bad inputs.
    monkeypatch.setitem(sys.modules, "hermes_dashboard_plugin_media-studio", fake_mod)
    assert json.loads(shell._media_studio_generate({}))["success"] is False
    assert json.loads(shell._media_studio_generate({"prompt": "x", "modality": "audio"}))["success"] is False
