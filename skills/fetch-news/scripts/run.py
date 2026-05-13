"""fetch-news — pull recent news into corpus/news/<date>.json."""

from __future__ import annotations

import json
from datetime import date
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
    limit = int(params.get("limit", 10))

    items = YahooSource().fetch_news(engagement.ticker, limit=limit)
    out_dir = engagement.root / "corpus" / "news"
    out_dir.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    out_path = out_dir / f"{today}.json"

    payload = {
        "ticker": engagement.ticker,
        "source": "yahoo",
        "fetched_at": today,
        "items": items,
    }
    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    return {
        "count": len(items),
        "artifacts": [engagement.relative(out_path)],
    }
