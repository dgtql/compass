"""Chat-driven skill orchestration — bridges chat to the engagement system.

When the PM asks for a memo from the chat surface we need to:

1. Resolve the right analyst slug for the engagement tree (the chat
   owner may be ``master`` or an analyst slug directly).
2. Plan the template (``pitch-memo``) for that analyst × ticker.
3. Drive the dispatcher, piping every event back through the caller's
   ``on_event`` hook so the chat UI can render task progress live.
4. Surface the assembled memo at the end.

The dispatcher and planner already exist — this module is intentionally
thin and just stitches them together for the chat surface.
"""

from __future__ import annotations

from typing import Any, Callable

from compass.analysts import list_analysts
from compass.dispatcher import run_engagement
from compass.engagement import (
    DEFAULT_ANALYST_FALLBACK,
    DEFAULT_ANALYST_FOR_TICKER,
    Engagement,
)
from compass.planner import plan as plan_template


def resolve_analyst_for_owner(owner_key: str, ticker: str) -> str:
    """Pick the analyst slug to file the engagement under.

    - ``master`` → ticker→analyst default map, then first hired analyst,
      then the project fallback.
    - Anything else → treated as the analyst slug verbatim.
    """
    owner_key = (owner_key or "").strip().lower()
    if owner_key and owner_key != "master":
        return owner_key

    ticker_upper = (ticker or "").upper()
    if ticker_upper in DEFAULT_ANALYST_FOR_TICKER:
        return DEFAULT_ANALYST_FOR_TICKER[ticker_upper]
    roster = list_analysts()
    if roster:
        return roster[0].slug
    return DEFAULT_ANALYST_FALLBACK


async def run_memo_for_chat(
    owner_key: str,
    ticker: str,
    *,
    template: str = "pitch-memo",
    on_event: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Plan + execute a memo engagement, streaming events through ``on_event``.

    Events emitted (in addition to the dispatcher's ``task_start`` /
    ``task_done`` / ``task_error`` / ``task_blocked``):

    * ``engagement_opened`` — analyst, ticker, template, root path
    * ``plan_done`` — full task list (id, title, skill, depends_on, …)
    * ``memo_ready`` — final assembled memo path + text (if compose-assemble
      succeeded)

    Returns the dispatcher summary augmented with ``analyst``, ``ticker``,
    ``template``, ``memo_path``, ``memo_text``.
    """
    ticker = (ticker or "").strip().upper()
    if not ticker:
        raise ValueError("ticker is required")

    analyst_slug = resolve_analyst_for_owner(owner_key, ticker)
    engagement = Engagement.open(ticker, analyst=analyst_slug)
    # Fold the analyst's persona into the engagement so agent-mode skills
    # can write in the right voice. Generic analysts (no persona text)
    # land with ``""`` and skills behave as before.
    from compass.analysts import get_analyst
    analyst = get_analyst(analyst_slug)
    if analyst and analyst.persona:
        engagement.persona = analyst.persona

    _emit(on_event, {
        "type": "engagement_opened",
        "analyst": analyst_slug,
        "ticker": ticker,
        "template": template,
        "root": str(engagement.root),
    })

    # Always replan for v1 — every chat-driven run is a fresh sweep so
    # debugging breaking skills is predictable. Resume/diff comes later.
    tasks = plan_template(engagement, template)
    engagement.save_tasks(tasks, template=template)

    _emit(on_event, {
        "type": "plan_done",
        "task_count": len(tasks),
        "tasks": [t.to_dict() for t in tasks],
    })

    summary = await run_engagement(engagement, on_event=on_event)

    # Surface the final compose-phase artifact so the UI can render it
    # inline. Generic templates end with ``compose-assemble``; pack
    # templates that fold compose to a single skill call (Buffett, …)
    # end with whatever that single task is. Either way the "final memo"
    # is the *last* compose task that completed with an artifact_path.
    memo_path: str | None = None
    memo_text: str | None = None
    compose_done = [
        t for t in engagement.load_tasks()
        if t.stage == "compose" and t.status == "done" and t.artifact_path
    ]
    if compose_done:
        final = compose_done[-1]
        # tasks.json preserves planner order, so this is the assemble-step
        # equivalent — last to run in the compose phase.
        path = engagement.root / final.artifact_path
        if path.exists():
            memo_path = final.artifact_path
            memo_text = path.read_text(encoding="utf-8", errors="replace")

    _emit(on_event, {
        "type": "memo_ready",
        "memo_path": memo_path,
        "memo_text": memo_text,
    })

    return {
        **summary,
        "analyst": analyst_slug,
        "ticker": ticker,
        "template": template,
        "memo_path": memo_path,
        "memo_text": memo_text,
    }


def _emit(on_event: Callable[[dict[str, Any]], None] | None, event: dict[str, Any]) -> None:
    if on_event is None:
        return
    try:
        on_event(event)
    except Exception:  # noqa: BLE001 — never let the sink break the run
        pass
