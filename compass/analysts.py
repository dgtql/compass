"""Analyst roster — per-PM hired analysts on disk.

The PM "hires" analysts; each one has a sector, a coverage list (tickers
from the universe), and an optional persona that shapes the writing
voice. Engagement folders live under
``data/engagements/<analyst-slug>/<TICKER>/`` and are keyed by this
roster.

Storage: a single JSON file at ``data/analysts.json``. Per-user (the
top-level ``data/`` is gitignored). Schema::

    {
      "as_of":   "2026-05-13T...",
      "analysts": [
        {
          "id":              "a-2026-05-13-001",
          "slug":            "maria-chen",
          "name":            "Maria Chen",
          "title":           "Analyst · Technology",
          "sector":          "Information Technology",
          "coverage":        ["NVDA", "AMD", "INTC"],
          "persona":         "...",
          "avatar_color":    "cyan",
          "avatar_initials": "MC",
          "status":          "idle",
          "hired_at":        "2026-05-13",
          "stats":           {"memos": 0, "tasks_done": 0, "active_tasks": 0},
          "current_focus":   null
        }
      ]
    }
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

# Tailwind colors that the UI's <Avatar> component knows about. Picked to
# read well on both light and dark backgrounds.
_AVATAR_PALETTE: tuple[str, ...] = (
    "cyan",
    "violet",
    "amber",
    "emerald",
    "rose",
    "indigo",
    "fuchsia",
    "sky",
    "lime",
    "orange",
)

VALID_STATUSES: tuple[str, ...] = ("idle", "working", "review", "offline")


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------


def analysts_path() -> Path:
    """Per-user JSON file location. Honors ``COMPASS_DATA_DIR``."""
    base = Path(os.environ.get("COMPASS_DATA_DIR", "data")).resolve()
    return base / "analysts.json"


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class AnalystStats:
    memos: int = 0
    tasks_done: int = 0
    active_tasks: int = 0


@dataclass
class Analyst:
    id: str
    slug: str
    name: str
    title: str
    sector: str
    coverage: list[str] = field(default_factory=list)
    persona: str = ""
    avatar_color: str = "cyan"
    avatar_initials: str = "??"
    status: str = "idle"
    hired_at: str = ""
    stats: AnalystStats = field(default_factory=AnalystStats)
    current_focus: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return d

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Analyst":
        keep = set(cls.__dataclass_fields__)
        kwargs = {k: v for k, v in data.items() if k in keep}
        stats = kwargs.get("stats")
        if isinstance(stats, dict):
            kwargs["stats"] = AnalystStats(**{
                k: v for k, v in stats.items()
                if k in AnalystStats.__dataclass_fields__
            })
        return cls(**kwargs)


@dataclass
class Roster:
    as_of: str
    analysts: list[Analyst] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "as_of": self.as_of,
            "analysts": [a.to_dict() for a in self.analysts],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Roster":
        return cls(
            as_of=data.get("as_of", ""),
            analysts=[Analyst.from_dict(a) for a in data.get("analysts", [])],
        )


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------


def load_roster(*, path: Path | None = None) -> Roster:
    p = path or analysts_path()
    if not p.exists():
        return Roster(as_of=_now_iso(), analysts=[])
    return Roster.from_dict(json.loads(p.read_text(encoding="utf-8")))


def save_roster(roster: Roster, *, path: Path | None = None) -> Path:
    p = path or analysts_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    roster.as_of = _now_iso()
    p.write_text(
        json.dumps(roster.to_dict(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return p


# ---------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------


def create_analyst(
    *,
    name: str,
    sector: str,
    coverage: list[str] | None = None,
    persona: str = "",
    title: str | None = None,
    path: Path | None = None,
    validate_coverage: bool = True,
) -> Analyst:
    """Create + persist a new analyst. Returns the analyst record.

    * ``name`` is required. The slug is derived from it (collision-resolved
      with a numeric suffix).
    * ``sector`` must be one of the GICS sectors (`compass.universe.GICS_SECTORS`).
    * ``coverage`` tickers must exist in the universe seed when
      ``validate_coverage=True`` (default).
    * ``title`` defaults to ``"Analyst · <sector>"`` if omitted.
    """
    from compass.universe import GICS_SECTORS, load_universe

    nm = (name or "").strip()
    if not nm:
        raise ValueError("name is required")
    if sector not in GICS_SECTORS:
        raise ValueError(f"sector must be one of GICS_SECTORS, got {sector!r}")

    coverage_clean: list[str] = []
    if coverage:
        seen: set[str] = set()
        for raw in coverage:
            t = (raw or "").strip().upper()
            if not t or t in seen:
                continue
            seen.add(t)
            coverage_clean.append(t)

        if validate_coverage and coverage_clean:
            universe = load_universe()
            if universe is None:
                raise RuntimeError(
                    "universe seed missing — run `compass refresh-universe` first."
                )
            valid = {t.ticker for t in universe.tickers}
            unknown = [t for t in coverage_clean if t not in valid]
            if unknown:
                raise ValueError(
                    f"coverage contains unknown tickers: {unknown[:5]}"
                    + ("..." if len(unknown) > 5 else "")
                )

    roster = load_roster(path=path)
    slug = _unique_slug(nm, roster)
    analyst = Analyst(
        id=_next_id(roster),
        slug=slug,
        name=nm,
        title=(title or f"Analyst · {sector}").strip(),
        sector=sector,
        coverage=coverage_clean,
        persona=(persona or "").strip(),
        avatar_color=_pick_color(slug),
        avatar_initials=_initials(nm),
        status="idle",
        hired_at=date.today().isoformat(),
        stats=AnalystStats(),
        current_focus=None,
    )
    roster.analysts.append(analyst)
    save_roster(roster, path=path)
    return analyst


def list_analysts(*, path: Path | None = None) -> list[Analyst]:
    return load_roster(path=path).analysts


def get_analyst(slug: str, *, path: Path | None = None) -> Analyst | None:
    for a in load_roster(path=path).analysts:
        if a.slug == slug:
            return a
    return None


def delete_analyst(slug: str, *, path: Path | None = None) -> Roster:
    roster = load_roster(path=path)
    before = len(roster.analysts)
    roster.analysts = [a for a in roster.analysts if a.slug != slug]
    if len(roster.analysts) != before:
        save_roster(roster, path=path)
    return roster


def update_analyst_coverage(
    slug: str,
    coverage: list[str],
    *,
    path: Path | None = None,
    validate: bool = True,
) -> Analyst:
    """Replace the analyst's coverage list. Validates against the universe."""
    from compass.universe import load_universe

    upper = [c.strip().upper() for c in coverage if (c or "").strip()]
    if validate and upper:
        universe = load_universe()
        if universe is None:
            raise RuntimeError("universe seed missing.")
        valid = {t.ticker for t in universe.tickers}
        unknown = [t for t in upper if t not in valid]
        if unknown:
            raise ValueError(f"unknown tickers: {unknown[:5]}")

    roster = load_roster(path=path)
    found = next((a for a in roster.analysts if a.slug == slug), None)
    if found is None:
        raise ValueError(f"analyst not found: {slug}")
    found.coverage = upper
    save_roster(roster, path=path)
    return found


# ---------------------------------------------------------------------------
# Slug + avatar helpers
# ---------------------------------------------------------------------------


def _slugify(name: str) -> str:
    """ASCII slug, lowercase, hyphenated. Empty input gets a fallback."""
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "analyst"


def _unique_slug(name: str, roster: Roster) -> str:
    base = _slugify(name)
    existing = {a.slug for a in roster.analysts}
    if base not in existing:
        return base
    n = 2
    while f"{base}-{n}" in existing:
        n += 1
    return f"{base}-{n}"


def _next_id(roster: Roster) -> str:
    today = date.today().isoformat()
    same_day = [a for a in roster.analysts if a.id.startswith(f"a-{today}")]
    return f"a-{today}-{len(same_day) + 1:03d}"


def _initials(name: str) -> str:
    """First letter of first + last word; fall back to first two letters."""
    parts = [p for p in re.split(r"\s+", name.strip()) if p]
    if len(parts) >= 2:
        return (parts[0][0] + parts[-1][0]).upper()
    if len(parts) == 1:
        return parts[0][:2].upper()
    return "??"


def _pick_color(slug: str) -> str:
    """Deterministic-but-varied color from the avatar palette."""
    idx = sum(ord(c) for c in slug) % len(_AVATAR_PALETTE)
    return _AVATAR_PALETTE[idx]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
