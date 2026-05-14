"""Wiki-distill pipeline — offline, with Wikipedia + Claude SDK both stubbed.

The real path hits two external services. These tests verify:

* The endpoint validates inputs and surfaces clean errors.
* The Wikipedia extractor parses the action API response shape.
* The distillation function feeds wiki + Buffett body into the SDK and
  returns whatever the SDK produced, without writing to disk.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client() -> TestClient:
    from compass.api import app
    return TestClient(app)


# ---------------------------------------------------------------------------
# Wikipedia fetch parsing
# ---------------------------------------------------------------------------


def test_wiki_extract_parses_action_api_response(monkeypatch: pytest.MonkeyPatch) -> None:
    """Plain-text extract is returned when the page exists."""
    from compass import distill

    class FakeResp:
        def raise_for_status(self): pass
        def json(self): return {
            "query": {"pages": {"123": {"extract": "Charlie Munger is an investor."}}}
        }

    monkeypatch.setattr(distill.requests, "get", lambda *a, **kw: FakeResp())
    assert distill.fetch_wikipedia_extract("Charlie Munger") == "Charlie Munger is an investor."


def test_wiki_missing_page_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    from compass import distill

    class FakeResp:
        def raise_for_status(self): pass
        def json(self): return {
            "query": {"pages": {"-1": {"missing": ""}}}
        }

    monkeypatch.setattr(distill.requests, "get", lambda *a, **kw: FakeResp())
    assert distill.fetch_wikipedia_extract("Not A Person") is None


def test_wiki_network_failure_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    from compass import distill

    def boom(*a, **kw):
        raise distill.requests.ConnectionError("nope")

    monkeypatch.setattr(distill.requests, "get", boom)
    assert distill.fetch_wikipedia_extract("Whoever") is None


def test_wiki_empty_name_returns_none() -> None:
    from compass.distill import fetch_wikipedia_extract
    assert fetch_wikipedia_extract("") is None
    assert fetch_wikipedia_extract("   ") is None


# ---------------------------------------------------------------------------
# /api/skills/distill endpoint
# ---------------------------------------------------------------------------


def test_distill_rejects_bad_slug(client: TestClient) -> None:
    res = client.post("/api/skills/distill", json={"name": "Charlie Munger", "slug": "../escape"})
    assert res.status_code == 400


def test_distill_rejects_empty_name(client: TestClient) -> None:
    res = client.post("/api/skills/distill", json={"name": "  ", "slug": "munger"})
    assert res.status_code == 400


def test_distill_returns_404_when_wiki_missing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    from compass import distill
    monkeypatch.setattr(distill, "fetch_wikipedia_extract", lambda *a, **kw: None)
    res = client.post("/api/skills/distill", json={"name": "Not A Person", "slug": "fake"})
    assert res.status_code == 404


def test_distill_happy_path_returns_skill_md(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With wiki + SDK stubbed, the endpoint returns the proposed SKILL.md.

    Verifies the chain: validate → fetch wiki → load Buffett shape → SDK call →
    return content. Nothing is written to disk.
    """
    from compass import distill

    monkeypatch.setattr(
        distill, "fetch_wikipedia_extract",
        lambda name, **kw: "Charlie Munger advocates mental models.",
    )

    captured: dict[str, Any] = {}

    def fake_distill_sync(name, slug, wiki, buffett_body, on_event=None):
        captured["name"] = name
        captured["slug"] = slug
        captured["wiki_len"] = len(wiki)
        captured["buffett_len"] = len(buffett_body)
        return (
            "---\n"
            "name: munger\n"
            "description: |\n"
            "  Munger's mental-models framework.\n"
            "phase: compose\n"
            "runner: agent\n"
            "---\n\n"
            "# Munger\n\nLatticework of mental models.\n"
        )

    monkeypatch.setattr(distill, "_distill_sync", fake_distill_sync)

    res = client.post("/api/skills/distill", json={"name": "Charlie Munger", "slug": "munger"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["slug"] == "munger"
    assert body["name"] == "Charlie Munger"
    assert body["wiki_chars"] > 0
    assert "Munger" in body["skill_md"]
    # The pipeline must feed both wiki + Buffett body into the SDK.
    assert captured["wiki_len"] > 0
    assert captured["buffett_len"] > 100  # Buffett body is substantial
    # Distill must propose a pack so the frontend can make the persona hireable.
    assert "suggested_pack" in body
    assert body["suggested_pack"]["name"] == "Charlie Munger"
    assert "voice" in body["suggested_pack"]


def test_distill_sdk_returns_empty_surface_as_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If the SDK call returns blank, surface a 503 so the UI can react."""
    from compass import distill
    monkeypatch.setattr(
        distill, "fetch_wikipedia_extract",
        lambda name, **kw: "Lots of wiki content here.",
    )
    monkeypatch.setattr(distill, "_distill_sync", lambda *a, **kw: "")

    res = client.post("/api/skills/distill", json={"name": "Anyone", "slug": "anyone"})
    # The signature accepts on_event; the stub above absorbs it via *a/**kw.
    assert res.status_code == 503
    assert "Claude" in res.json()["detail"] or "SDK" in res.json()["detail"]


def test_distill_does_not_write_to_disk(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A distill call must not create skills/<slug>/ — the user reviews first."""
    from compass import distill
    from compass.skills import SKILLS_DIR

    monkeypatch.setattr(
        distill, "fetch_wikipedia_extract",
        lambda name, **kw: "Wiki content for Test Person.",
    )
    monkeypatch.setattr(
        distill, "_distill_sync",
        lambda *a, **kw: "---\nname: test-person\n---\nbody\n",
    )

    target = SKILLS_DIR / "test-distill-no-write"
    assert not target.exists()
    res = client.post(
        "/api/skills/distill",
        json={"name": "Test Person", "slug": "test-distill-no-write"},
    )
    assert res.status_code == 200
    # Crucially: nothing on disk.
    assert not target.exists()


# ---------------------------------------------------------------------------
# /api/skills/distill/stream — SSE progress
# ---------------------------------------------------------------------------


def test_distill_stream_emits_staged_events(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """SSE stream emits wiki_start → wiki_done → author_start → say → author_done → done."""
    from compass import distill

    monkeypatch.setattr(
        distill, "fetch_wikipedia_extract",
        lambda name, **kw: "Lots of wiki content for the author phase.",
    )

    def fake_distill_sync(name, slug, wiki, buffett_body, on_event=None):
        # Simulate the SDK loop emitting two streaming chunks.
        if on_event is not None:
            on_event({"type": "say", "delta": "First chunk. ", "total_chars": 13})
            on_event({"type": "say", "delta": "Second chunk.", "total_chars": 26})
        return "---\nname: x\n---\nFirst chunk. Second chunk."

    monkeypatch.setattr(distill, "_distill_sync", fake_distill_sync)

    with client.stream(
        "POST",
        "/api/skills/distill/stream",
        json={"name": "Test Person", "slug": "test-stream"},
    ) as res:
        assert res.status_code == 200
        # Collect every event line; FastAPI's TestClient gives chunked text.
        body = "".join(res.iter_text())

    # Each SSE record has the form: ``event: <type>\ndata: <json>\n\n``.
    events = [chunk for chunk in body.split("\n\n") if chunk.strip()]
    event_types = []
    for chunk in events:
        line = chunk.splitlines()[0] if chunk.splitlines() else ""
        if line.startswith("event: "):
            event_types.append(line[len("event: "):])
    # Order: wiki_start → wiki_done → author_start → say (>=1) → author_done → done.
    assert event_types[0] == "wiki_start"
    assert "wiki_done" in event_types
    assert "author_start" in event_types
    assert event_types.count("say") >= 2
    assert "author_done" in event_types
    assert event_types[-1] == "done"


def test_distill_stream_emits_error_when_wiki_missing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    from compass import distill
    monkeypatch.setattr(distill, "fetch_wikipedia_extract", lambda *a, **kw: None)

    with client.stream(
        "POST",
        "/api/skills/distill/stream",
        json={"name": "Nobody", "slug": "nobody"},
    ) as res:
        body = "".join(res.iter_text())

    assert "event: error" in body
    # And never reaches done.
    assert "event: done\n" not in body
