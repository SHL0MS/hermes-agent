# Research Tracker

Local DAG-based experiment management for research projects. Track hypotheses, experiments, results, and their relationships as a directed acyclic graph.

## Quick Start

```bash
# Initialize
python3 scripts/tracker.py init "My Project"

# Create a hypothesis
python3 scripts/tracker.py node create -k insight -t "Hypothesis: X improves Y"

# Branch into experiments
python3 scripts/tracker.py branch <node_id> -t "Experiment: test X" -k empirical

# Commit results
python3 scripts/tracker.py node commit <node_id> -o positive -s "X improved Y by 18%"

# Attach artifacts
python3 scripts/tracker.py artifact add <node_id> --type table --path results.csv

# View the graph
python3 scripts/tracker.py graph --format mermaid

# Export
python3 scripts/tracker.py export --format markdown
```

## Features

- **DAG structure** — hypotheses branch into experiments, experiments merge into findings
- **Structured outcomes** — every committed node has an outcome (positive/negative/mixed/inconclusive) and summary
- **Artifact attachment** — tables, plots, code, logs, checkpoints linked to their experiment
- **Export** — JSON, Markdown, and Mermaid diagram formats
- **Zero dependencies** — Python stdlib only (sqlite3)
- **Portable** — single `.research_tracker.db` file, copy to share

## Node Types

| Kind | Purpose |
|------|---------|
| `insight` | Hypotheses, observations, questions |
| `empirical` | Experiments that test hypotheses |
| `meta` | Syntheses that merge multiple results |

## Integration

Works alongside other Hermes research skills:
- **research-paper-writing** — export tracker summaries as paper input
- **arxiv** — attach paper references to insight nodes
- **mlops/training/** — track training runs as empirical nodes
- **mlops/cloud/modal** — note compute resources as artifacts
