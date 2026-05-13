"""Dispatcher — task ordering and status transitions, without network or LLM."""

from __future__ import annotations

from typing import Any

import pytest

from compass.dispatcher import _order_by_dependencies, run_engagement
from compass.engagement import Engagement, Task


@pytest.fixture
def engagement(tmp_path, monkeypatch):
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    return Engagement.open("NVDA")


def test_order_respects_dependencies() -> None:
    a = Task(id="a", stage="setup", title="", skill="x")
    b = Task(id="b", stage="setup", title="", skill="x", depends_on=["a"])
    c = Task(id="c", stage="setup", title="", skill="x", depends_on=["b"])
    # Submit in reverse order — topo sort should fix it.
    ordered = _order_by_dependencies([c, b, a])
    indices = {t.id: i for i, t in enumerate(ordered)}
    assert indices["a"] < indices["b"] < indices["c"]


@pytest.mark.asyncio
async def test_run_skips_already_done(engagement) -> None:
    # Build a tasks.json where the only task is already done.
    task = Task(id="t1", stage="ingest", title="x", skill="fetch-news", status="done")
    engagement.save_tasks([task])
    summary = await run_engagement(engagement)
    assert summary["ran"] == 0
    assert summary["skipped"] == 1


@pytest.mark.asyncio
async def test_dependency_block_skips_dependent(engagement) -> None:
    a = Task(id="a", stage="setup", title="", skill="fetch-news", status="error")
    b = Task(id="b", stage="ingest", title="", skill="fetch-news", depends_on=["a"])
    engagement.save_tasks([a, b])
    summary = await run_engagement(engagement, stop_on_error=False)
    # `a` is already error, `b` is blocked; neither runs anew.
    assert summary["ran"] == 0
    assert summary["skipped"] >= 1
