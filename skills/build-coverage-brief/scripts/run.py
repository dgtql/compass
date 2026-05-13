"""build-coverage-brief — agent skill that authors/refreshes the brief."""

from __future__ import annotations

import json
from typing import Any

from compass.agent_helper import run_agent_skill
from compass.engagement import Engagement, Task
from compass.skills import load_skill


def _inventory(engagement: Engagement) -> list[str]:
    """List artifact paths the agent should consider, relative to engagement root."""
    out: list[str] = []
    if engagement.brief_path.exists():
        out.append(engagement.relative(engagement.brief_path))
    for sub in ("corpus/snapshots/yahoo", "corpus/news", "corpus/filings", "analysis/segments"):
        d = engagement.root / sub
        if not d.exists():
            continue
        for p in sorted(d.rglob("*")):
            if p.is_file() and p.suffix in (".md", ".json"):
                out.append(engagement.relative(p))
    return out


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    spec = load_skill("build-coverage-brief")
    existing = engagement.load_brief()
    inventory = _inventory(engagement)

    brief_abs = engagement.brief_path

    existing_block = (
        json.dumps(existing, indent=2)
        if existing is not None
        else "(no existing brief — bootstrap from artifacts below)"
    )
    inventory_block = "\n".join(f"  - {p}" for p in inventory) or "  (no artifacts yet)"

    user_prompt = f"""You are refreshing the coverage brief for {engagement.ticker} (analyst: {engagement.analyst_slug}).

# Current brief on disk

{existing_block}

# Artifacts available under the engagement root (read with the Read tool, absolute paths)

Engagement root: {engagement.root}
{inventory_block}

# Your output

Write the new brief JSON to this absolute path using the Write tool:

    {brief_abs}

Conform to the schema in your system prompt. After writing, reply in two
short sentences summarizing what changed (or what you bootstrapped).
"""

    await run_agent_skill(
        spec=spec,
        engagement=engagement,
        user_prompt=user_prompt,
        on_event=on_event,
        max_turns=20,
    )

    if not engagement.brief_path.exists():
        raise RuntimeError(
            f"build-coverage-brief: brief was not written at {engagement.brief_path}"
        )
    return {
        "artifact": engagement.relative(engagement.brief_path),
        "is_new": existing is None,
    }
