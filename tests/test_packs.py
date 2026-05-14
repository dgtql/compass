"""Persona pack discovery + parsing."""

from __future__ import annotations

import pytest

from compass.packs import Pack, PackWorkflow, get_pack, list_packs


def test_buffett_pack_discovered() -> None:
    ids = {p.id for p in list_packs()}
    assert "buffett" in ids


def test_buffett_pack_has_expected_shape() -> None:
    pack = get_pack("buffett")
    assert pack is not None
    assert pack.name == "Warren Buffett"
    assert pack.skills == ["buffett"]
    assert pack.default_template == "buffett-pitch"
    # All three workflows declared.
    commands = {w.command for w in pack.workflows}
    assert commands == {
        "buffett-pitch",
        "buffett-quick-filter",
        "buffett-sell-check",
    }


def test_pack_workflow_commands_resolve_to_real_templates() -> None:
    """Every workflow's ``command`` must be a real planner template."""
    from compass.planner import list_templates
    templates = set(list_templates())
    for pack in list_packs():
        for wf in pack.workflows:
            assert wf.command in templates, (
                f"pack {pack.id!r} workflow {wf.command!r} is not a registered template"
            )


def test_pack_skills_are_loadable() -> None:
    """Every skill named in a pack must load through compass.skills."""
    from compass.skills import load_skill
    for pack in list_packs():
        for slug in pack.skills:
            spec = load_skill(slug)
            assert spec.slug == slug


def test_get_pack_unknown_returns_none() -> None:
    assert get_pack("not-a-real-pack") is None


def test_pack_workflow_from_dict_handles_missing_keys() -> None:
    """Tolerant of partial / malformed entries — empty strings, not exceptions."""
    wf = PackWorkflow.from_dict({})
    assert wf.command == ""
    assert wf.name == ""
    assert wf.description == ""
