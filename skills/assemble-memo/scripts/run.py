"""assemble-memo — agent skill that stitches section drafts into the final memo."""

from __future__ import annotations

from typing import Any

from compass.agent_helper import run_agent_skill
from compass.engagement import Engagement, Task
from compass.skills import load_skill


_MEMO_TITLE = {
    "pitch": "Pitch Memo",
    "earnings-reaction": "Earnings Reaction",
    "maintenance": "Maintenance Update",
    "deep-dive": "Deep-Dive Memo",
}


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    params = task.params or {}
    memo_type = params.get("memo_type") or "pitch"
    section_order: list[str] = params.get("section_order") or []

    if not section_order:
        raise ValueError(
            "assemble-memo: params.section_order is required (list of section slugs)."
        )

    spec = load_skill("assemble-memo")
    brief = engagement.load_brief() or {}
    company = brief.get("company_name") or engagement.ticker
    title = _MEMO_TITLE.get(memo_type, memo_type.replace("-", " ").title())

    if task.artifact_path is None:
        raise ValueError("assemble-memo: task.artifact_path required (memo destination).")
    memo_abs = engagement.artifact_path(task.artifact_path)
    memo_abs.parent.mkdir(parents=True, exist_ok=True)

    # Build the ordered list of section files. Tolerate missing sections —
    # the agent will note them in its summary.
    sections_dir = engagement.root / "analysis" / "sections"
    section_paths: list[tuple[str, str]] = []  # (slug, abs path)
    for slug in section_order:
        candidate = sections_dir / f"{engagement.ticker}__{memo_type}__{slug}.md"
        section_paths.append((slug, str(candidate)))

    section_block = "\n".join(
        f"  {i+1}. `{slug}` → {path}"
        for i, (slug, path) in enumerate(section_paths)
    )

    user_prompt = f"""Assemble the final {memo_type} memo for {engagement.ticker}.

# Header line to write

    # {company} ({engagement.ticker}) — {title}
    *Compass · <today's date in YYYY-MM-DD>*

(Use the actual UTC date for today.)

# Sections, in order

{section_block}

Read each section file with the Read tool. Concatenate with a single
blank line between sections. Add at most one transition sentence between
two sections, and only if the cut is jarring.

# Output

Write the assembled memo to:

    {memo_abs}

After the last section, add a `## Sources` section: a flat bulleted list
of the engagement-relative paths cited in the body's `(source: …)`
parentheticals, deduplicated.

After writing, reply with: section count, total word count, source count.
"""

    await run_agent_skill(
        spec=spec,
        engagement=engagement,
        user_prompt=user_prompt,
        on_event=on_event,
        max_turns=20,
    )

    if not memo_abs.exists():
        raise RuntimeError(f"assemble-memo: memo not written at {memo_abs}")
    return {
        "memo": engagement.relative(memo_abs),
        "memo_type": memo_type,
        "section_count": len(section_order),
    }
