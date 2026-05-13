"""plan-research — match a PM ask to a template and write tasks.json.

This skill is deterministic in v1: pattern-match the ``user_ask`` (or
take an explicit ``template``) and call the planner. The free-form
LLM-decomposition fallback is on the v2 roadmap.
"""

from __future__ import annotations

from typing import Any

from compass.engagement import Engagement, Task
from compass.planner import plan, list_templates


_KEYWORD_TO_TEMPLATE: list[tuple[tuple[str, ...], str]] = [
    (("pitch", "initial", "initiate", "coverage"), "pitch-memo"),
    (("earning", "reaction", "post-earnings"),     "earnings-reaction"),
    (("maintenance", "refresh", "update", "10-q"), "maintenance-refresh"),
]


def template_for_ask(ask: str) -> str | None:
    """Best-effort keyword match. Returns None if nothing fits."""
    lowered = ask.lower()
    for keywords, name in _KEYWORD_TO_TEMPLATE:
        if any(k in lowered for k in keywords):
            return name
    return None


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    """Plan tasks for the engagement.

    ``task.params`` may contain:
    - ``template``: explicit template name (preferred).
    - ``user_ask``: free-form ask; we'll try to keyword-match it.
    """
    params = task.params or {}
    template_name = params.get("template")
    user_ask = params.get("user_ask", "")

    if not template_name:
        template_name = template_for_ask(user_ask)
    if not template_name:
        raise ValueError(
            f"plan-research: no template matched. "
            f"Pass params.template explicitly (one of {list_templates()}) "
            f"or include keywords in user_ask."
        )

    planned = plan(engagement, template_name)
    engagement.save_tasks(planned, template=template_name)
    return {
        "template": template_name,
        "task_count": len(planned),
        "tasks_path": str(engagement.tasks_path),
    }
