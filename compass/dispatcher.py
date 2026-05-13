"""Task dispatcher — runs the tasks in an engagement's ``tasks.json``.

The dispatcher is intentionally small: walk the task list in dependency
order, call each task's skill via :mod:`compass.skills`, update the task's
status, and persist ``tasks.json`` after each transition so a watching
UI sees live progress.

It does not plan — the planner (``compass.planner``) emits ``tasks.json``;
the dispatcher executes it.
"""

from __future__ import annotations

import time
import traceback
from datetime import datetime, timezone
from typing import Any, Callable

from compass.engagement import Engagement, Task
from compass.skills import import_run_function, load_skill


async def run_engagement(
    engagement: Engagement,
    *,
    only_phase: str | None = None,
    only_task_ids: list[str] | None = None,
    stop_on_error: bool = True,
    on_event: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Execute every pending task in ``engagement`` in order.

    Tasks already marked ``done`` are skipped. Tasks whose dependencies
    haven't completed yet are deferred and revisited.

    Returns a summary dict: ``{ran, skipped, errors, tasks: [...]}``.
    """
    tasks = engagement.load_tasks()
    if not tasks:
        return {"ran": 0, "skipped": 0, "errors": 0, "tasks": []}

    ran = 0
    skipped = 0
    errors = 0
    by_id: dict[str, Task] = {t.id: t for t in tasks}

    # Topo-sort attempt with dependency awareness. The planner produces
    # tasks already in execution order; this is a safety net.
    ordered = _order_by_dependencies(tasks)

    for task in ordered:
        if only_phase and task.stage != only_phase:
            continue
        if only_task_ids and task.id not in only_task_ids:
            continue
        # Only run pending tasks. Anything else (done/error/in-progress) is
        # left as-is — re-running a failed task requires explicit reset
        # (e.g. editing tasks.json or passing --only with the task ID).
        if task.status != "pending":
            skipped += 1
            continue
        # Block if any dependency hasn't finished successfully.
        blocked = [d for d in task.depends_on if by_id.get(d) and by_id[d].status != "done"]
        if blocked:
            engagement.log_event(
                {"type": "task_blocked", "task_id": task.id, "blocked_by": blocked}
            )
            skipped += 1
            continue

        await _run_one_task(engagement, task, on_event=on_event)
        engagement.save_tasks(tasks)
        if task.status == "done":
            ran += 1
        elif task.status == "error":
            errors += 1
            if stop_on_error:
                break

    return {
        "ran": ran,
        "skipped": skipped,
        "errors": errors,
        "tasks": [t.to_dict() for t in tasks],
    }


async def _run_one_task(
    engagement: Engagement,
    task: Task,
    *,
    on_event: Callable[[dict[str, Any]], None] | None = None,
) -> None:
    """Run ``task`` and mutate its status fields in place."""
    task.status = "in-progress"
    task.started_at = _now_iso()
    started = time.monotonic()
    engagement.log_event({"type": "task_start", "task_id": task.id, "skill": task.skill})
    if on_event is not None:
        try:
            on_event({"type": "task_start", "task_id": task.id, "skill": task.skill})
        except Exception:  # noqa: BLE001
            pass

    try:
        spec = load_skill(task.skill)
        run_fn = import_run_function(spec)
        result = await run_fn(engagement=engagement, task=task, on_event=on_event)
        task.status = "done"
        task.error = None
        engagement.log_event(
            {
                "type": "task_done",
                "task_id": task.id,
                "skill": task.skill,
                "elapsed": round(time.monotonic() - started, 2),
                "result": result if isinstance(result, dict) else {"value": str(result)},
            }
        )
    except Exception as exc:  # noqa: BLE001
        task.status = "error"
        task.error = f"{type(exc).__name__}: {exc}"
        engagement.log_event(
            {
                "type": "task_error",
                "task_id": task.id,
                "skill": task.skill,
                "error": task.error,
                "trace": traceback.format_exc(limit=4),
            }
        )
    finally:
        task.finished_at = _now_iso()


# ---------------------------------------------------------------------------
# Dependency ordering
# ---------------------------------------------------------------------------


def _order_by_dependencies(tasks: list[Task]) -> list[Task]:
    """Stable topo sort. Falls back to the planner's order if cycles exist."""
    by_id = {t.id: t for t in tasks}
    visited: set[str] = set()
    ordered: list[Task] = []

    def visit(t: Task, stack: set[str]) -> None:
        if t.id in visited:
            return
        if t.id in stack:
            return  # cycle — just bail and keep planner order
        stack.add(t.id)
        for dep_id in t.depends_on:
            dep = by_id.get(dep_id)
            if dep is not None:
                visit(dep, stack)
        stack.discard(t.id)
        if t.id not in visited:
            visited.add(t.id)
            ordered.append(t)

    for t in tasks:
        visit(t, set())
    return ordered


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
