# Web Dashboard Feature Expansion — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add 7 features to the hermes web dashboard: session viewer, log viewer, cron management, skill/tool browser, config search, raw YAML toggle, and token/cost analytics.

**Architecture:** All 7 features follow the same pattern — add REST endpoints to `hermes_cli/web_server.py` that wrap existing Python functions, then add React pages/components in `web/src/`. Features 5 (config search) and 6 (raw YAML) are partially frontend-only. Feature 7 (analytics) needs one new SQL query.

**Tech Stack:** Python/FastAPI (backend), React/TypeScript/Tailwind (frontend), SQLite (session data), Vite (build)

**Worktree:** `/Users/kshitij/Projects/hermes-agent/.worktrees/salvage-7621`
**Venv:** `source /Users/kshitij/Projects/hermes-agent/.venv/bin/activate`

---

## Phase 1: Backend API Endpoints (web_server.py)

All 12 new endpoints go in `hermes_cli/web_server.py`, between the existing env endpoints and `mount_spa()`.

### Task 1: Session Detail + Messages Endpoints

**Objective:** Expose session detail and message history for the session viewer.

**Files:**
- Modify: `hermes_cli/web_server.py`
- Test: `tests/hermes_cli/test_web_server.py`

**Endpoints:**

```python
@app.get("/api/sessions/{session_id}")
async def get_session_detail(session_id: str):
    from hermes_state import SessionDB
    db = SessionDB()
    try:
        sid = db.resolve_session_id(session_id)
        session = db.get_session(sid) if sid else None
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session
    finally:
        db.close()

@app.get("/api/sessions/{session_id}/messages")
async def get_session_messages(session_id: str):
    from hermes_state import SessionDB
    db = SessionDB()
    try:
        sid = db.resolve_session_id(session_id)
        if not sid:
            raise HTTPException(status_code=404, detail="Session not found")
        messages = db.get_messages(sid)
        return {"session_id": sid, "messages": messages}
    finally:
        db.close()

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    from hermes_state import SessionDB
    db = SessionDB()
    try:
        if not db.delete_session(session_id):
            raise HTTPException(status_code=404, detail="Session not found")
        return {"ok": True}
    finally:
        db.close()
```

**Tests:**
- test_get_session_detail (create session, fetch, verify fields)
- test_get_session_messages (verify messages list returned)
- test_delete_session (create, delete, verify 404)

---

### Task 2: Log Viewer Endpoint

**Objective:** Expose log reading with filtering for the log viewer page.

**Files:**
- Modify: `hermes_cli/web_server.py`

**Endpoint:**

```python
@app.get("/api/logs")
async def get_logs(
    file: str = "agent",
    lines: int = 100,
    level: Optional[str] = None,
    component: Optional[str] = None,
):
    from hermes_cli.logs import _read_tail, _read_last_n_lines, LOG_FILES
    from hermes_logging import COMPONENT_PREFIXES
    log_name = LOG_FILES.get(file)
    if not log_name:
        raise HTTPException(status_code=400, detail=f"Unknown log file: {file}")
    log_path = get_hermes_home() / "logs" / log_name
    if not log_path.exists():
        return {"file": file, "lines": []}

    has_filters = bool(level or component)
    comp_prefixes = COMPONENT_PREFIXES.get(component, ()) if component else ()
    result = _read_tail(log_path, min(lines, 500), has_filters, level, None, None, comp_prefixes)
    return {"file": file, "lines": result}
```

---

### Task 3: Cron CRUD Endpoints

**Objective:** Full cron job management via REST.

**Files:**
- Modify: `hermes_cli/web_server.py`

**Pydantic models + endpoints:**

```python
class CronJobCreate(BaseModel):
    prompt: str
    schedule: str
    name: str = ""
    deliver: str = "local"

class CronJobUpdate(BaseModel):
    updates: dict

# GET    /api/cron/jobs               -> list_jobs(include_disabled=True)
# GET    /api/cron/jobs/{job_id}      -> get_job(job_id)
# POST   /api/cron/jobs               -> create_job(...)
# PUT    /api/cron/jobs/{job_id}      -> update_job(job_id, updates)
# POST   /api/cron/jobs/{job_id}/pause   -> pause_job(job_id)
# POST   /api/cron/jobs/{job_id}/resume  -> resume_job(job_id)
# POST   /api/cron/jobs/{job_id}/trigger -> trigger_job(job_id)
# DELETE /api/cron/jobs/{job_id}      -> remove_job(job_id)
```

Each wraps the corresponding function from `cron/jobs.py`.

---

### Task 4: Skills + Tools Endpoints

**Objective:** List skills/tools, toggle enabled/disabled.

**Files:**
- Modify: `hermes_cli/web_server.py`

**Endpoints:**

```python
@app.get("/api/skills")
async def get_skills():
    from tools.skills_tool import _find_all_skills
    from hermes_cli.skills_config import get_disabled_skills
    config = load_config()
    disabled = get_disabled_skills(config)
    skills = _find_all_skills(skip_disabled=False)
    for s in skills:
        s["enabled"] = s["name"] not in disabled
    return skills

class SkillToggle(BaseModel):
    name: str
    enabled: bool

@app.put("/api/skills/toggle")
async def toggle_skill(body: SkillToggle):
    from hermes_cli.skills_config import get_disabled_skills, save_disabled_skills
    config = load_config()
    disabled = get_disabled_skills(config)
    if body.enabled:
        disabled.discard(body.name)
    else:
        disabled.add(body.name)
    save_disabled_skills(config, disabled)
    return {"ok": True, "name": body.name, "enabled": body.enabled}

@app.get("/api/tools/toolsets")
async def get_toolsets():
    from hermes_cli.tools_config import CONFIGURABLE_TOOLSETS
    from tools.registry import registry
    available = registry.get_available_toolsets()
    result = []
    for name, label, desc in CONFIGURABLE_TOOLSETS:
        info = available.get(name, {})
        result.append({
            "name": name, "label": label, "description": desc,
            "available": info.get("available", False),
            "tools": info.get("tools", []),
        })
    return result
```

---

### Task 5: Raw YAML Config Endpoint

**Objective:** Read/write config.yaml as raw text for the YAML toggle.

**Files:**
- Modify: `hermes_cli/web_server.py`

```python
@app.get("/api/config/raw")
async def get_config_raw():
    path = get_config_path()
    if not path.exists():
        return {"yaml": ""}
    return {"yaml": path.read_text(encoding="utf-8")}

class RawConfigUpdate(BaseModel):
    yaml: str

@app.put("/api/config/raw")
async def update_config_raw(body: RawConfigUpdate):
    try:
        parsed = yaml.safe_load(body.yaml)
        if not isinstance(parsed, dict):
            raise HTTPException(status_code=400, detail="YAML must be a mapping")
        save_config(parsed)
        return {"ok": True}
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")
```

---

### Task 6: Token/Cost Analytics Endpoint

**Objective:** Aggregate token usage and cost data by day.

**Files:**
- Modify: `hermes_cli/web_server.py`

```python
@app.get("/api/analytics/usage")
async def get_usage_analytics(days: int = 30):
    from hermes_state import SessionDB
    db = SessionDB()
    try:
        cutoff = time.time() - (days * 86400)
        cur = db.conn.execute("""
            SELECT date(started_at, 'unixepoch') as day,
                   SUM(input_tokens) as input_tokens,
                   SUM(output_tokens) as output_tokens,
                   SUM(cache_read_tokens) as cache_read_tokens,
                   SUM(reasoning_tokens) as reasoning_tokens,
                   SUM(estimated_cost_usd) as estimated_cost,
                   SUM(actual_cost_usd) as actual_cost,
                   COUNT(*) as sessions,
                   model
            FROM sessions WHERE started_at > ?
            GROUP BY day, model ORDER BY day
        """, (cutoff,))
        rows = [dict(r) for r in cur.fetchall()]

        # Also get totals
        cur2 = db.conn.execute("""
            SELECT SUM(input_tokens) as total_input,
                   SUM(output_tokens) as total_output,
                   SUM(cache_read_tokens) as total_cache_read,
                   SUM(reasoning_tokens) as total_reasoning,
                   SUM(estimated_cost_usd) as total_estimated_cost,
                   SUM(actual_cost_usd) as total_actual_cost,
                   COUNT(*) as total_sessions
            FROM sessions WHERE started_at > ?
        """, (cutoff,))
        totals = dict(cur2.fetchone())
        return {"days": rows, "totals": totals, "period_days": days}
    finally:
        db.close()
```

---

## Phase 2: Frontend Pages

### Task 7: Add Navigation for New Pages

**Objective:** Update App.tsx to add Session, Logs, Cron, Skills, Analytics nav items.

**Files:**
- Modify: `web/src/App.tsx`

Add to NAV_ITEMS:
```typescript
{ id: "sessions", label: "Sessions", icon: MessageSquare },
{ id: "logs", label: "Logs", icon: FileText },
{ id: "cron", label: "Cron", icon: Clock },
{ id: "skills", label: "Skills", icon: Puzzle },
{ id: "analytics", label: "Usage", icon: BarChart3 },
```

And corresponding page renders in the main switch.

---

### Task 8: Session Viewer Page

**Objective:** Browse sessions, click to view full conversation.

**Files:**
- Create: `web/src/pages/SessionsPage.tsx`

Features:
- Session list with search/filter (reuse StatusPage session display)
- Click a session → expand to show full message history
- Messages rendered with role labels (user/assistant/tool/system)
- Tool calls shown in collapsible panels
- Delete session button

---

### Task 9: Log Viewer Page

**Objective:** Tail logs with level/component filtering.

**Files:**
- Create: `web/src/pages/LogsPage.tsx`

Features:
- File selector (agent / errors / gateway)
- Level filter (DEBUG/INFO/WARNING/ERROR)
- Component filter (gateway/agent/tools/cli/cron)
- Lines count slider (50-500)
- Auto-refresh toggle (poll every 5s)
- Log output in monospace scrollable container
- Color-coded log levels

---

### Task 10: Cron Management Page

**Objective:** View, create, edit, pause/resume, delete cron jobs.

**Files:**
- Create: `web/src/pages/CronPage.tsx`

Features:
- Job list with status badges (enabled/paused/failed)
- Create new job form (prompt, schedule, name, deliver)
- Pause/Resume/Trigger/Delete actions per job
- Last run status and next run time display

---

### Task 11: Skills & Tools Page

**Objective:** Browse and toggle skills/tools.

**Files:**
- Create: `web/src/pages/SkillsPage.tsx`

Features:
- Skills list with enable/disable toggles
- Category filtering
- Tools/toolsets list with availability badges

---

### Task 12: Config Search + Raw YAML Toggle

**Objective:** Add search bar to config page, add YAML/Form mode toggle.

**Files:**
- Modify: `web/src/pages/ConfigPage.tsx`

Features:
- Search input at top filters fields across ALL tabs (matches key name and description)
- "Form / YAML" toggle button next to Save
- YAML mode: shows raw config.yaml in a textarea with Save
- Form mode: existing schema-driven form

---

### Task 13: Usage Analytics Page

**Objective:** Visualize token usage and costs over time.

**Files:**
- Create: `web/src/pages/AnalyticsPage.tsx`

Features:
- Period selector (7d / 30d / 90d)
- Summary cards: total tokens, total cost, total sessions
- Daily breakdown table (day, sessions, input/output tokens, cost)
- Per-model breakdown
- Simple bar chart using CSS (no charting library — keep bundle small)

---

## Phase 3: Tests + Build + Push

### Task 14: Backend Tests

**Objective:** Test all new endpoints.

**Files:**
- Modify: `tests/hermes_cli/test_web_server.py`

Tests to add:
- test_get_logs_default
- test_get_logs_filtered
- test_cron_list_empty
- test_cron_create_and_list
- test_skills_list
- test_skill_toggle
- test_toolsets_list
- test_config_raw_get
- test_config_raw_put_valid
- test_config_raw_put_invalid
- test_analytics_usage

### Task 15: Build, Full Test Suite, Amend, Push

**Objective:** Rebuild frontend, run all tests, amend commit, force push.

```bash
cd web && npm run build
cd .. && python -m pytest tests/hermes_cli/test_web_server.py tests/hermes_cli/test_config.py tests/hermes_cli/test_commands.py -n0 -q
git add -A && git commit --amend --no-edit
git push origin feat/web-ui-dashboard-salvage --force
```
