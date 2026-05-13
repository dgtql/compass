"""web-research — agent skill that runs a web search and writes a structured summary."""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Any

from compass.agent_helper import run_agent_skill
from compass.engagement import Engagement, Task
from compass.skills import load_skill


def _slugify(text: str, max_len: int = 50) -> str:
    """ASCII slug; alnum + hyphens, capped length. Stable for filenames."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:max_len] or "query"


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    params = task.params or {}
    query = (params.get("query") or "").strip()
    if not query:
        raise ValueError(
            "web-research: task.params.query is required (the search query)."
        )

    spec = load_skill("web-research")
    today = date.today().isoformat()
    slug = _slugify(query)

    artifact_rel = (
        task.artifact_path
        or f"corpus/research/{slug}-{today}.md"
    )
    artifact_abs = engagement.artifact_path(artifact_rel)
    artifact_abs.parent.mkdir(parents=True, exist_ok=True)

    brief = engagement.load_brief()
    brief_block = (
        json.dumps(brief.get("thesis_one_liner") or brief.get("thesisOneLiner") or "", indent=2)
        if brief
        else "(no brief — research without thesis context)"
    )

    user_prompt = f"""You are running web research for the {engagement.ticker} coverage engagement.

# Query

> {query}

# Thesis context (for relevance, not citation)

{brief_block}

# Output

Write the structured summary to this absolute path using the Write tool:

    {artifact_abs}

Use the schema in your system prompt. Cite every claim. After writing,
reply in one short sentence: query, source count, path.
"""

    await run_agent_skill(
        spec=spec,
        engagement=engagement,
        user_prompt=user_prompt,
        on_event=on_event,
        max_turns=25,
    )

    if not artifact_abs.exists():
        raise RuntimeError(f"web-research: artifact not written at {artifact_abs}")
    return {
        "query": query,
        "artifact": engagement.relative(artifact_abs),
    }
