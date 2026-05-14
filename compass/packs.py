"""Persona packs — bundles of (skills + workflows + voice + defaults).

A pack is a JSON manifest under ``packs/<id>.json`` that describes a
famous-PM persona Compass can hire as an analyst. When the PM hires
Buffett, Compass creates an ``Analyst`` record pre-filled from
``packs/buffett.json`` — sector hint, voice (→ persona), skill toolkit
(``analyst.skills``), default workflow (``analyst.default_template``),
and the list of pack workflows the chat surface renders as chips.

The registry is just whatever ``packs/*.json`` files exist on disk.
Read-only, lightweight, no schema migration concerns.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import compass


# Repo root → ``packs/`` directory. Mirrors ``compass.skills.SKILLS_DIR``.
PACKS_DIR: Path = Path(compass.__file__).resolve().parent.parent / "packs"


@dataclass
class PackWorkflow:
    """One named pipeline a pack exposes, surfaced as a chat chip.

    ``command`` is the planner template slug — must exist in
    :mod:`compass.planner`. ``name`` is the chip label; ``description``
    is the tooltip / explainer.
    """

    command: str
    name: str
    description: str

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PackWorkflow":
        return cls(
            command=str(data.get("command", "")),
            name=str(data.get("name", "")),
            description=str(data.get("description", "")),
        )


@dataclass
class Pack:
    """A persona pack — everything needed to hire one famous-PM analyst.

    Hiring from a pack fills these fields on the new ``Analyst`` record:

    * ``title`` ← pack ``title``
    * ``sector`` ← user override, else pack ``sector_hint``
    * ``persona`` ← pack ``voice``
    * ``skills`` ← pack ``skills``
    * ``default_template`` ← pack ``default_template``
    * ``avatar_color`` ← pack ``avatar_color`` (else auto-derived)
    * ``pack`` ← pack ``id`` (so the chat surface can find workflows later)
    """

    id: str
    name: str
    title: str
    sector_hint: str
    voice: str
    skills: list[str] = field(default_factory=list)
    default_template: str | None = None
    workflows: list[PackWorkflow] = field(default_factory=list)
    avatar_color: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Pack":
        return cls(
            id=str(data.get("id", "")),
            name=str(data.get("name", "")),
            title=str(data.get("title", "")),
            sector_hint=str(data.get("sector_hint", "")),
            voice=str(data.get("voice", "")),
            skills=[str(s) for s in (data.get("skills") or [])],
            default_template=(
                str(data["default_template"]) if data.get("default_template") else None
            ),
            workflows=[
                PackWorkflow.from_dict(w) for w in (data.get("workflows") or [])
            ],
            avatar_color=(
                str(data["avatar_color"]) if data.get("avatar_color") else None
            ),
        )


def list_packs() -> list[Pack]:
    """Discover and load every ``packs/<id>.json`` manifest (alphabetical)."""
    if not PACKS_DIR.exists():
        return []
    out: list[Pack] = []
    for p in sorted(PACKS_DIR.glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            # A malformed pack shouldn't take down discovery.
            continue
        pack = Pack.from_dict(data)
        if pack.id:
            out.append(pack)
    return out


def get_pack(pack_id: str) -> Pack | None:
    """Load one pack by id, or ``None`` if absent."""
    for p in list_packs():
        if p.id == pack_id:
            return p
    return None
