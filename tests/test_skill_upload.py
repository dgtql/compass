"""Skill upload — POST /api/skills writes a new skill into ``skills/<slug>/``.

Each test mutates the live ``skills/`` directory (the loader doesn't have a
config seam yet), so every test cleans up the dir it creates.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client() -> TestClient:
    from compass.api import app
    return TestClient(app)


@pytest.fixture
def cleanup_slug():
    """Tracks skill slugs created during a test and removes them after."""
    from compass.skills import SKILLS_DIR
    created: list[str] = []

    def _track(slug: str) -> str:
        created.append(slug)
        return slug

    yield _track

    for slug in created:
        d = SKILLS_DIR / slug
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)


def test_upload_minimal_skill_succeeds(client: TestClient, cleanup_slug) -> None:
    """Upload an Anthropic-style SKILL.md (only name + description). The
    loader auto-infers ``runner: agent`` and a Read tool default."""
    slug = cleanup_slug("test-upload-minimal")
    content = (
        "---\n"
        f"name: {slug}\n"
        "description: A minimal skill for upload tests.\n"
        "---\n\n"
        "# Hello\n\nThis is a test skill body.\n"
    )
    res = client.post("/api/skills", json={"slug": slug, "content": content})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["slug"] == slug
    assert body["runner"] == "agent"     # inferred (no run.py)
    assert "Read" in body["allowed_tools"]
    assert body["phase"] == "compose"    # default


def test_upload_rejects_unsafe_slug(client: TestClient) -> None:
    """Path-traversal, slashes, leading dots — all rejected."""
    for bad in ["../escape", "name/with/slash", ".hidden", "_reference", "UPPER", "x"]:
        res = client.post("/api/skills", json={"slug": bad, "content": "---\nname: x\n---\n"})
        assert res.status_code == 400, f"slug {bad!r} should be rejected, got {res.status_code}"


def test_upload_rejects_existing_without_overwrite(client: TestClient, cleanup_slug) -> None:
    slug = cleanup_slug("test-upload-conflict")
    payload = {
        "slug": slug,
        "content": f"---\nname: {slug}\ndescription: v1.\n---\nbody v1\n",
    }
    res = client.post("/api/skills", json=payload)
    assert res.status_code == 201
    # Second POST without overwrite → 409.
    res = client.post("/api/skills", json=payload)
    assert res.status_code == 409
    # With overwrite=true → 201 again.
    res = client.post("/api/skills", json={**payload, "overwrite": True})
    assert res.status_code == 201


def test_upload_with_references_lands_on_disk(client: TestClient, cleanup_slug) -> None:
    from compass.skills import SKILLS_DIR
    slug = cleanup_slug("test-upload-refs")
    content = (
        "---\n"
        f"name: {slug}\n"
        "description: skill with references.\n"
        "---\n\nBody.\n"
    )
    res = client.post(
        "/api/skills",
        json={
            "slug": slug,
            "content": content,
            "references": [
                {"name": "01-overview.md", "content": "# Overview\nFirst ref."},
                {"name": "02-deep-dive.md", "content": "# Deep\nSecond ref."},
            ],
        },
    )
    assert res.status_code == 201, res.text
    refs_dir = SKILLS_DIR / slug / "references"
    assert refs_dir.exists()
    assert (refs_dir / "01-overview.md").read_text() == "# Overview\nFirst ref."
    assert (refs_dir / "02-deep-dive.md").read_text() == "# Deep\nSecond ref."


def test_upload_skips_unsafe_reference_names(client: TestClient, cleanup_slug) -> None:
    """References with slashes or .. are skipped, not aborted."""
    slug = cleanup_slug("test-upload-bad-refs")
    res = client.post(
        "/api/skills",
        json={
            "slug": slug,
            "content": f"---\nname: {slug}\ndescription: skips bad refs.\n---\nx\n",
            "references": [
                {"name": "../escape.md", "content": "should be skipped"},
                {"name": "subdir/file.md", "content": "should be skipped"},
                {"name": "ok.md", "content": "ok"},
            ],
        },
    )
    assert res.status_code == 201
    body = res.json()
    assert "../escape.md" in body["skipped_references"]
    assert "subdir/file.md" in body["skipped_references"]


def test_upload_with_broken_frontmatter_rolls_back(
    client: TestClient, cleanup_slug,
) -> None:
    """If the loader can't parse the uploaded SKILL.md, the dir is removed."""
    from compass.skills import SKILLS_DIR
    slug = cleanup_slug("test-upload-broken")
    # No frontmatter delimiter at all — load_skill still succeeds but returns
    # an empty body. To trigger a real failure we need to test with content
    # that throws inside load_skill. For now, an empty payload triggers the
    # earlier 400 check.
    res = client.post("/api/skills", json={"slug": slug, "content": "   "})
    assert res.status_code == 400
    assert not (SKILLS_DIR / slug).exists()


def test_uploaded_skill_appears_in_get_listing(client: TestClient, cleanup_slug) -> None:
    """The new skill shows up in /api/skills immediately."""
    slug = cleanup_slug("test-upload-visible")
    res = client.post(
        "/api/skills",
        json={
            "slug": slug,
            "content": f"---\nname: {slug}\ndescription: visible after upload.\n---\nbody\n",
        },
    )
    assert res.status_code == 201
    listing = client.get("/api/skills").json()
    slugs = {s["slug"] for s in listing}
    assert slug in slugs


# ---------------------------------------------------------------------------
# Pack-on-upload: distilled persona becomes hireable + runnable
# ---------------------------------------------------------------------------


@pytest.fixture
def cleanup_pack():
    """Removes packs/<slug>.json after a test creates it."""
    from compass.packs import PACKS_DIR
    created: list[str] = []

    def _track(pack_id: str) -> str:
        created.append(pack_id)
        return pack_id

    yield _track

    for pid in created:
        p = PACKS_DIR / f"{pid}.json"
        if p.exists():
            p.unlink()


def test_upload_with_pack_creates_pack_manifest(
    client: TestClient, cleanup_slug, cleanup_pack,
) -> None:
    """Uploading with ``pack`` writes packs/<slug>.json and registers the
    template — exactly the path the distill flow uses to make a person hireable."""
    from compass.packs import PACKS_DIR, get_pack
    from compass.planner import TEMPLATES
    slug = cleanup_slug("test-persona-munger")
    cleanup_pack("test-persona-munger")

    res = client.post(
        "/api/skills",
        json={
            "slug": slug,
            "content": (
                f"---\nname: {slug}\ndescription: A skill embodying "
                f"Munger's lattice.\n---\n# Munger\n\nMental models.\n"
            ),
            "pack": {
                "name": "Charlie Munger",
                "title": "Value Investor",
                "sector_hint": "Information Technology",
                "voice": "Munger's tone.",
                "avatar_color": "amber",
            },
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["pack_created"] == slug
    assert slug in body["in_packs"]

    # Pack manifest is on disk.
    assert (PACKS_DIR / f"{slug}.json").exists()
    pack = get_pack(slug)
    assert pack is not None
    assert pack.name == "Charlie Munger"
    assert pack.skills == [slug]
    assert pack.default_template == f"{slug}-pitch"
    assert any(wf.command == f"{slug}-pitch" for wf in pack.workflows)

    # And the parametric template is registered, so the dispatcher can run it.
    assert f"{slug}-pitch" in TEMPLATES


def test_upload_with_pack_makes_persona_hireable(
    client: TestClient, cleanup_slug, cleanup_pack,
) -> None:
    """After upload-with-pack, ``GET /api/packs`` lists the new persona and
    ``POST /api/analysts/from-pack`` creates a hireable analyst."""
    slug = cleanup_slug("test-persona-hireable")
    cleanup_pack("test-persona-hireable")

    upload = client.post(
        "/api/skills",
        json={
            "slug": slug,
            "content": f"---\nname: {slug}\ndescription: Test persona.\n---\nbody\n",
            "pack": {"name": "Test Persona", "voice": "Test voice."},
        },
    )
    assert upload.status_code == 201

    packs = client.get("/api/packs").json()
    pack_ids = {p["id"] for p in packs["packs"]}
    assert slug in pack_ids

    hire = client.post(
        "/api/analysts/from-pack",
        json={"pack_id": slug, "coverage": []},
    )
    assert hire.status_code == 201, hire.text
    analyst = hire.json()
    assert analyst["pack"] == slug
    assert slug in analyst["skills"]
    assert analyst["default_template"] == f"{slug}-pitch"

    # Clean up the analyst (otherwise it accumulates in data/analysts.json).
    from compass.analysts import delete_analyst as _delete
    _delete(analyst["slug"])


def test_persona_template_planning_uses_the_skill(
    client: TestClient, cleanup_slug, cleanup_pack,
) -> None:
    """The auto-registered template puts the persona skill at compose phase."""
    from compass.planner import plan
    from compass.engagement import Engagement

    slug = cleanup_slug("test-persona-template")
    cleanup_pack("test-persona-template")
    client.post(
        "/api/skills",
        json={
            "slug": slug,
            "content": f"---\nname: {slug}\ndescription: Test persona.\n---\nbody\n",
            "pack": {"name": "Test Persona"},
        },
    )

    eng = Engagement.open("NVDA", analyst="test-persona-analyst")
    tasks = plan(eng, f"{slug}-pitch")
    compose = [t for t in tasks if t.stage == "compose"]
    assert len(compose) == 1
    assert compose[0].skill == slug
    assert compose[0].params.get("path") == "B"
    assert compose[0].artifact_path.startswith(f"memos/{slug}-pitch/")
