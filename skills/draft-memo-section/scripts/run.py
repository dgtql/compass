"""draft-memo-section — agent skill that drafts one named memo section."""

from __future__ import annotations

import json
from typing import Any

from compass.agent_helper import run_agent_skill
from compass.engagement import Engagement, Task
from compass.skills import load_skill


def _read_text_safely(path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        return f"(could not read {path}: {exc})"


def _list_artifacts(engagement: Engagement) -> list[str]:
    out: list[str] = []
    for sub in ("analysis/segments", "analysis/kpis", "analysis/gates",
                "corpus/snapshots/yahoo", "corpus/news"):
        d = engagement.root / sub
        if not d.exists():
            continue
        for p in sorted(d.rglob("*")):
            if p.is_file():
                out.append(engagement.relative(p))
    return out


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    params = task.params or {}
    section_slug = params.get("section_slug") or "thesis"
    section_label = params.get("section_label") or section_slug.title()
    memo_type = params.get("memo_type") or "pitch"

    spec = load_skill("draft-memo-section")
    brief = engagement.load_brief() or {}

    artifact_rel = (
        task.artifact_path
        or f"analysis/sections/{engagement.ticker}__{memo_type}__{section_slug}.md"
    )
    artifact_abs = engagement.artifact_path(artifact_rel)
    artifact_abs.parent.mkdir(parents=True, exist_ok=True)

    inventory = _list_artifacts(engagement)
    inventory_block = "\n".join(f"  - {p}" for p in inventory) or "  (no artifacts yet)"

    brief_block = json.dumps(brief, indent=2) if brief else "(no brief on disk)"

    user_prompt = f"""You are drafting the **{section_label}** section of a {memo_type} memo on {engagement.ticker}.

# Section to draft

- slug: `{section_slug}`
- label: `{section_label}`
- memo type: `{memo_type}`

# The brief

{brief_block}

# Evidence available (engagement root: {engagement.root})

{inventory_block}

# Output

Write the section to this absolute path using the Write tool:

    {artifact_abs}

Section voice and length: see your system prompt's cheat sheet for the
`{section_slug}` slug. Start with `## {section_label}` and then the body.
After writing, reply in one short sentence with the path and approximate
word count.
"""

    await run_agent_skill(
        spec=spec,
        engagement=engagement,
        user_prompt=user_prompt,
        on_event=on_event,
        max_turns=20,
    )

    if not artifact_abs.exists():
        raise RuntimeError(f"draft-memo-section: artifact not written at {artifact_abs}")
    return {
        "section": section_slug,
        "label": section_label,
        "artifact": engagement.relative(artifact_abs),
    }
