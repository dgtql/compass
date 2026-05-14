"""Engagement — a per-analyst, per-ticker unit of research work.

An engagement is a directory on disk that holds everything Compass produces
for one analyst × one ticker: the coverage brief, the task list, and every
artifact a skill writes (filings, snapshots, analyses, memos). The layout
matches the paths the React UI already renders for the slice-16 mock
(`web/src/mocks/pipeline.ts`), so once the backend writes real files the
existing UI lights up without changes.

Layout::

    engagements/<analyst-slug>/<TICKER>/
        .pipeline/
            docs/coverage_brief.json    # the structured thesis
            tasks.json                  # the planner's output
            run.log                     # one-line-per-event audit trail
        corpus/
            filings/<FORM>/<ACCESSION>/{primary.md, metadata.json}
            snapshots/yahoo/<YYYY-MM-DD>.md
            transcripts/<YYYY-MM-DD>.md
            news/<YYYY-MM-DD>.json
        analysis/
            kpis/<task-id>.json
            sections/<TICKER>__<form>__<section>.md
            gates/<task-id>.json
        memos/
            pitch/<YYYY-MM-DD>.md
            earnings-reaction/<YYYY-MM-DD>.md
            maintenance/<YYYY-MM-DD>.md

There is no SQLite ledger any more — the artifact tree, the brief, and the
task list collectively are the evidence. Citations from a memo are simply
relative paths into this tree (optionally with a line anchor).
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Phase taxonomy — matches `StageId` in web/src/types/domain.ts.
PHASES: tuple[str, ...] = ("setup", "ingest", "analyze", "compose", "maintain")

# Default analyst → ticker mapping (mirrors the mock-data assignments so
# `compass run NVDA pitch-memo` resolves without an explicit --analyst
# flag). Override per-call with --analyst.
DEFAULT_ANALYST_FOR_TICKER: dict[str, str] = {
    "NVDA": "maria-chen",
    "SOC": "david-park",
    "AVGO": "maria-chen",
    "TSM": "maria-chen",
    "OXY": "david-park",
    "COST": "tom-kovacs",
    "HD": "tom-kovacs",
    "LOW": "tom-kovacs",
    "JPM": "aisha-patel",
}
DEFAULT_ANALYST_FALLBACK = "maria-chen"


def engagements_root() -> Path:
    """Where engagements live on disk. Overridable via ``COMPASS_DATA_DIR``."""
    base = Path(os.environ.get("COMPASS_DATA_DIR", "data")).resolve()
    return base / "engagements"


def resolve_analyst(ticker: str, override: str | None = None) -> str:
    """Pick the analyst slug for ``ticker`` — explicit override wins."""
    if override:
        return override.strip().lower()
    return DEFAULT_ANALYST_FOR_TICKER.get(ticker.upper(), DEFAULT_ANALYST_FALLBACK)


# ---------------------------------------------------------------------------
# Task model
# ---------------------------------------------------------------------------


@dataclass
class Task:
    """One unit of work in an engagement's tasks.json.

    Mirrors the ``PipelineTask`` shape the UI already consumes
    (`web/src/types/domain.ts`). The dispatcher mutates ``status``,
    ``started_at``, ``finished_at``, and ``error`` in place as the task
    runs and persists after each transition so the UI can poll.
    """

    id: str
    stage: str
    title: str
    skill: str
    status: str = "pending"          # pending | in-progress | done | review | error
    priority: str = "medium"          # high | medium | low
    task_type: str = "execution"
    description: str | None = None
    params: dict[str, Any] = field(default_factory=dict)
    artifact_path: str | None = None
    depends_on: list[str] = field(default_factory=list)
    next_action_prompt: str | None = None
    requires_human_approval: bool = False
    created_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Task":
        kwargs = {k: data[k] for k in data if k in cls.__dataclass_fields__}
        return cls(**kwargs)


# ---------------------------------------------------------------------------
# Engagement
# ---------------------------------------------------------------------------


@dataclass
class Engagement:
    """A per-analyst, per-ticker research engagement on disk."""

    analyst_slug: str
    ticker: str
    root: Path

    # --- factory -----------------------------------------------------------

    @classmethod
    def open(cls, ticker: str, *, analyst: str | None = None) -> "Engagement":
        """Open (and materialize) the engagement for ``ticker`` under ``analyst``.

        Creates the directory tree if it doesn't exist. Idempotent.
        """
        slug = resolve_analyst(ticker, analyst)
        ticker_upper = ticker.upper()
        root = engagements_root() / slug / ticker_upper
        eng = cls(analyst_slug=slug, ticker=ticker_upper, root=root)
        eng._materialize()
        return eng

    def _materialize(self) -> None:
        for sub in (
            ".pipeline/docs",
            "corpus/filings",
            "corpus/snapshots",
            "corpus/transcripts",
            "corpus/news",
            "analysis",
            "memos",
        ):
            (self.root / sub).mkdir(parents=True, exist_ok=True)

    # --- path helpers ------------------------------------------------------

    @property
    def brief_path(self) -> Path:
        return self.root / ".pipeline" / "docs" / "coverage_brief.json"

    @property
    def tasks_path(self) -> Path:
        return self.root / ".pipeline" / "tasks.json"

    @property
    def run_log_path(self) -> Path:
        return self.root / ".pipeline" / "run.log"

    def artifact_path(self, rel: str) -> Path:
        """Resolve a relative artifact path under the engagement root."""
        return (self.root / rel).resolve()

    def relative(self, abs_path: Path) -> str:
        """Inverse of ``artifact_path``: absolute → engagement-relative POSIX path."""
        try:
            return abs_path.resolve().relative_to(self.root.resolve()).as_posix()
        except ValueError:
            return str(abs_path)

    # --- brief I/O ---------------------------------------------------------

    def load_brief(self) -> dict[str, Any] | None:
        if not self.brief_path.exists():
            return None
        return json.loads(self.brief_path.read_text(encoding="utf-8"))

    def save_brief(self, brief: dict[str, Any]) -> None:
        brief.setdefault("ticker", self.ticker)
        brief["updated_at"] = _now_iso()
        self.brief_path.parent.mkdir(parents=True, exist_ok=True)
        self.brief_path.write_text(
            json.dumps(brief, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    # --- task I/O ----------------------------------------------------------

    def load_tasks(self) -> list[Task]:
        if not self.tasks_path.exists():
            return []
        raw = json.loads(self.tasks_path.read_text(encoding="utf-8"))
        return [Task.from_dict(t) for t in raw.get("tasks", [])]

    def save_tasks(self, tasks: list[Task], *, template: str | None = None) -> None:
        payload = {
            "ticker": self.ticker,
            "analyst": self.analyst_slug,
            "template": template,
            "updated_at": _now_iso(),
            "tasks": [t.to_dict() for t in tasks],
        }
        self.tasks_path.parent.mkdir(parents=True, exist_ok=True)
        self.tasks_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        # Broadcast to any UI subscribed to this engagement's events. The
        # publish is a no-op when no one's listening (CLI, tests, etc.).
        _publish_event(self.analyst_slug, self.ticker, {
            "type": "tasks-updated",
            "ticker": self.ticker,
            "analyst": self.analyst_slug,
            "task_count": len(tasks),
        })

    # --- run log -----------------------------------------------------------

    def log_event(self, event: dict[str, Any]) -> None:
        """Append one JSON line to ``.pipeline/run.log``.

        Each line is one event from the dispatcher or a tool-call hook.
        Schema is loose — at minimum ``ts`` and ``type``. Errors writing
        the log are swallowed: observability must not break the run.
        """
        event = {"ts": _now_iso(), **event}
        try:
            self.run_log_path.parent.mkdir(parents=True, exist_ok=True)
            with self.run_log_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(event, ensure_ascii=False, default=str) + "\n")
        except Exception:  # noqa: BLE001
            pass
        # Push to live subscribers as a `task-event` so the UI can render a
        # live console-like view per task without polling run.log.
        _publish_event(self.analyst_slug, self.ticker, {
            "type": "task-event",
            **event,
        })


def _publish_event(analyst: str, ticker: str, event: dict[str, Any]) -> None:
    """Best-effort broadcast. Import is lazy/local so engagement.py keeps
    its lean import surface (tests, CLI tools that don't need pub/sub)."""
    try:
        from compass.events import publish
        publish(analyst, ticker, event)
    except Exception:  # noqa: BLE001
        pass


# ---------------------------------------------------------------------------
# Listing helpers (used by the API + CLI to enumerate engagements)
# ---------------------------------------------------------------------------


def list_engagements() -> list[dict[str, Any]]:
    """All materialized engagements on disk, newest-modified first."""
    root = engagements_root()
    if not root.exists():
        return []
    out: list[dict[str, Any]] = []
    for analyst_dir in sorted(root.iterdir()):
        if not analyst_dir.is_dir():
            continue
        for ticker_dir in sorted(analyst_dir.iterdir()):
            if not ticker_dir.is_dir():
                continue
            tasks_path = ticker_dir / ".pipeline" / "tasks.json"
            brief_path = ticker_dir / ".pipeline" / "docs" / "coverage_brief.json"
            mtime = max(
                tasks_path.stat().st_mtime if tasks_path.exists() else 0.0,
                brief_path.stat().st_mtime if brief_path.exists() else 0.0,
                ticker_dir.stat().st_mtime,
            )
            out.append(
                {
                    "analyst": analyst_dir.name,
                    "ticker": ticker_dir.name,
                    "path": str(ticker_dir),
                    "has_brief": brief_path.exists(),
                    "has_tasks": tasks_path.exists(),
                    "modified_at": mtime,
                }
            )
    out.sort(key=lambda r: r["modified_at"], reverse=True)
    return out


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _epoch() -> float:
    return time.time()
