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

    # In-cache path: nothing new is created.
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

    assert sorted(p.name for p in cache_images.iterdir()) == ["image_x.png"]

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
            return tmp_path / "saved.png"

    class _FakeVideoProvider:
        @staticmethod
        def save_url_video(url, prefix=""):
            calls.append(("video", url, prefix))
            return tmp_path / "saved.mp4"

    monkeypatch.setitem(sys.modules, "agent.image_gen_provider", _FakeImageProvider)
    monkeypatch.setitem(sys.modules, "agent.video_gen_provider", _FakeVideoProvider)
    monkeypatch.setitem(sys.modules, "agent", type(sys)("agent"))
    sys.modules["agent"].image_gen_provider = _FakeImageProvider
    sys.modules["agent"].video_gen_provider = _FakeVideoProvider

    shell._on_post_tool_call(
        tool_name="image_generate",
        result={"success": True, "image": "https://v3b.fal.media/files/x.png"},
    )
    shell._on_post_tool_call(
        tool_name="video_generate",
        result={"success": True, "video": "https://cdn.example.com/clip.mp4"},
    )
    _drain_threads()

    kinds = {c[0] for c in calls}
    assert kinds == {"image", "video"}
    assert all(c[1].startswith("https://") for c in calls)
