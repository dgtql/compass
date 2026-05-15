"""Buffett pack — end-to-end glue test (no Claude SDK).

Exercises the full chain you'd hit when hiring Buffett from the Hire modal
and running ``buffett-pitch`` on NVDA, *up to* the SDK loop. The SDK
itself (and its network calls to SEC + Yahoo + Anthropic) are out of
scope — they need real OAuth and run for minutes.

What this test covers:

1. ``GET /api/packs`` returns the Buffett pack with three workflows.
2. ``POST /api/analysts/from-pack`` creates an analyst with the pack's
   skill toolkit, default_template, and pack id pre-filled.
3. The planner template ``buffett-pitch`` produces a task list whose
   compose phase is one ``compose-buffett`` task targeting the
   ``buffett`` skill with ``params.path = "B"``.
4. The buffett skill loads with ``runner: agent`` inferred and the
   reference files Buffett's framework relies on are all readable.
5. The dispatcher's universal-runner fallback picks the right path for
   the Buffett task (we stub the SDK loop so it returns synchronously).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Fresh FastAPI client over a temp data dir — no roster bleed from earlier tests."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    # Re-import the app under the new env so engagements_root() / analysts_path()
    # resolve under tmp_path. The app module reads env at request time, so a
    # fresh client is enough.
    from compass.api import app
    return TestClient(app)


def test_packs_endpoint_returns_buffett(client: TestClient) -> None:
    res = client.get("/api/packs")
    assert res.status_code == 200
    data = res.json()
    ids = [p["id"] for p in data["packs"]]
    assert "buffett" in ids


def test_hire_buffett_from_pack(client: TestClient) -> None:
    """The Hire-from-pack endpoint wires pack defaults onto the new analyst."""
    res = client.post(
        "/api/analysts/from-pack",
        json={"pack_id": "buffett", "coverage": []},
    )
    assert res.status_code == 201, res.text
    analyst = res.json()
    assert analyst["name"] == "Warren Buffett"
    assert analyst["pack"] == "buffett"
    assert analyst["skills"] == ["buffett"]
    assert analyst["default_template"] == "buffett-pitch"
    # Voice from the pack should land in the persona field.
    assert "Omaha" in analyst["persona"]


def test_hire_from_unknown_pack_404s(client: TestClient) -> None:
    res = client.post(
        "/api/analysts/from-pack",
        json={"pack_id": "does-not-exist", "coverage": []},
    )
    assert res.status_code == 404


def test_buffett_pack_workflows_all_map_to_real_templates(client: TestClient) -> None:
    """Every workflow's ``command`` must be a planner template the dispatcher knows."""
    res = client.get("/api/packs/buffett")
    assert res.status_code == 200
    pack = res.json()
    commands = {w["command"] for w in pack["workflows"]}

    res2 = client.get("/api/templates")
    assert res2.status_code == 200
    templates = set(res2.json())
    assert commands.issubset(templates), (
        f"pack workflows reference unknown templates: {commands - templates}"
    )


def test_buffett_pitch_template_compose_is_one_task() -> None:
    """The compose phase collapses to one ``buffett`` task (not 5 section drafts)."""
    from compass.engagement import Engagement
    from compass.planner import plan
    eng = Engagement.open("NVDA", analyst="warren-buffett")
    tasks = plan(eng, "buffett-pitch")

    compose = [t for t in tasks if t.stage == "compose"]
    assert len(compose) == 1
    only = compose[0]
    assert only.skill == "buffett"
    assert only.params.get("path") == "B"
    assert only.artifact_path is not None
    assert only.artifact_path.startswith("memos/buffett-pitch/")


def test_buffett_skill_loads_with_inferred_runner() -> None:
    """SKILL.md-only skill: no run.py, but loader infers ``runner: agent``."""
    from compass.skills import load_skill
    spec = load_skill("buffett")
    assert spec.runner == "agent"
    assert "Read" in spec.allowed_tools  # default when frontmatter omits Read
    # Frontmatter declares needs + output for the universal runner.
    # Buffett now declares filings parameterized by form (10-K, 10-Q)
    # so the data-source registry can stamp distinct ingest tasks.
    assert any(n.startswith("filings") for n in spec.needs), spec.needs
    assert "brief" in spec.needs
    assert spec.output is not None and "buffett-pitch" in spec.output
    # No run.py — dispatch goes through run_agent_skill_default.
    assert not spec.run_py.exists()


def test_buffett_reference_files_all_readable() -> None:
    """The eight Buffett reference files exist on disk for the agent to Read."""
    from compass.skills import load_skill
    spec = load_skill("buffett")
    refs = list(spec.references_dir.glob("*.md"))
    assert len(refs) == 8, f"expected 8 reference files, found {[r.name for r in refs]}"
    expected = {
        "01-thinking-frameworks.md",
        "02-investment-philosophy.md",
        "03-business-moat.md",
        "04-management-governance.md",
        "05-financial-metrics.md",
        "06-valuation-capital.md",
        "07-risk-behavior.md",
        "08-industry-playbooks.md",
    }
    assert {r.name for r in refs} == expected


@pytest.mark.asyncio
async def test_dispatcher_routes_buffett_through_universal_runner(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """End-to-end glue: planning Buffett + dispatching its compose task lands in the universal runner.

    We stub the SDK loop so this test is offline. What's being verified is
    the chain: planner template → tasks.json → dispatcher → no run.py →
    ``run_agent_skill_default`` invoked with the right SkillSpec + Task.
    """
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    from compass.dispatcher import run_engagement
    from compass.engagement import Engagement
    from compass.planner import plan

    eng = Engagement.open("NVDA", analyst="warren-buffett")
    tasks = plan(eng, "buffett-pitch")
    # Only keep the compose-buffett task — we're not exercising ingest/analyze
    # (those need network). Reset their statuses so blocking logic doesn't
    # cascade-skip the compose task.
    compose = [t for t in tasks if t.id == "compose-buffett"][0]
    compose.depends_on = []  # break upstream deps for this offline test
    eng.save_tasks([compose])

    captured: dict[str, Any] = {}

    async def stub_default_runner(*, spec, engagement, task, on_event=None):
        captured["spec_slug"] = spec.slug
        captured["spec_runner"] = spec.runner
        captured["task_id"] = task.id
        captured["task_skill"] = task.skill
        captured["task_params"] = dict(task.params or {})
        captured["needs"] = list(spec.needs)
        return {"artifact": task.artifact_path, "skill": spec.slug}

    import compass.agent_helper as ah
    monkeypatch.setattr(ah, "run_agent_skill_default", stub_default_runner)

    summary = await run_engagement(eng)
    assert summary["ran"] == 1
    assert summary["errors"] == 0
    assert captured["spec_slug"] == "buffett"
    assert captured["spec_runner"] == "agent"
    assert captured["task_id"] == "compose-buffett"
    assert captured["task_skill"] == "buffett"
    assert captured["task_params"]["path"] == "B"
    # Universal runner sees the artifact-category list from frontmatter
    # (filings is parameterized by form for the data-source registry).
    assert any(n.startswith("filings") for n in captured["needs"]), captured["needs"]
    assert "brief" in captured["needs"]
