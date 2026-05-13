"""parse-10k-segments — split a filing markdown into canonical sections.

Heuristic walk of Markdown headings; no LLM call. Cheap, fast, repeatable.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from compass.engagement import Engagement, Task

# Section key → list of header substrings (case-insensitive). First match wins.
_SECTION_PATTERNS: dict[str, list[str]] = {
    "business": [
        "item 1. business",
        "item 1business",
        "item 1 — business",
        "item 1 - business",
        "business overview",
    ],
    "risk-factors": [
        "item 1a. risk factors",
        "item 1a risk factors",
        "risk factors",
    ],
    "mdna": [
        "management's discussion",
        "management’s discussion",
        "item 7. management",
        "item 2. management",
        "item 7 — management",
    ],
    "financial-statements": [
        "item 8. financial statements",
        "item 1. financial statements",
        "consolidated balance sheet",
        "consolidated statements of operations",
    ],
}


def _normalize(line: str) -> str:
    return re.sub(r"\s+", " ", line.strip(" #*_").lower())


def _classify_heading(line: str) -> str | None:
    norm = _normalize(line)
    for section, patterns in _SECTION_PATTERNS.items():
        for p in patterns:
            if p in norm:
                return section
    return None


def _split_into_sections(text: str) -> dict[str, str]:
    """Walk markdown lines; group content by the most recently seen section heading."""
    out: dict[str, list[str]] = {}
    current: str | None = None
    for line in text.splitlines():
        is_heading = line.lstrip().startswith("#")
        if is_heading:
            classified = _classify_heading(line)
            if classified is not None:
                current = classified
                out.setdefault(current, [])
                continue
            # Heading we don't care about — if we're inside a tracked section,
            # keep accumulating; if not, ignore until next tracked heading.
        if current is not None:
            out.setdefault(current, []).append(line)
    return {k: "\n".join(v).strip() for k, v in out.items() if v}


def _find_latest_filing(engagement: Engagement, form: str) -> Path | None:
    form_dir = engagement.root / "corpus" / "filings" / form
    if not form_dir.exists():
        return None
    candidates: list[Path] = []
    for acc_dir in form_dir.iterdir():
        primary = acc_dir / "primary.md"
        if primary.exists():
            candidates.append(primary)
    if not candidates:
        return None
    # Most-recent by modification time (edgartools writes them in order).
    return max(candidates, key=lambda p: p.stat().st_mtime)


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    params = task.params or {}
    form = params.get("form", "10-K")
    primary = _find_latest_filing(engagement, form)
    if primary is None:
        return {
            "form": form,
            "count": 0,
            "note": f"No {form} filing found under corpus/filings/{form}/.",
        }

    text = primary.read_text(encoding="utf-8", errors="replace")
    sections = _split_into_sections(text)

    out_dir = engagement.root / "analysis" / "segments"
    out_dir.mkdir(parents=True, exist_ok=True)
    accession = primary.parent.name
    artifacts: list[str] = []
    for section, body in sections.items():
        out_path = out_dir / f"{engagement.ticker}__{form}__{accession}__{section}.md"
        # Lead each section with a small header so a reader (or an LLM) sees
        # which slice of which filing they're looking at.
        header = (
            f"# {engagement.ticker} · {form} · {accession} · {section.upper()}\n\n"
            f"*Extracted from: corpus/filings/{form}/{accession}/primary.md*\n\n"
        )
        out_path.write_text(header + body + "\n", encoding="utf-8")
        artifacts.append(engagement.relative(out_path))

    missed = [s for s in _SECTION_PATTERNS if s not in sections]
    return {
        "form": form,
        "source": engagement.relative(primary),
        "sections": list(sections.keys()),
        "missed_sections": missed,
        "artifacts": artifacts,
    }
