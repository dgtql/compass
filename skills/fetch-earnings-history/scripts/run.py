"""fetch-earnings-history — multi-quarter earnings trajectory via yfinance."""

from __future__ import annotations

import json
import math
from datetime import date
from typing import Any

import yfinance as yf

from compass.engagement import Engagement, Task


def _df_to_records(df) -> list[dict[str, Any]]:
    if df is None:
        return []
    try:
        if df.empty:
            return []
    except Exception:
        return []
    records: list[dict[str, Any]] = []
    for idx, row in df.iterrows():
        rec: dict[str, Any] = {}
        period_key = idx.isoformat() if hasattr(idx, "isoformat") else str(idx)
        rec["period"] = period_key
        for col, value in row.items():
            if value is None:
                continue
            try:
                if isinstance(value, float) and math.isnan(value):
                    continue
            except (TypeError, ValueError):
                pass
            rec[str(col)] = value.isoformat() if hasattr(value, "isoformat") else value
        records.append(rec)
    return records


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    t = yf.Ticker(engagement.ticker)

    earnings_history = _df_to_records(_safe(t, "earnings_history"))
    revenue_estimate = _df_to_records(_safe(t, "revenue_estimate"))
    earnings_estimate = _df_to_records(_safe(t, "earnings_estimate"))
    eps_trend = _df_to_records(_safe(t, "eps_trend"))
    recommendations = _df_to_records(_safe(t, "recommendations"))
    upgrades_downgrades = _df_to_records(_safe(t, "upgrades_downgrades"))

    today = date.today().isoformat()
    out_dir = engagement.root / "corpus" / "earnings"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"history-{today}.json"
    payload = {
        "ticker": engagement.ticker,
        "source": "yahoo",
        "fetched_at": today,
        "earnings_history": earnings_history,
        "revenue_estimates": revenue_estimate,
        "earnings_estimates": earnings_estimate,
        "eps_trend": eps_trend,
        "recommendations": recommendations,
        "upgrades_downgrades": upgrades_downgrades,
    }
    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    return {
        "history_count": len(earnings_history),
        "estimates_count": len(revenue_estimate) + len(earnings_estimate),
        "recommendations_count": len(recommendations),
        "artifacts": [engagement.relative(out_path)],
    }


def _safe(t: yf.Ticker, attr: str):
    try:
        return getattr(t, attr)
    except Exception:
        return None
