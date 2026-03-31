#!/usr/bin/env python3
"""Research Tracker — local DAG-based experiment state management.

A lightweight SQLite-backed directed acyclic graph for tracking research:
hypotheses, experiments, results, and their relationships. Think "git for
research" without the external dependency.

Usage (CLI):
    python tracker.py init [project_name]
    python tracker.py node create --kind insight --title "Initial hypothesis"
    python tracker.py node create --kind empirical --title "Baseline experiment" --parent <node_id>
    python tracker.py node commit <node_id> --outcome positive --summary "Baseline BLEU: 32.4"
    python tracker.py artifact add <node_id> --type table --path results.csv
    python tracker.py branch <node_id> --title "Alternative: larger model"
    python tracker.py merge <node_a> <node_b> --title "Combined findings"
    python tracker.py graph [--format json|markdown|mermaid]
    python tracker.py export [--format json|markdown|pdf]
    python tracker.py status

Usage (Python):
    from tracker import ResearchTracker
    tracker = ResearchTracker("my_project")
    node_id = tracker.create_node(kind="empirical", title="Baseline run")
    tracker.add_artifact(node_id, artifact_type="table", path="results.csv")
    tracker.commit_node(node_id, outcome="positive", summary="BLEU: 32.4")
"""

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS project (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  REAL NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS nodes (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL CHECK (kind IN ('insight', 'empirical', 'meta')),
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'running', 'committed', 'abandoned')),
    outcome     TEXT CHECK (outcome IN (NULL, 'positive', 'negative', 'mixed', 'inconclusive')),
    summary     TEXT,
    hypothesis  TEXT,
    created_at  REAL NOT NULL,
    committed_at REAL,
    tags        TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS edges (
    parent_id   TEXT NOT NULL REFERENCES nodes(id),
    child_id    TEXT NOT NULL REFERENCES nodes(id),
    edge_type   TEXT NOT NULL DEFAULT 'derives' CHECK (edge_type IN ('derives', 'merges', 'refines')),
    created_at  REAL NOT NULL,
    PRIMARY KEY (parent_id, child_id)
);

CREATE TABLE IF NOT EXISTS artifacts (
    id          TEXT PRIMARY KEY,
    node_id     TEXT NOT NULL REFERENCES nodes(id),
    type        TEXT NOT NULL CHECK (type IN ('table', 'plot', 'text', 'code', 'checkpoint', 'diff', 'json', 'image', 'html', 'log', 'other')),
    name        TEXT NOT NULL,
    path        TEXT,
    content     TEXT,
    metadata    TEXT DEFAULT '{}',
    created_at  REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edges_parent ON edges(parent_id);
CREATE INDEX IF NOT EXISTS idx_edges_child ON edges(child_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_node ON artifacts(node_id);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
"""


# ---------------------------------------------------------------------------
# ID generation
# ---------------------------------------------------------------------------


def _make_id(prefix: str = "n") -> str:
    raw = f"{time.time_ns()}-{os.getpid()}-{os.urandom(4).hex()}"
    short = hashlib.sha256(raw.encode()).hexdigest()[:10]
    return f"{prefix}_{short}"


# ---------------------------------------------------------------------------
# Tracker
# ---------------------------------------------------------------------------


class ResearchTracker:
    """DAG-based research state tracker backed by a local SQLite database."""

    DB_NAME = ".research_tracker.db"

    def __init__(self, project_dir: Optional[str] = None):
        self.project_dir = Path(project_dir or os.getcwd()).resolve()
        self.db_path = self.project_dir / self.DB_NAME
        self._conn: Optional[sqlite3.Connection] = None

    # -- connection --

    def _connect(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(str(self.db_path), timeout=10)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        return self._conn

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None

    # -- init --

    def init_project(self, name: str, description: str = "") -> str:
        conn = self._connect()
        conn.executescript(_SCHEMA)
        project_id = _make_id("proj")
        conn.execute(
            "INSERT OR IGNORE INTO project (id, name, created_at, description) VALUES (?, ?, ?, ?)",
            (project_id, name, time.time(), description),
        )
        conn.commit()
        return project_id

    def _ensure_initialized(self):
        conn = self._connect()
        try:
            conn.execute("SELECT 1 FROM nodes LIMIT 1")
        except sqlite3.OperationalError:
            conn.executescript(_SCHEMA)
            conn.commit()

    # -- nodes --

    def create_node(
        self,
        kind: str,
        title: str,
        description: str = "",
        hypothesis: str = "",
        parent_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> str:
        self._ensure_initialized()
        conn = self._connect()
        node_id = _make_id("n")
        now = time.time()
        conn.execute(
            "INSERT INTO nodes (id, kind, title, description, hypothesis, created_at, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                node_id,
                kind,
                title,
                description,
                hypothesis,
                now,
                json.dumps(tags or []),
            ),
        )
        if parent_id:
            conn.execute(
                "INSERT INTO edges (parent_id, child_id, edge_type, created_at) VALUES (?, ?, 'derives', ?)",
                (parent_id, node_id, now),
            )
        conn.commit()
        return node_id

    def update_node(self, node_id: str, **kwargs) -> None:
        self._ensure_initialized()
        conn = self._connect()
        allowed = {"title", "description", "hypothesis", "status", "tags"}
        updates = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
        if "tags" in updates and isinstance(updates["tags"], list):
            updates["tags"] = json.dumps(updates["tags"])
        if not updates:
            return
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE nodes SET {set_clause} WHERE id = ?",
            (*updates.values(), node_id),
        )
        conn.commit()

    def commit_node(self, node_id: str, outcome: str, summary: str) -> None:
        self._ensure_initialized()
        conn = self._connect()
        conn.execute(
            "UPDATE nodes SET status = 'committed', outcome = ?, summary = ?, committed_at = ? WHERE id = ?",
            (outcome, summary, time.time(), node_id),
        )
        conn.commit()

    def abandon_node(self, node_id: str, reason: str = "") -> None:
        self._ensure_initialized()
        conn = self._connect()
        summary = f"Abandoned: {reason}" if reason else "Abandoned"
        conn.execute(
            "UPDATE nodes SET status = 'abandoned', summary = ?, committed_at = ? WHERE id = ?",
            (summary, time.time(), node_id),
        )
        conn.commit()

    def get_node(self, node_id: str) -> Optional[Dict[str, Any]]:
        self._ensure_initialized()
        conn = self._connect()
        row = conn.execute("SELECT * FROM nodes WHERE id = ?", (node_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["tags"] = json.loads(d.get("tags") or "[]")
        d["artifacts"] = self.get_artifacts(node_id)
        d["parents"] = [
            r["parent_id"]
            for r in conn.execute(
                "SELECT parent_id FROM edges WHERE child_id = ?", (node_id,)
            )
        ]
        d["children"] = [
            r["child_id"]
            for r in conn.execute(
                "SELECT child_id FROM edges WHERE parent_id = ?", (node_id,)
            )
        ]
        return d

    def list_nodes(
        self, status: Optional[str] = None, kind: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        self._ensure_initialized()
        conn = self._connect()
        query = "SELECT * FROM nodes WHERE 1=1"
        params: list = []
        if status:
            query += " AND status = ?"
            params.append(status)
        if kind:
            query += " AND kind = ?"
            params.append(kind)
        query += " ORDER BY created_at DESC"
        return [dict(r) for r in conn.execute(query, params)]

    # -- edges / branching / merging --

    def add_edge(
        self, parent_id: str, child_id: str, edge_type: str = "derives"
    ) -> None:
        self._ensure_initialized()
        conn = self._connect()
        conn.execute(
            "INSERT OR IGNORE INTO edges (parent_id, child_id, edge_type, created_at) VALUES (?, ?, ?, ?)",
            (parent_id, child_id, edge_type, time.time()),
        )
        conn.commit()

    def branch(
        self, parent_id: str, title: str, kind: str = "empirical", hypothesis: str = ""
    ) -> str:
        node_id = self.create_node(
            kind=kind, title=title, hypothesis=hypothesis, parent_id=parent_id
        )
        return node_id

    def merge(
        self, node_ids: List[str], title: str, kind: str = "meta", summary: str = ""
    ) -> str:
        merge_node = self.create_node(kind=kind, title=title)
        conn = self._connect()
        now = time.time()
        for nid in node_ids:
            conn.execute(
                "INSERT OR IGNORE INTO edges (parent_id, child_id, edge_type, created_at) VALUES (?, ?, 'merges', ?)",
                (nid, merge_node, now),
            )
        if summary:
            self.commit_node(merge_node, outcome="mixed", summary=summary)
        conn.commit()
        return merge_node

    # -- artifacts --

    def add_artifact(
        self,
        node_id: str,
        artifact_type: str,
        name: str = "",
        path: Optional[str] = None,
        content: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> str:
        self._ensure_initialized()
        conn = self._connect()
        art_id = _make_id("art")
        if not name:
            name = Path(path).name if path else f"{artifact_type}_{art_id[:6]}"
        # Read file content if path provided and content not given
        if path and not content:
            p = Path(path)
            if p.exists() and p.stat().st_size < 1_000_000:  # <1MB inline
                try:
                    content = p.read_text(encoding="utf-8")
                except Exception:
                    content = None
        conn.execute(
            "INSERT INTO artifacts (id, node_id, type, name, path, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                art_id,
                node_id,
                artifact_type,
                name,
                path,
                content,
                json.dumps(metadata or {}),
                time.time(),
            ),
        )
        conn.commit()
        return art_id

    def get_artifacts(self, node_id: str) -> List[Dict[str, Any]]:
        self._ensure_initialized()
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM artifacts WHERE node_id = ? ORDER BY created_at", (node_id,)
        )
        return [dict(r) for r in rows]

    # -- graph operations --

    def get_roots(self) -> List[Dict[str, Any]]:
        """Nodes with no parents (entry points of the DAG)."""
        self._ensure_initialized()
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM nodes WHERE id NOT IN (SELECT child_id FROM edges) ORDER BY created_at"
        )
        return [dict(r) for r in rows]

    def get_graph(self) -> Dict[str, Any]:
        """Full DAG as a dict with nodes and edges."""
        self._ensure_initialized()
        conn = self._connect()
        nodes = [
            dict(r) for r in conn.execute("SELECT * FROM nodes ORDER BY created_at")
        ]
        edges = [
            dict(r) for r in conn.execute("SELECT * FROM edges ORDER BY created_at")
        ]
        for n in nodes:
            n["tags"] = json.loads(n.get("tags") or "[]")
        return {"nodes": nodes, "edges": edges}

    def get_status(self) -> Dict[str, Any]:
        """Summary statistics."""
        self._ensure_initialized()
        conn = self._connect()
        total = conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
        by_status = {}
        for row in conn.execute(
            "SELECT status, COUNT(*) as cnt FROM nodes GROUP BY status"
        ):
            by_status[row["status"]] = row["cnt"]
        by_kind = {}
        for row in conn.execute(
            "SELECT kind, COUNT(*) as cnt FROM nodes GROUP BY kind"
        ):
            by_kind[row["kind"]] = row["cnt"]
        artifact_count = conn.execute("SELECT COUNT(*) FROM artifacts").fetchone()[0]
        edge_count = conn.execute("SELECT COUNT(*) FROM edges").fetchone()[0]
        project = conn.execute("SELECT * FROM project LIMIT 1").fetchone()
        return {
            "project": dict(project) if project else None,
            "total_nodes": total,
            "by_status": by_status,
            "by_kind": by_kind,
            "total_artifacts": artifact_count,
            "total_edges": edge_count,
        }

    # -- export --

    def export_json(self) -> str:
        graph = self.get_graph()
        # Attach artifacts to each node
        for node in graph["nodes"]:
            node["artifacts"] = self.get_artifacts(node["id"])
        status = self.get_status()
        return json.dumps(
            {"project": status.get("project"), "graph": graph},
            indent=2,
            ensure_ascii=False,
        )

    def export_markdown(self) -> str:
        status = self.get_status()
        graph = self.get_graph()
        lines = []
        proj = status.get("project") or {}
        lines.append(f"# Research Tracker: {proj.get('name', 'Untitled')}")
        lines.append(f"")
        lines.append(
            f"**Nodes:** {status['total_nodes']} | **Edges:** {status['total_edges']} | **Artifacts:** {status['total_artifacts']}"
        )
        lines.append(
            f"**Status:** {', '.join(f'{k}: {v}' for k, v in status['by_status'].items())}"
        )
        lines.append(
            f"**Types:** {', '.join(f'{k}: {v}' for k, v in status['by_kind'].items())}"
        )
        lines.append("")

        for node in graph["nodes"]:
            status_icon = {
                "open": "🔵",
                "running": "🟡",
                "committed": "✅",
                "abandoned": "❌",
            }.get(node["status"], "⚪")
            kind_label = {"insight": "💡", "empirical": "🧪", "meta": "📊"}.get(
                node["kind"], ""
            )
            lines.append(f"## {status_icon} {kind_label} {node['title']}")
            lines.append(
                f"**ID:** `{node['id']}` | **Kind:** {node['kind']} | **Status:** {node['status']}"
            )
            if node.get("hypothesis"):
                lines.append(f"**Hypothesis:** {node['hypothesis']}")
            if node.get("outcome"):
                lines.append(f"**Outcome:** {node['outcome']}")
            if node.get("summary"):
                lines.append(f"**Summary:** {node['summary']}")
            if node.get("description"):
                lines.append(f"")
                lines.append(node["description"])

            arts = self.get_artifacts(node["id"])
            if arts:
                lines.append(f"")
                lines.append(f"**Artifacts ({len(arts)}):**")
                for a in arts:
                    lines.append(
                        f"- [{a['type']}] {a['name']}"
                        + (f" (`{a['path']}`)" if a.get("path") else "")
                    )
            lines.append("")

        return "\n".join(lines)

    def export_mermaid(self) -> str:
        graph = self.get_graph()
        lines = ["graph TD"]
        for node in graph["nodes"]:
            label = node["title"].replace('"', "'")[:40]
            status_class = {
                "committed": ":::done",
                "abandoned": ":::abandoned",
                "running": ":::running",
            }.get(node["status"], "")
            lines.append(f'    {node["id"]}["{label}"]{status_class}')
        for edge in graph["edges"]:
            arrow = {"derives": "-->", "merges": "-.->", "refines": "==>"}.get(
                edge["edge_type"], "-->"
            )
            lines.append(f"    {edge['parent_id']} {arrow} {edge['child_id']}")
        lines.append("    classDef done fill:#2d6a2d,stroke:#1a4a1a,color:white")
        lines.append("    classDef abandoned fill:#6a2d2d,stroke:#4a1a1a,color:white")
        lines.append("    classDef running fill:#6a5a2d,stroke:#4a3a1a,color:white")
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _cli():
    parser = argparse.ArgumentParser(
        description="Research Tracker — local DAG for experiment management"
    )
    sub = parser.add_subparsers(dest="command")

    # init
    p_init = sub.add_parser("init", help="Initialize a new research project")
    p_init.add_argument("name", nargs="?", default="research", help="Project name")
    p_init.add_argument("--description", "-d", default="", help="Project description")

    # node
    p_node = sub.add_parser("node", help="Node operations")
    node_sub = p_node.add_subparsers(dest="node_command")

    p_create = node_sub.add_parser("create", help="Create a new node")
    p_create.add_argument(
        "--kind", "-k", required=True, choices=["insight", "empirical", "meta"]
    )
    p_create.add_argument("--title", "-t", required=True)
    p_create.add_argument("--description", "-d", default="")
    p_create.add_argument("--hypothesis", default="")
    p_create.add_argument("--parent", "-p", default=None)
    p_create.add_argument("--tags", nargs="*", default=[])

    p_commit = node_sub.add_parser("commit", help="Commit a node with results")
    p_commit.add_argument("node_id")
    p_commit.add_argument(
        "--outcome",
        "-o",
        required=True,
        choices=["positive", "negative", "mixed", "inconclusive"],
    )
    p_commit.add_argument("--summary", "-s", required=True)

    p_abandon = node_sub.add_parser("abandon", help="Abandon a node")
    p_abandon.add_argument("node_id")
    p_abandon.add_argument("--reason", "-r", default="")

    p_show = node_sub.add_parser("show", help="Show node details")
    p_show.add_argument("node_id")

    p_list = node_sub.add_parser("list", help="List nodes")
    p_list.add_argument(
        "--status", choices=["open", "running", "committed", "abandoned"]
    )
    p_list.add_argument("--kind", choices=["insight", "empirical", "meta"])

    # artifact
    p_art = sub.add_parser("artifact", help="Artifact operations")
    art_sub = p_art.add_subparsers(dest="art_command")

    p_add = art_sub.add_parser("add", help="Add artifact to a node")
    p_add.add_argument("node_id")
    p_add.add_argument(
        "--type",
        required=True,
        choices=[
            "table",
            "plot",
            "text",
            "code",
            "checkpoint",
            "diff",
            "json",
            "image",
            "html",
            "log",
            "other",
        ],
    )
    p_add.add_argument("--path", default=None)
    p_add.add_argument("--name", default="")
    p_add.add_argument("--content", default=None)

    # branch
    p_branch = sub.add_parser("branch", help="Branch from an existing node")
    p_branch.add_argument("parent_id")
    p_branch.add_argument("--title", "-t", required=True)
    p_branch.add_argument(
        "--kind", "-k", default="empirical", choices=["insight", "empirical", "meta"]
    )
    p_branch.add_argument("--hypothesis", default="")

    # merge
    p_merge = sub.add_parser("merge", help="Merge multiple nodes")
    p_merge.add_argument("node_ids", nargs="+")
    p_merge.add_argument("--title", "-t", required=True)
    p_merge.add_argument("--summary", "-s", default="")

    # graph / export / status
    p_graph = sub.add_parser("graph", help="Show the research graph")
    p_graph.add_argument(
        "--format", "-f", default="mermaid", choices=["json", "markdown", "mermaid"]
    )

    p_export = sub.add_parser("export", help="Export the full project")
    p_export.add_argument(
        "--format", "-f", default="markdown", choices=["json", "markdown"]
    )
    p_export.add_argument(
        "--output", "-o", default=None, help="Output file (default: stdout)"
    )

    sub.add_parser("status", help="Show project status")

    args = parser.parse_args()
    tracker = ResearchTracker()

    if args.command == "init":
        pid = tracker.init_project(args.name, args.description)
        print(f"Initialized project '{args.name}' ({pid})")
        print(f"Database: {tracker.db_path}")

    elif args.command == "node":
        if args.node_command == "create":
            nid = tracker.create_node(
                kind=args.kind,
                title=args.title,
                description=args.description,
                hypothesis=args.hypothesis,
                parent_id=args.parent,
                tags=args.tags,
            )
            print(f"Created {args.kind} node: {nid}")
        elif args.node_command == "commit":
            tracker.commit_node(args.node_id, args.outcome, args.summary)
            print(f"Committed: {args.node_id}")
        elif args.node_command == "abandon":
            tracker.abandon_node(args.node_id, args.reason)
            print(f"Abandoned: {args.node_id}")
        elif args.node_command == "show":
            node = tracker.get_node(args.node_id)
            if node:
                print(json.dumps(node, indent=2))
            else:
                print(f"Node not found: {args.node_id}", file=sys.stderr)
                sys.exit(1)
        elif args.node_command == "list":
            nodes = tracker.list_nodes(status=args.status, kind=args.kind)
            for n in nodes:
                icon = {
                    "open": "○",
                    "running": "◐",
                    "committed": "●",
                    "abandoned": "✕",
                }.get(n["status"], "?")
                print(f"  {icon} [{n['kind'][:3]}] {n['id']}  {n['title']}")

    elif args.command == "artifact":
        if args.art_command == "add":
            aid = tracker.add_artifact(
                args.node_id,
                artifact_type=args.type,
                name=args.name,
                path=args.path,
                content=args.content,
            )
            print(f"Added artifact: {aid}")

    elif args.command == "branch":
        nid = tracker.branch(
            args.parent_id, title=args.title, kind=args.kind, hypothesis=args.hypothesis
        )
        print(f"Branched: {nid} from {args.parent_id}")

    elif args.command == "merge":
        nid = tracker.merge(args.node_ids, title=args.title, summary=args.summary)
        print(f"Merged: {nid} from {', '.join(args.node_ids)}")

    elif args.command == "graph":
        if args.format == "json":
            print(json.dumps(tracker.get_graph(), indent=2))
        elif args.format == "markdown":
            print(tracker.export_markdown())
        elif args.format == "mermaid":
            print(tracker.export_mermaid())

    elif args.command == "export":
        if args.format == "json":
            output = tracker.export_json()
        else:
            output = tracker.export_markdown()
        if args.output:
            Path(args.output).write_text(output, encoding="utf-8")
            print(f"Exported to: {args.output}")
        else:
            print(output)

    elif args.command == "status":
        s = tracker.get_status()
        proj = s.get("project") or {}
        print(f"Project: {proj.get('name', 'Not initialized')}")
        print(
            f"Nodes: {s['total_nodes']} ({', '.join(f'{k}: {v}' for k, v in s['by_status'].items())})"
        )
        print(f"Types: {', '.join(f'{k}: {v}' for k, v in s['by_kind'].items())}")
        print(f"Artifacts: {s['total_artifacts']}")
        print(f"Edges: {s['total_edges']}")

    else:
        parser.print_help()

    tracker.close()


if __name__ == "__main__":
    _cli()
