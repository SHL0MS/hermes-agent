---
name: hermes-agent-dev
description: Development workflow for the hermes-agent codebase — bug fixing, issue triage, PR review, architecture reference, and deployment. Use this skill when working on hermes-agent itself.
version: 1.1.0
author: Hermes Agent + Teknium
license: MIT
metadata:
  hermes:
    tags: [hermes-agent, development, workflow, NousResearch]
    related_skills: [github-code-review, github-issues, github-pr-workflow, deepwiki-research]
---

# Hermes Agent Development Workflow

Use this skill when working on the hermes-agent codebase itself — fixing bugs, reviewing PRs, triaging issues, or making improvements.

## Important Policies

- **Prompt caching is sacred.** We DO NOT attempt implementations that change past context, change toolsets mid-conversation, or reload memories/rebuild system prompts. The ONLY time we alter context is during context compression. Do not create issues or make changes that would break this.
- **Competitor analysis is internal only.** Never mention competitors (OpenClaw, OpenCode, Gemini CLI, aider, etc.) in PR descriptions, issue bodies, commit messages, or any public-facing output. Use competitor findings only for local planning.

## Environment

- **Repo:** NousResearch/hermes-agent on GitHub
- **Base branch:** Always start from `main` rebased onto `upstream/main`
- **Worktree:** Always do implementation work in a dedicated git worktree, not the primary checkout
- **Branch:** Feature branch from rebased `main` → submit PR (maintainers merge to main)
- **Venv:** Prefer `.venv` inside the repo. Worktrees may not have their own `.venv` — activate the primary checkout's environment with an absolute path if needed.

## Architecture — Key Files

| Area | File(s) | Purpose |
|------|---------|---------|
| CLI entry | cli.py | HermesCLI class, load_cli_config() |
| Agent core | run_agent.py | AIAgent class — conversation loop, tool dispatch |
| Tool definitions | model_tools.py | get_tool_definitions(), handle_function_call() |
| Toolset system | toolsets.py | TOOLSETS dict, resolve_toolset() |
| Gateway | gateway/run.py | Telegram/Discord/WhatsApp/Slack message handling |
| Sessions | gateway/session.py | SessionStore — conversation persistence |
| State DB | hermes_state.py | SessionDB — SQLite session metadata (FTS5 search) |
| Config system | hermes_cli/config.py | load_config(), DEFAULT_CONFIG, OPTIONAL_ENV_VARS, migration |
| Setup wizard | hermes_cli/setup.py | Interactive setup |
| Plugins | hermes_cli/plugins.py, plugins_cmd.py | Plugin discovery, loading, install/update/remove CLI |
| Logging | hermes_logging.py | Structured logging setup |
| Model registry | agent/models_dev.py | models.dev integration (provider-aware context) |
| Prompt builder | agent/prompt_builder.py | System prompt assembly |
| Context compression | agent/context_compressor.py | Auto context compression |
| Slash commands | hermes_cli/commands.py | Central COMMAND_REGISTRY |
| Skin engine | hermes_cli/skin_engine.py | CLI visual theming |
| Tool config UI | hermes_cli/tools_config.py | `hermes tools` per-platform toggling |
| Terminal | tools/terminal_tool.py | Shell execution, process management |
| File tools | tools/file_tools.py | read/write/search/patch |
| Browser | tools/browser_tool.py | Browserbase integration |
| Web tools | tools/web_tools.py | Parallel + Firecrawl search/extract |

## Workflow: Fixing Bugs / Issues

### 1. Understand the issue
```bash
gh auth status                    # verify active account matches fork
gh issue view <NUMBER>
gh pr list --search "<NUMBER>" --state all  # check for existing PRs
```

### 2. Research before implementing
Load `deepwiki-research` to study the relevant Hermes subsystem and how competitors solved the problem. Research flow:
1. Identify 1-3 relevant external repos (prioritize OpenClaw, then OpenCode)
2. Extract the specific mechanism they use — not vague summaries
3. Compare against Hermes constraints: prompt caching, profile-aware paths, gateway/CLI parity, testability
4. Verify the competitor's actual implementation before inferring capabilities from reputation
5. For model/provider UX: distinguish live mutable session state from Hermes-safe frozen-per-session semantics

### 3. Verify against the codebase
Don't trust issue descriptions blindly. Use `search_files` and `read_file` to verify actual implementation. If a feature previously existed, inspect `git log --all --grep='<feature>'` before redesigning — prefer restoring prior behavior over reinventing.

If `@file:` context references report "outside allowed workspace", treat as blocking — ask the user to paste or copy the file in before proceeding.

### 4. Create worktree, branch, and implement
```bash
git checkout main
git fetch upstream && git pull --rebase upstream main
git worktree add .worktrees/<branch> -b <branch>
cd .worktrees/<branch>
```

Rules:
- Worktree from freshly rebased `main` — if drifted, rebase first
- Keep primary checkout clean for future worktrees
- Before opening a PR, verify the fix is still missing on fresh `upstream/main`
- Branch naming: `fix/`, `feat/`, `docs/`, `refactor/` prefixes

### PR splitting
When splitting a broad change into multiple PRs, inspect the full diff and audit import dependencies first. A PR that looks CLI-only may depend on shared gateway helpers. Prefer a slightly broader but actually independent PR over an artificially pure split that fails in isolation.

### Refreshing an older PR
```bash
git worktree add .worktrees/pr-refresh -b pr-refresh upstream/main
cd .worktrees/pr-refresh
git fetch origin <pr-branch>
git checkout -B <pr-branch> FETCH_HEAD
git merge upstream/main
```
Conflict resolution: treat `upstream/main` as source of truth. Preserve newer semantics, re-apply only PR-specific changes.

### Stacked PRs from a fork
1. First PR: against `NousResearch:main` normally
2. Follow-up PR: fork-to-fork with base=`kshitijk4poor:<prev-branch>`, head=`kshitijk4poor:<next-branch>`
3. Note in body it's stacked and should be retargeted after base lands

### 5. Self-review before posting

After committing and pushing, run the `hermes-pr-review` skill against your own branch before opening the PR. This catches issues before a maintainer sees them. Load it with `skill_view("hermes-pr-review")` and run Phase 2 (parallel tests + live test + 4-angle review + codex) from your implementation worktree. Fix anything found, amend the commit, force-push, then open the PR.

### 6. Comment on the issue linking your PR

## Workflow: Reviewing PRs

```bash
gh pr view <NUMBER>
gh pr diff <NUMBER>
# For stacked PRs, diff against the base PR, not main:
git fetch upstream pull/<BASE>/head:pr-<BASE> pull/<NUMBER>/head:pr-<NUMBER>
git diff pr-<BASE>...pr-<NUMBER>
```

CLI/UI feature PR checklist:
- New slash command → confirm in `COMMAND_REGISTRY` in `hermes_cli/commands.py`
- New config key → confirm in defaults/config plumbing, not just `.get()`
- User-facing toggle → confirm `save_config_value()` persistence
- Display/rendering → run `python -m hermes_cli.main -w chat -q "..."` and inspect real output
- Use `script -q /tmp/test.txt python -m hermes_cli.main -w chat -q "..." < /dev/null` for durable rendering evidence

## Config System

Two separate config loaders:

| Loader | Used by | Location |
|--------|---------|----------|
| load_cli_config() | CLI mode | cli.py — merges hardcoded defaults + user YAML |
| load_config() | hermes tools/setup | hermes_cli/config.py — merges DEFAULT_CONFIG + user YAML |
| Direct YAML load | Gateway | gateway/run.py |

Pitfall: If you add a config key, ensure it's in BOTH default dicts or that the merge logic carries it.

## Testing

Full suite (~3000+ tests). Always run before submitting:
```bash
source .venv/bin/activate
python -m pytest tests/ -q
```

Targeted iteration:
```bash
python -m pytest tests/test_run_agent.py tests/test_model_tools.py -q
python -m pytest tests/test_plugins.py tests/test_plugins_cmd.py -q
python -m pytest tests/gateway/ -q
python -m pytest tests/tools/ -q
```

For credential/auth PRs:
```bash
python -m pytest tests/test_credential_pool.py tests/test_auth_commands.py tests/test_runtime_provider_resolution.py tests/test_run_agent.py -q
```

## Live Testing

```bash
python -m hermes_cli.main chat -q "What tools do you have available?"
python -m hermes_cli.main chat -m "anthropic/claude-sonnet-4"
```

| Change type | What to test |
|-------------|-------------|
| New tool | Ask agent to use it, verify schema + execution + rendering |
| Display/UI | Interactive CLI, visually inspect rendering |
| Config option | Set in config.yaml, verify behavior in session |
| Gateway | Send message from the platform, check response |
| Setup UX | Run real wizard (`hermes setup model`), walk actual prompts |
| Session/state | Create → exit → resume, verify continuity |

## Code Review: 3-Agent Parallel Review (Simplify Pattern)

When reviewing code changes (PRs, local diffs, or post-implementation), spawn 3 specialized subagents in parallel via `delegate_task(tasks=[...])`. Each gets the full diff and analyzes from a different angle:

**Agent 1 — Code Reuse:** Search the codebase for existing utilities that could replace newly written code. Flag duplicated functionality and inline logic that could use existing helpers.

**Agent 2 — Code Quality:** Flag redundant state, parameter sprawl, copy-paste variations, leaky abstractions, and unnecessary comments (keep only non-obvious WHY comments).

**Agent 3 — Efficiency:** Flag unnecessary work (redundant computations, repeated reads, N+1), missed concurrency, hot-path bloat, memory leaks, and overly broad operations.

Aggregate findings from all 3, discard false positives, fix or report each issue. Do not attribute findings to individual agents in any output.

## Agent Loop Optimization: Tool-Result Hint Injection

When observability reveals inefficient agent behavior, the established pattern is **tool-result hint injection** — NOT system prompt changes (which break caching).

Follow the budget-warning pattern in `run_agent.py`:
1. Define a regex for cleanup
2. Add `_strip_my_hints_from_history(messages)` — mirrors budget warning cleanup
3. Add a detector method on `AIAgent` that returns hint string or `None`
4. Inject in BOTH `_execute_tool_calls_concurrent` and `_execute_tool_calls_sequential`
5. Strip on replay alongside `_strip_budget_warnings_from_history()`
6. Track state on `self`, reset in `reset_session_state()`

Constraints:
- Never modify system prompt
- Hints are turn-scoped: injected after tool execution, stripped before next API call
- JSON results get a key (`parsed["_my_hint"] = hint`); plaintext gets `content + f"\n\n{hint}"`
- Tool-specific advice (not generic) — e.g., `terminal` → "combine with `&&`", `read_file` → "use `execute_code` to batch"
- Hints fire for ANY tool, not a hardcoded set

## Commit Conventions

Types: `fix:`, `feat:`, `refactor:`, `docs:`, `chore:`

Contributor credit: maintainers prefer merge commits (--no-ff) to preserve attribution.

## Deployment

- CLI changes → next session start
- Gateway changes → `hermes gateway restart`
- Config changes → next session/message

## Common Pitfalls

1. **Two config loaders** — CLI and gateway read config differently. Add keys to both.
2. **Pipe git to cat** — `git push 2>&1 | cat` prevents pager hangs.
3. **Git remote names vary** — don't assume `upstream` or `origin`. Check `git remote -v` first. Contributor installs may have any naming.
4. **Heavy CLI imports** — always activate `.venv` first or imports fail silently.
5. **Gateway reads config per-message** — CLI reads once at startup.
6. **`_HERMES_CORE_TOOLS` in toolsets.py** — shared tool list; editing it changes every platform.
7. **Display redaction** — `terminal`/`read_file` redact sensitive patterns (e.g., `api_key` → `***`). Display-time only; actual content unchanged. For auth/credential files, verify with `python3 -c "print(open('file').read())"` to bypass redaction. **Subagent pitfall:** `write_file` via `delegate_task` can write corrupted values when auth-adjacent strings get redacted on disk. Always verify files touching auth literals.
8. **CI vs local divergence** — optional deps (`acp`, `parallel`, `faster_whisper`) may be absent locally. Check `gh run view --log-failed` first, reproduce exact failing tests.
9. **Pre-existing test failures** — if a focused PR surfaces broader `main` failures, reproduce on clean `upstream/main` first. Keep the PR narrowly scoped; raise separate PRs for unrelated test drift. Note in the PR body that failures are pre-existing.
10. **Path aliasing in concurrent file tools** — relative vs absolute paths can bypass overlap checks. Normalize paths before testing parallel safety.
11. **Merge conflict resolution** — preserve newer upstream semantics in shared files (`display.py`, `run_agent.py`), re-apply only PR-specific changes.
12. **Model/provider switching is a session-boundary concern** — `/model` was removed in PR #3080. Mid-session changes should force a fresh session/agent rebuild, not silently mutate.
13. **Third-party Anthropic providers** — may use `Authorization: Bearer` instead of `x-api-key`. Verify auth-header expectations alongside message-format compatibility.
14. **`hermes update` dep fallback** — don't treat `pip install -e .[all]` as all-or-nothing. Retry optional extras individually when one fails.
15. **Think-block / empty-content triage** — search GitHub with `gh api -X GET search/issues --field q='repo:NousResearch/hermes-agent "<error>"'` before designing a fix. Key PRs: #2124, #4467, #2070.
