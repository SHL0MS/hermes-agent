"""Media Studio backend E2E — real generation through the real engine.

Run with the repo venv from the worktree root:
    venv/bin/python plugins/media-studio/dashboard/e2e_probe.py
"""
import importlib.util
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent


def load(name):
    module_name = f"hermes_media_studio_{name}"
    if module_name in sys.modules:
        return sys.modules[module_name]
    spec = importlib.util.spec_from_file_location(module_name, HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


engine_mod = load("engine")
providers_mod = load("providers")

providers = providers_mod.build_providers()
print("providers:", {k: v.is_available() for k, v in providers.items()})

store = engine_mod.MediaStore()
engine = engine_mod.MediaEngine(store, providers)

job = engine.submit(
    provider="fal",
    model="fal-ai/flux-2/klein/9b",
    modality="image",
    params={"prompt": "a matte black obelisk on white sand, hard noon light, minimal", "aspect_ratio": "1:1"},
)
print("submitted:", job["id"], job["state"])

deadline = time.time() + 300
while time.time() < deadline:
    current = store.get_job(job["id"])
    print("  state:", current["state"], current.get("progress") or "")
    if current["state"] in engine_mod.TERMINAL_STATES:
        break
    time.sleep(3)

final = store.get_job(job["id"])
print(json.dumps({k: final[k] for k in ("state", "error", "result_paths", "thumb_paths")}, indent=2))
if final["state"] != "done":
    sys.exit(1)
for p in final["result_paths"] + final["thumb_paths"]:
    print("exists:", Path(p).exists(), p)
