"""update-coverage-brief — agent skill that propagates findings into the brief."""

from __future__ import annotations

import json
from typing import Any

from compass.agent_helper import run_agent_skill
from compass.engagement import Engagement, Task
from compass.skills import load_skill


def _newest_memo(engagement: Engagement) -> str | None:
    memos_dir = engagement.root / "memos"
    if not memos_dir.exists():
        return None
    candidates = list(memos_dir.rglob("*.md"))
    if not candidates:
        return None
    newest = max(candidates, key=lambda p: p.stat().st_mtime)
    return engagement.relative(newest)


def _kpis_path(engagement: Engagement) -> str | None:
    p = engagement.root / "analysis" / "kpis" / f"{engagement.ticker}__kpis.json"
    return engagement.relative(p) if p.exists() else None


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    brief = engagement.load_brief()
    if brief is None:
        raise RuntimeError(
            "update-coverage-brief: no brief yet to update. "
            "Run build-coverage-brief first."
        )

    spec = load_skill("update-coverage-brief")
    brief_abs = engagement.brief_path

    memo = _newest_memo(engagement) or "(no memo found — update from KPIs only)"
    kpis = _kpis_path(engagement) or "(no KPI extraction found)"

    user_prompt = f"""Update the coverage brief for {engagement.ticker} based on freshly written evidence.

# Current brief on disk

{json.dumps(brief, indent=2)}

# Newest memo (relative to engagement root: {engagement.root})

{memo}

# Latest KPI extraction (relative)

{kpis}

# Output

Overwrite the brief at:

    {brief_abs}

Conform to the schema in your system prompt. Read the memo and the KPI
JSON with the Read tool, decide what changes, and write the updated
brief. After writing, reply in ONE short sentence with the fields you
updated and a flag if you touched the thesis text.
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
            f"update-coverage-brief: brief not written at {engagement.brief_path}"
        )
    return {"artifact": engagement.relative(engagement.brief_path)}
