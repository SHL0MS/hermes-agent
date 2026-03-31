---
name: research-tracker
title: Research Tracker — DAG-Based Experiment Management
description: "Local DAG-based experiment tracking for research projects. Create hypothesis-experiment-result graphs with branching, merging, artifact attachment, and structured outcomes. Think 'git for research' — tracks what you tried, what worked, and why, as a directed acyclic graph backed by SQLite. Use when managing multi-experiment research, tracking hypotheses and their results, organizing research artifacts, or maintaining an auditable record of a research program."
version: 1.0.0
author: SHL0MS
license: MIT
dependencies: []
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Research, Experiments, Tracking, DAG, Hypothesis, Artifacts]
    category: research
    related_skills: [research-paper-writing, arxiv, ml-paper-writing]
    requires_toolsets: [terminal, files]
---

# Research Tracker

Local DAG-based experiment state management. Tracks hypotheses, experiments, results, and their relationships as a directed acyclic graph backed by SQLite.

## When to Use

Use this skill when:
- Managing a research project with multiple experiments and hypotheses
- Tracking which experiments branched from which ideas
- Recording results with structured outcomes (positive/negative/mixed/inconclusive)
- Attaching artifacts (tables, plots, code, checkpoints) to experiment nodes
- Needing an auditable record of what was tried and what worked
- Comparing approaches that branched from the same hypothesis
- Generating research summaries from the experiment graph

Do NOT use this for:
- Writing the paper itself (use `research-paper-writing` skill)
- Searching literature (use `arxiv` skill)
- Running training jobs (use `mlops/training/*` skills)
- Provisioning compute (use `mlops/cloud/modal` or `lambda-labs` skills)

## Core Concepts

### Nodes

Every unit of research is a **node** in the DAG:

| Kind | Purpose | Example |
|------|---------|---------|
| **insight** | A hypothesis, observation, or idea | "Attention mechanisms may improve translation quality" |
| **empirical** | An experiment that tests a hypothesis | "Train 6-layer transformer on WMT14 EN-DE" |
| **meta** | A synthesis or comparison of multiple results | "Comparison of all transformer variants" |

### Node Lifecycle

```
open → running → committed (with outcome)
                → abandoned (with reason)
```

Every committed node must have:
- **outcome**: `positive`, `negative`, `mixed`, or `inconclusive`
- **summary**: one-line result description

### Edges

Nodes connect via directed edges:

| Type | Meaning | Example |
|------|---------|---------|
| **derives** | Child was motivated by parent | Experiment derives from hypothesis |
| **merges** | Node synthesizes multiple parents | Meta-analysis merges experiment results |
| **refines** | Child is an improved version of parent | Experiment v2 refines experiment v1 |

### Artifacts

Attach files and data to nodes:

| Type | Use for |
|------|---------|
| `table` | CSV/TSV results, ablation tables |
| `plot` | Charts, visualizations |
| `text` | Notes, observations, writeups |
| `code` | Scripts, notebooks, configs |
| `checkpoint` | Model weights, training state |
| `diff` | Code changes, config diffs |
| `json` | Structured data, hyperparameters |
| `image` | Screenshots, diagrams |
| `log` | Training logs, eval output |

## Setup

The tracker is a single Python file with no external dependencies (stdlib only):

```bash
# Initialize a project in the current directory
python3 skills/research/research-tracker/scripts/tracker.py init "My Research Project"
```

This creates `.research_tracker.db` in the current directory. All operations read from and write to this file.

## Workflow

### 1. Start with a hypothesis

```bash
python3 tracker.py node create \
  --kind insight \
  --title "Hypothesis: MoE models benefit from expert-specific learning rates"
# → Created insight node: n_abc123
```

### 2. Branch into experiments

```bash
python3 tracker.py branch n_abc123 \
  --title "Experiment: per-expert Adam with cosine schedule" \
  --kind empirical \
  --hypothesis "Separate Adam states per expert improve convergence by 15%"
# → Branched: n_def456 from n_abc123

python3 tracker.py branch n_abc123 \
  --title "Experiment: shared optimizer baseline" \
  --kind empirical \
  --hypothesis "Shared optimizer is sufficient — the gain is in architecture not optimization"
# → Branched: n_ghi789 from n_abc123
```

### 3. Attach artifacts as you work

```bash
python3 tracker.py artifact add n_def456 \
  --type json \
  --name "hyperparameters.json" \
  --path ./configs/per_expert_lr.json

python3 tracker.py artifact add n_def456 \
  --type log \
  --name "training.log" \
  --path ./logs/run_001.log

python3 tracker.py artifact add n_def456 \
  --type table \
  --name "results.csv" \
  --path ./results/per_expert_lr.csv
```

### 4. Commit results

```bash
python3 tracker.py node commit n_def456 \
  --outcome positive \
  --summary "Per-expert LR improved convergence by 18% (loss 2.31 vs 2.73 at step 50k)"

python3 tracker.py node commit n_ghi789 \
  --outcome negative \
  --summary "Shared optimizer baseline converged 22% slower, confirming per-expert benefit"
```

### 5. Merge findings

```bash
python3 tracker.py merge n_def456 n_ghi789 \
  --title "Finding: per-expert optimization is essential for MoE convergence" \
  --summary "Both experiments confirm that expert-specific learning rates improve MoE training"
```

### 6. Branch further

New questions arise from results — branch and continue:

```bash
python3 tracker.py branch n_def456 \
  --title "Follow-up: does per-expert LR also help at scale (32B)?" \
  --kind empirical
```

### 7. Export and review

```bash
# Status summary
python3 tracker.py status

# Mermaid graph (paste into any Mermaid renderer)
python3 tracker.py graph --format mermaid

# Full markdown export
python3 tracker.py export --format markdown --output research_summary.md

# JSON for programmatic access
python3 tracker.py export --format json --output research_data.json
```

## Agent Usage Patterns

When the agent uses this skill, it should follow these patterns:

### Starting a research task

1. Initialize the tracker if `.research_tracker.db` doesn't exist
2. Create an insight node for the research question
3. Branch empirical nodes for each experiment to run
4. Attach configs and scripts as artifacts before running

### During experiments

1. Update node status to `running` when starting: `tracker.py node update <id> --status running`
2. Attach intermediate artifacts (logs, checkpoints) as they're produced
3. Commit with structured outcome when done

### After experiments

1. Review the graph: `tracker.py graph --format mermaid`
2. Identify which branches succeeded, which failed
3. Create merge nodes to synthesize findings
4. Branch new experiments from insights
5. Export for the paper-writing skill: `tracker.py export --format markdown`

### Abandoning dead ends

Don't delete failed experiments — abandon them with a reason:

```bash
python3 tracker.py node abandon n_xyz \
  --reason "OOM at 32B scale, need gradient checkpointing first"
```

Failed experiments are valuable data. The graph should record what didn't work and why.

## Integration with Other Skills

| Skill | Integration |
|-------|-------------|
| `research-paper-writing` | Export the tracker's markdown summary as input for the paper's experiment section |
| `arxiv` | Attach paper references as text artifacts on insight nodes |
| `mlops/training/*` | Run training jobs, attach logs and checkpoints to empirical nodes |
| `mlops/cloud/modal` | Provision compute for experiments, note the instance details as artifacts |

## Data Model

```
┌─────────────┐     derives     ┌─────────────┐     merges     ┌─────────────┐
│   insight    │ ──────────────► │  empirical   │ ·············► │    meta      │
│             │                 │              │                │              │
│ hypothesis  │                 │ hypothesis   │                │ summary      │
│ description │                 │ outcome      │                │ outcome      │
│             │                 │ summary      │                │              │
└─────────────┘                 └──────┬───────┘                └──────────────┘
                                       │
                                       │ has
                                       ▼
                                ┌─────────────┐
                                │  artifact    │
                                │              │
                                │ type, name   │
                                │ path/content │
                                └─────────────┘
```

## Storage

- **Database:** `.research_tracker.db` in the project directory (SQLite, WAL mode)
- **No external dependencies:** stdlib only (sqlite3, json, hashlib)
- **Portable:** copy the `.db` file to share the full research graph
- **Export:** JSON and Markdown for archival and paper writing

## Script Location

The tracker script is at:
```
skills/research/research-tracker/scripts/tracker.py
```

Run via:
```bash
python3 skills/research/research-tracker/scripts/tracker.py <command>
```

Or from within the project directory after copying the script locally.
