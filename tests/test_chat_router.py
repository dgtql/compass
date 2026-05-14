"""Chat workflow router — ``suggest_workflow`` + the streaming endpoint.

The Haiku calls themselves hit the network; these tests stub them out and
verify (a) the short-circuit rules in the helper, (b) the endpoint shape,
and (c) that ticker resolution is gated behind a non-None workflow pick.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client() -> TestClient:
    from compass.api import app
    return TestClient(app)


# ---------------------------------------------------------------------------
# compass.llm.suggest_workflow — short-circuit rules
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_suggest_workflow_short_circuits_on_empty_message() -> None:
    from compass.llm import suggest_workflow
    out = await suggest_workflow(message="", workflows=[{"command": "x", "name": "X"}])
    assert out is None


@pytest.mark.asyncio
async def test_suggest_workflow_short_circuits_on_empty_workflows() -> None:
    from compass.llm import suggest_workflow
    out = await suggest_workflow(message="long enough message here", workflows=[])
    assert out is None


@pytest.mark.asyncio
async def test_suggest_workflow_short_circuits_on_too_short_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """< 4 words skip the Haiku call entirely — it's almost always chat."""
    from compass import llm
    sentinel = {"called": False}

    def fake_sync(*a, **kw):
        sentinel["called"] = True
        return "x"

    monkeypatch.setattr(llm, "_suggest_workflow_sync", fake_sync)
    out = await llm.suggest_workflow(
        message="hi there",
        workflows=[{"command": "x", "name": "X"}],
    )
    assert out is None
    assert sentinel["called"] is False


@pytest.mark.asyncio
async def test_suggest_workflow_calls_haiku_when_long_enough(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from compass import llm

    def fake_sync(message, workflows):
        # Verify the helper passes through the args.
        assert "buffett" in message.lower()
        assert any(w["command"] == "buffett-pitch" for w in workflows)
        return "buffett-pitch"

    monkeypatch.setattr(llm, "_suggest_workflow_sync", fake_sync)
    out = await llm.suggest_workflow(
        message="Give me a Buffett-style pitch on NVDA please",
        workflows=[{"command": "buffett-pitch", "name": "Full Pitch", "description": ""}],
    )
    assert out == "buffett-pitch"


# ---------------------------------------------------------------------------
# POST /api/chats/{owner}/suggest-workflow
# ---------------------------------------------------------------------------


def test_suggest_workflow_endpoint_returns_null_when_no_workflow_picked(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No workflow → endpoint short-circuits and skips ticker resolution."""
    from compass import llm

    async def fake_suggest_workflow(*, message, workflows):
        return None

    ticker_called = {"hit": False}

    async def fake_suggest_ticker(*, message, candidates):
        ticker_called["hit"] = True
        return "NVDA"

    monkeypatch.setattr(llm, "suggest_workflow", fake_suggest_workflow)
    monkeypatch.setattr(llm, "suggest_memo_ticker", fake_suggest_ticker)

    res = client.post(
        "/api/chats/master/suggest-workflow",
        json={
            "message": "what do you think of the market today?",
            "workflows": [{"command": "buffett-pitch", "name": "Full Pitch"}],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body == {
        "workflow": None,
        "workflow_name": None,
        "workflow_description": None,
        "ticker": None,
    }
    # We never burn a ticker-resolution Haiku call when the route is "just chat".
    assert ticker_called["hit"] is False


def test_suggest_workflow_endpoint_returns_both_when_workflow_picked(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Workflow detected → endpoint also resolves ticker + echoes name/description."""
    from compass import llm

    async def fake_suggest_workflow(*, message, workflows):
        return "buffett-pitch"

    async def fake_suggest_ticker(*, message, candidates):
        return "NVDA"

    monkeypatch.setattr(llm, "suggest_workflow", fake_suggest_workflow)
    monkeypatch.setattr(llm, "suggest_memo_ticker", fake_suggest_ticker)

    res = client.post(
        "/api/chats/warren-buffett/suggest-workflow",
        json={
            "message": "Give me a full pitch on NVDA please",
            "workflows": [
                {
                    "command": "buffett-pitch",
                    "name": "Full Pitch",
                    "description": "Complete Buffett analysis.",
                },
                {"command": "pitch-memo", "name": "Pitch memo", "description": "Generic."},
            ],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["workflow"] == "buffett-pitch"
    assert body["workflow_name"] == "Full Pitch"
    assert body["workflow_description"] == "Complete Buffett analysis."
    assert body["ticker"] == "NVDA"


def test_suggest_workflow_endpoint_handles_invented_command_gracefully(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If Haiku somehow returns a command not in the workflow list, ``name``
    falls back to the command itself rather than null."""
    from compass import llm

    async def fake_suggest_workflow(*, message, workflows):
        return "made-up-pitch"  # not in the workflow list

    async def fake_suggest_ticker(*, message, candidates):
        return None

    monkeypatch.setattr(llm, "suggest_workflow", fake_suggest_workflow)
    monkeypatch.setattr(llm, "suggest_memo_ticker", fake_suggest_ticker)

    res = client.post(
        "/api/chats/master/suggest-workflow",
        json={
            "message": "Long enough message to pass short-circuit",
            "workflows": [{"command": "buffett-pitch", "name": "Full Pitch"}],
        },
    )
    body = res.json()
    assert body["workflow"] == "made-up-pitch"
    assert body["workflow_name"] == "made-up-pitch"  # fallback when no meta match
    assert body["workflow_description"] is None
