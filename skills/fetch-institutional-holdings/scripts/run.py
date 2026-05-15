"""fetch-institutional-holdings — top 13F holders + ownership summary via yfinance."""

from __future__ import annotations

import json
import math
from datetime import date
from typing import Any

import yfinance as yf

from compass.engagement import Engagement, Task
from compass.universe import ticker_region


def _row_to_dict(row) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in row.items():
        if value is None:
            continue
        try:
            if isinstance(value, float) and math.isnan(value):
                continue
        except (TypeError, ValueError):
            pass
        if hasattr(value, "isoformat"):
            out[str(key)] = value.isoformat()
        else:
            out[str(key)] = value
    return out


def _df_to_records(df, limit: int) -> list[dict[str, Any]]:
    if df is None or df.empty:
        return []
    return [_row_to_dict(row) for _, row in df.head(limit).iterrows()]


def _summarize_major(major) -> dict[str, Any]:
    """yfinance's `major_holders` is a one-column DataFrame with category labels
    in the index and a single 'Value' column. Flatten into a dict.
    """
    if major is None or major.empty:
        return {}
    out: dict[str, Any] = {}
    try:
        for idx, row in major.iterrows():
            label = str(idx) if not isinstance(idx, tuple) else "_".join(str(i) for i in idx)
            # Single column case
            if hasattr(row, "iloc"):
                value = row.iloc[0]
            else:
                value = row
            try:
                if isinstance(value, float) and math.isnan(value):
                    continue
            except (TypeError, ValueError):
                pass
            out[label] = value
    except Exception:  # noqa: BLE001
        pass
    return out


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    params = task.params or {}
    limit = int(params.get("limit", 20))

    region = ticker_region(engagement.ticker)
    if region != "US":
        return {
            "institutional_count": 0,
            "mutual_fund_count": 0,
            "skipped_reason": (
                f"{engagement.ticker} is a {region} ticker; 13F holdings are "
                f"SEC-only and won't be available."
            ),
        }

    t = yf.Ticker(engagement.ticker)

    try:
        institutional = t.institutional_holders
    except Exception:
        institutional = None
    try:
        mutual_fund = t.mutualfund_holders
    except Exception:
        mutual_fund = None
    try:
        major = t.major_holders
    except Exception:
        major = None

    today = date.today().isoformat()
    out_dir = engagement.root / "corpus" / "ownership"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"institutional-{today}.json"

    payload: dict[str, Any] = {
        "ticker": engagement.ticker,
        "source": "yahoo (Form 13F aggregation)",
        "fetched_at": today,
        "ownership_summary": _summarize_major(major),
        "top_institutional_holders": _df_to_records(institutional, limit),
        "top_mutual_fund_holders": _df_to_records(mutual_fund, limit),
    }
    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )

    return {
        "institutional_count": len(payload["top_institutional_holders"]),
        "mutual_fund_count": len(payload["top_mutual_fund_holders"]),
        "artifacts": [engagement.relative(out_path)],
    }
