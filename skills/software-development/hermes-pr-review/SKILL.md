---
name: hermes-pr-review
description: Review a Hermes PR end-to-end — fetch into a worktree, run tests, live-test with hermes -w, run parallel review agents + codex, then post findings. Use when asked to review a PR against NousResearch/hermes-agent.
version: 1.1.0
author: kshitijk4poor
license: MIT
metadata:
  hermes:
    tags: [hermes-agent, code-review, PR, testing, codex]
    related_skills: [hermes-agent-dev, github-code-review, github-pr-workflow]
---

# Hermes PR Review

End-to-end review workflow for PRs against NousResearch/hermes-agent. Maximizes parallelism — tests, live testing, and 4 review agents all run concurrently.

## When to use

- "Review PR #1234"
- "Check this hermes PR"
- "Is this PR ready to merge?"

## Prerequisites

- Inside the hermes-agent repo (or a worktree of it)
- `gh` CLI authenticated
- `codex` CLI available (for automated code review)
- Primary checkout `.venv` activated

## Phase 1: Setup (sequential — must complete before anything else)

### 1a. Fetch and understand the PR

```bash
gh pr view <NUMBER> --repo NousResearch/hermes-agent
gh pr diff <NUMBER> --repo NousResearch/hermes-agent --name-only
```

Identify: what problem it solves, what files are touched, what subsystems are affected (agent loop, tools, gateway, CLI, config, setup).

### 1b. Create review worktree and capture diff

```bash
cd <hermes-agent-primary>
git fetch upstream main --quiet
git worktree add .worktrees/review-<NUMBER> upstream/main --detach
cd .worktrees/review-<NUMBER>
gh pr checkout <NUMBER> --repo NousResearch/hermes-agent
source <hermes-agent-primary>/.venv/bin/activate

# Capture diff for review agents
git diff main...HEAD > /tmp/pr-<NUMBER>-diff.txt
git diff main...HEAD --stat > /tmp/pr-<NUMBER>-stat.txt
```

## Phase 2: Parallel execution (all independent — launch together)

After the worktree is ready, launch ALL of the following concurrently. None depend on each other.

### 2a. Test suite (subagent)

### 2b. Live smoke test (subagent)

### 2c. 3-agent deep review + codex (subagent batch)

Launch everything as a single `delegate_task` call with 3 tasks:

```
delegate_task(tasks=[
    {
        "goal": "Run the hermes test suite from the review worktree and report results. Run: python -m pytest tests/ -q --tb=short 2>&1 | tail -40. If there are failures, check if they pre-exist on upstream/main by running: git stash && git checkout --detach upstream/main && python -m pytest tests/<failing_test>.py -q --tb=short && git checkout - && git stash pop. Report: total passed, total failed, which failures are new vs pre-existing.",
        "context": "Working directory: <worktree-path>. Activate venv: source <primary>/.venv/bin/activate",
        "toolsets": ["terminal"]
    },
    {
        "goal": "Live-test the PR with hermes -w. Run: hermes -w chat -q 'What tools do you have available?' to verify it starts. Then run: hermes -w chat -q '<prompt that exercises the PR change>'. Report whether hermes starts cleanly and whether the claimed feature works.",
        "context": "Working directory: <worktree-path>. The PR claims to: <PR description summary>. Test the specific change.",
        "toolsets": ["terminal"]
    },
    {
        "goal": "Perform a 4-part code review of the PR diff. Read /tmp/pr-<NUMBER>-diff.txt for the full diff, then analyze from these 4 angles and report ALL findings in a single structured response:\n\n1. CODE REUSE: Search the codebase for existing utilities that could replace newly written code. Flag duplicated functionality and inline logic that could use existing helpers (string manipulation, path handling, env checks, type guards).\n\n2. CODE QUALITY: Flag redundant state, parameter sprawl, copy-paste variations, leaky abstractions, and unnecessary comments (keep only non-obvious WHY comments).\n\n3. EFFICIENCY: Flag unnecessary work (redundant computations, repeated reads, N+1), missed concurrency, hot-path bloat, memory leaks, overly broad operations.\n\n4. HERMES-SPECIFIC: Check for prompt caching violations (system prompt changes, mid-session toolset mutation), hardcoded ~/.hermes paths (should use get_hermes_home()), config keys missing from both DEFAULT_CONFIG and load_cli_config(), new tools not registered in both model_tools.py and toolsets.py, tool handlers not returning JSON strings, hardcoded cross-tool schema references.\n\nFormat findings as: Critical / Warnings / Suggestions / Looks Good.",
        "context": "Diff file: /tmp/pr-<NUMBER>-diff.txt. Stat: /tmp/pr-<NUMBER>-stat.txt. Repo: NousResearch/hermes-agent. Working directory: <worktree-path>.",
        "toolsets": ["terminal", "file"]
    }
])
```

Separately, also launch codex:

```
delegate_task(
    goal="Review the code changes in this branch against main. Run /review to analyze the diff. Report: critical issues, warnings, suggestions, and what looks good. Focus on correctness, error handling, security, and edge cases.",
    context="PR review for NousResearch/hermes-agent. Branch checked out in this worktree. Base branch: main. PR title: '<title>'. PR description: '<description>'",
    acp_command="codex",
    acp_args=["--acp", "--stdio"],
    toolsets=["terminal", "file"]
)
```

Note: `delegate_task` supports max 3 tasks per batch call, so the codex call is a separate delegate. But it runs concurrently with the batch above since both are non-blocking.

## Phase 3: Compile and post (after all Phase 2 completes)

### 3a. Aggregate results

From the 3 subagent results + codex, compile:
- **Test results** — X passed, Y failed (Z pre-existing)
- **Live test** — starts cleanly ✓/✗, feature works ✓/✗
- **Review findings** — merge all 4 review perspectives, dedupe, discard false positives

Do NOT attribute any finding to a specific agent or tool.

### 3b. Post the review

```bash
# Verdict
gh pr review <NUMBER> --repo NousResearch/hermes-agent --approve \
  --body "Tests pass, live-tested, looks good."
# OR
gh pr review <NUMBER> --repo NousResearch/hermes-agent --request-changes \
  --body "<structured findings>"
```

For inline comments:
```bash
HEAD_SHA=$(gh pr view <NUMBER> --repo NousResearch/hermes-agent --json headRefOid --jq '.headRefOid')
gh api repos/NousResearch/hermes-agent/pulls/<NUMBER>/comments \
  --method POST \
  -f body="Issue description" \
  -f path="path/to/file.py" \
  -f commit_id="$HEAD_SHA" \
  -f line=42 \
  -f side="RIGHT"
```

### Review output format

```
## PR Review — #<NUMBER>: <title>

**Verdict:** Approve / Request Changes / Comment
**Tests:** X passed, Y failed (Z pre-existing)
**Live test:** hermes -w ✓ / ✗

### Critical
- **file:line** — description

### Warnings
- **file:line** — description

### Suggestions
- **file:line** — description

### Looks Good
- What's well done
```

### Verdict decision

- **Approve** — no critical/warning issues, tests pass, live test works
- **Request Changes** — any critical or warning issue that must be fixed
- **Comment** — observations only, nothing blocking (use for drafts or when unsure)

## Phase 4: Cleanup

```bash
cd <hermes-agent-primary>
git worktree remove .worktrees/review-<NUMBER> --force
```
