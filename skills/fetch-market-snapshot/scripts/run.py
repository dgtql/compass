"""fetch-market-snapshot — pull a Yahoo snapshot for the engagement ticker."""

from __future__ import annotations

from typing import Any

from compass.engagement import Engagement, Task
from compass.ingest.yahoo import YahooSource


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    params = task.params or {}
    history_period = params.get("history_period", "1y")

    docs = YahooSource().fetch(
        engagement.ticker,
        engagement_root=engagement.root,
        history_period=history_period,
    )
    if not docs:
        return {"count": 0, "note": f"Yahoo returned no data for {engagement.ticker}."}

    return {
        "count": len(docs),
        "artifacts": [engagement.relative(d.local_path) for d in docs],
    }
