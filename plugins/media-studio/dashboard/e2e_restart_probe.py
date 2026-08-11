"""Restart-durability probe: submit, hard-exit mid-flight, resume in a new
process. Proves the PRD claim 'a generation survives an app restart'.

    venv/bin/python plugins/media-studio/dashboard/e2e_restart_probe.py submit
    venv/bin/python plugins/media-studio/dashboard/e2e_restart_probe.py resume
"""
import importlib.util
import os
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

store = engine_mod.MediaStore()
engine = engine_mod.MediaEngine(store, providers_mod.build_providers())

if sys.argv[1] == "submit":
    job = engine.submit(
        provider="fal",
        model="fal-ai/flux-2/klein/9b",
        modality="image",
        params={"prompt": "a single white cube on a black mirror floor", "aspect_ratio": "1:1"},
    )
    # Wait only until the provider_ref lands (submitted upstream), then die.
    for _ in range(60):
        current = store.get_job(job["id"])
        if current.get("provider_ref"):
            print("REF_SET", job["id"])
            os._exit(0)  # hard exit: no cleanup, poller thread killed mid-flight
        time.sleep(0.5)
    print("NO_REF")
    os._exit(1)

if sys.argv[1] == "resume":
    resumed = engine.resume_pending()
    print("resumed:", resumed)
    deadline = time.time() + 300
    while time.time() < deadline:
        pending = store.list_jobs(states=["queued", "running"], limit=10)
        if not pending:
            break
        time.sleep(3)
    jobs = store.list_jobs(limit=3)
    for job in jobs:
        print(job["state"], job["id"], job["result_paths"])
    sys.exit(0 if jobs and jobs[0]["state"] == "done" else 1)
