"""fetch-insider-trades — pull recent Form 4 transactions via yfinance."""

from __future__ import annotations

import json
import math
from datetime import date
from typing import Any

import yfinance as yf

from compass.engagement import Engagement, Task
from compass.universe import ticker_region


def _row_to_dict(row) -> dict[str, Any]:
    """Convert a yfinance DataFrame row to a JSON-safe dict."""
    out: dict[str, Any] = {}
    for key, value in row.items():
        if value is None:
            continue
        # yfinance returns pandas NaN for blanks; skip those.
        try:
            if isinstance(value, float) and math.isnan(value):
                continue
        except (TypeError, ValueError):
            pass
        # Date / Timestamp objects → ISO strings.
        if hasattr(value, "isoformat"):
            out[str(key)] = value.isoformat()
        else:
            out[str(key)] = value
    return out


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    params = task.params or {}
    limit = int(params.get("limit", 50))

    region = ticker_region(engagement.ticker)
    if region != "US":
        return {
            "count": 0,
            "skipped_reason": (
                f"{engagement.ticker} is a {region} ticker; insider Form 4 data "
                f"is SEC-only and won't be present."
            ),
        }

    t = yf.Ticker(engagement.ticker)
    try:
        df = t.insider_transactions
    except Exception:
        df = None

    rows: list[dict[str, Any]] = []
    if df is not None and not df.empty:
        for _, row in df.head(limit).iterrows():
            rows.append(_row_to_dict(row))

    today = date.today().isoformat()
    out_dir = engagement.root / "corpus" / "ownership"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"insider-trades-{today}.json"
    payload = {
        "ticker": engagement.ticker,
        "source": "yahoo (Form 4 aggregation)",
        "fetched_at": today,
        "count": len(rows),
        "transactions": rows,
    }
    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    return {
        "count": len(rows),
        "artifacts": [engagement.relative(out_path)],
    }
