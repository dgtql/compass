"""fetch-sec-filing — pull SEC filings via edgartools.

Skips non-US tickers cleanly (EDGAR doesn't carry foreign listings without
a CIK). The dispatcher records a ``done`` task with ``count: 0`` and the
downstream compose agent sees "(none yet)" for the filings category —
the memo still gets composed from whatever else was fetched.
"""

from __future__ import annotations

from typing import Any

from compass.engagement import Engagement, Task
from compass.ingest.edgar import EdgarSource
from compass.universe import ticker_region


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    params = task.params or {}
    form = params.get("form", "10-K")
    limit = int(params.get("limit", 1))

    # Region gate — EDGAR is US-only. Skip cleanly so the pipeline
    # continues with whatever EU-applicable producers can fetch.
    region = ticker_region(engagement.ticker)
    if region != "US":
        return {
            "form": form,
            "limit": limit,
            "count": 0,
            "skipped_reason": f"{engagement.ticker} is a {region} ticker; SEC has no filings.",
        }

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
