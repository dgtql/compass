"""fetch-sec-filing — pull SEC filings via edgartools."""

from __future__ import annotations

from typing import Any

from compass.engagement import Engagement, Task
from compass.ingest.edgar import EdgarSource


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    params = task.params or {}
    form = params.get("form", "10-K")
    limit = int(params.get("limit", 1))

    source = EdgarSource()
    docs = source.fetch(
        engagement.ticker,
        engagement_root=engagement.root,
        form_type=form,
        limit=limit,
    )

    if not docs:
        return {
            "form": form,
            "limit": limit,
            "count": 0,
            "note": f"No {form} filings on EDGAR for {engagement.ticker}.",
        }

    paths = [engagement.relative(d.local_path) for d in docs]
    return {
        "form": form,
        "limit": limit,
        "count": len(docs),
        "artifacts": paths,
    }
