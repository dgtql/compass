"""Data-source registry — what categories of corpus data can Compass produce?

A *data source* is the pairing of:

* a **category** name (``filings``, ``news``, ``snapshots``, ``insider``, …) —
  the vocabulary compose skills shop from via their ``needs:`` frontmatter;
* a **producer skill** that knows how to actually fetch and write it
  (typically a ``fetch-*`` skill with ``runner: deterministic``).

The registry isn't a separate config file — it's a *derived view* over
``skills/``. Every skill whose SKILL.md frontmatter has a ``produces:``
block contributes one entry. Adding a new data source = dropping a new
``skills/fetch-<thing>/`` folder. No code change.

This is the foundation for two things:

1. **Auto-ingest derivation** (``compass.planner.auto_ingest_tasks``):
   given a compose skill's ``needs:``, look up which producer satisfies
   each category and stamp out the right ingest tasks. The persona-pack
   factory uses this so a hired Munger/Lynch/Klarman gets a working
   pipeline without any per-pack Python.
2. **UI surfacing**: the Workflows / Data tab can list everything the
   pod can fetch, with each entry pointing at the skill that does it.

The registry is **read-only** and re-scanned on each call — there's no
cache to invalidate when a new fetch-* skill is uploaded. Cost is
negligible (single-digit file reads).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from compass.skills import SkillSpec, list_skills


@dataclass
class DataSource:
    """One entry in the registry — a category plus its producer skill.

    ``params`` lists the keyword args the producer's task accepts. For
    ``fetch-sec-filing`` that's ``["form"]`` so a consumer's
    ``needs: filings(10-K)`` resolves to ``fetch-sec-filing(form=10-K)``.

    ``output_pattern`` is mostly documentation — it shows where files
    land on disk. Substitution markers (``{date}``, ``{ticker}``,
    ``{accession}``, ``{form}``) are filled at run time by the producer
    itself; the pattern here is for humans / UI.
    """

    category: str
    producer_skill: str
    params: list[str] = field(default_factory=list)
    output_pattern: str = ""
    description: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def list_data_sources() -> list[DataSource]:
    """Every category Compass can produce, sorted alphabetically by category.

    Skills are scanned on each call so a freshly-uploaded fetch skill
    shows up on the next request without a restart. Skills that don't
    declare ``produces:`` are silently skipped.
    """
    out: list[DataSource] = []
    seen: set[str] = set()
    for skill in list_skills():
        if not skill.produces:
            continue
        category = str(skill.produces.get("category") or "").strip()
        if not category or category in seen:
            # First-wins on category collisions. Future: surface the
            # collision as a UI warning so the user can pick.
            continue
        seen.add(category)
        out.append(DataSource(
            category=category,
            producer_skill=skill.slug,
            params=list(skill.produces.get("params") or []),
            output_pattern=str(skill.produces.get("output_pattern") or ""),
            description=skill.description,
        ))
    out.sort(key=lambda d: d.category)
    return out


def find_producer(category: str) -> DataSource | None:
    """Return the producer for ``category``, or ``None`` if no skill claims it.

    Categories are matched case-insensitively. The ``need: filings(10-K)``
    parameterized form is *not* parsed here — the caller (planner) strips
    the param first and looks up the bare category.
    """
    needle = (category or "").strip().lower()
    if not needle:
        return None
    for ds in list_data_sources():
        if ds.category.lower() == needle:
            return ds
    return None


def producer_for_skill(skill: SkillSpec | None) -> DataSource | None:
    """Inverse lookup — given a skill, return its registry entry (or None).

    Useful when the UI is rendering a skill detail and wants to surface
    "this is the producer for category X."
    """
    if skill is None or not skill.produces:
        return None
    return DataSource(
        category=str(skill.produces.get("category") or "").strip(),
        producer_skill=skill.slug,
        params=list(skill.produces.get("params") or []),
        output_pattern=str(skill.produces.get("output_pattern") or ""),
        description=skill.description,
    )
