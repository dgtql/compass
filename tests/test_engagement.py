"""Engagement model — paths, brief/tasks I/O, run log."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from compass.engagement import Engagement, Task, resolve_analyst


def test_engagement_open_materializes_layout(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    eng = Engagement.open("NVDA")
    assert eng.ticker == "NVDA"
    assert eng.analyst_slug == "maria-chen"
    for sub in (".pipeline/docs", "corpus/filings", "analysis", "memos"):
        assert (eng.root / sub).is_dir(), f"missing: {sub}"


def test_brief_roundtrip(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    eng = Engagement.open("SOC")
    assert eng.load_brief() is None
    eng.save_brief({"thesis_one_liner": "X", "kpis": []})
    loaded = eng.load_brief()
    assert loaded["ticker"] == "SOC"
    assert loaded["thesis_one_liner"] == "X"
    assert "updated_at" in loaded


def test_tasks_roundtrip(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    eng = Engagement.open("NVDA")
    tasks = [Task(id="t1", stage="ingest", title="t1", skill="fetch-sec-filing")]
    eng.save_tasks(tasks, template="pitch-memo")
    loaded = eng.load_tasks()
    assert len(loaded) == 1
    assert loaded[0].id == "t1"
    assert loaded[0].skill == "fetch-sec-filing"


def test_resolve_analyst_falls_back(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    assert resolve_analyst("NVDA") == "maria-chen"
    assert resolve_analyst("SOC") == "david-park"
    # Unknown ticker → fallback
    assert resolve_analyst("ZZZZ") == "maria-chen"
    # Override wins
    assert resolve_analyst("NVDA", override="aisha-patel") == "aisha-patel"


def test_log_event_appends_jsonl(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    eng = Engagement.open("NVDA")
    eng.log_event({"type": "test", "n": 1})
    eng.log_event({"type": "test", "n": 2})
    lines = eng.run_log_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["n"] == 1
    assert json.loads(lines[1])["n"] == 2
