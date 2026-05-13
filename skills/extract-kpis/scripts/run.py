"""extract-kpis — agent skill that fills the brief's KPI list with current values."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from compass.agent_helper import run_agent_skill
from compass.engagement import Engagement, Task
from compass.skills import load_skill


def _evidence_paths(engagement: Engagement) -> list[str]:
    out: list[str] = []
    for sub in (
        "analysis/segments",
        "corpus/snapshots/yahoo",
        "corpus/filings",
    ):
        d = engagement.root / sub
        if not d.exists():
            continue
        for p in sorted(d.rglob("*.md")):
            out.append(engagement.relative(p))
    return out


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    brief = engagement.load_brief()
    if brief is None:
        raise RuntimeError(
            "extract-kpis: no brief yet at .pipeline/docs/coverage_brief.json. "
            "Run build-coverage-brief first."
        )

    spec = load_skill("extract-kpis")
    artifact_rel = task.artifact_path or f"analysis/kpis/{engagement.ticker}__kpis.json"
    artifact_abs = engagement.artifact_path(artifact_rel)
    artifact_abs.parent.mkdir(parents=True, exist_ok=True)

    kpi_block = json.dumps(brief.get("kpis", []), indent=2)
    inventory = _evidence_paths(engagement)
    inventory_block = "\n".join(f"  - {p}" for p in inventory) or "  (no evidence yet)"

    user_prompt = f"""You are extracting KPIs for {engagement.ticker}.

# KPIs to fill (from the brief)

{kpi_block}

# Evidence available (relative to engagement root)

Engagement root: {engagement.root}
{inventory_block}

# Output

Write the JSON to this absolute path using the Write tool:

    {artifact_abs}

Conform to the schema in your system prompt. Read each evidence file
with the Read tool — use offset/limit to page through large filings.
After writing, reply in one short sentence.
"""

    await run_agent_skill(
        spec=spec,
        engagement=engagement,
        user_prompt=user_prompt,
        on_event=on_event,
        max_turns=25,
    )

    if not artifact_abs.exists():
        raise RuntimeError(f"extract-kpis: artifact not written at {artifact_abs}")
    return {"artifact": engagement.relative(artifact_abs)}
