"""fetch-press-releases — recent 8-Ks via edgartools."""

from __future__ import annotations

import json
from datetime import date
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
    limit = int(params.get("limit", 5))

    docs = EdgarSource().fetch(
        engagement.ticker,
        engagement_root=engagement.root,
        form_type="8-K",
        limit=limit,
    )

    today = date.today().isoformat()
    index_path = engagement.root / "corpus" / "filings" / "8-K" / f"index-{today}.json"
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text(
        json.dumps(
            {
                "ticker": engagement.ticker,
                "fetched_at": today,
                "count": len(docs),
                "filings": [
                    {
                        "accession": d.source_id,
                        "url": d.source_url,
                        "path": engagement.relative(d.local_path),
                    }
                    for d in docs
                ],
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    return {
        "count": len(docs),
        "artifacts": [engagement.relative(d.local_path) for d in docs]
        + [engagement.relative(index_path)],
    }
