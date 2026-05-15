---
name: fetch-earnings-history
description: Multi-year earnings history (revenue, EPS actual vs. estimate, surprise %), forward revenue estimates, and analyst recommendation changes into `corpus/earnings/history-<date>.json`. Sources from yfinance.
phase: ingest
runner: deterministic
produces:
  category: earnings
  output_pattern: corpus/earnings/history-{date}.json
---

# fetch-earnings-history

## What this skill does

Captures the **earnings trajectory** of the engagement's ticker —
historical EPS prints with beat/miss deltas, revenue trend, the
consensus forward estimates, and any analyst recommendation changes.

This is the table a PM scans before forming a view on management
credibility (do they consistently beat/miss?) and on consensus
positioning (is the bar low or stretched?).

## When to use

* Pitch memos — the "Recent Financials" section comes alive with
  multi-quarter context, not just one snapshot.
* Earnings reactions — every time, to anchor whether the print
  continues or breaks the historical pattern.
* Any thesis that depends on management's execution credibility.

## Output

```
corpus/earnings/history-<YYYY-MM-DD>.json
```

```json
{
  "ticker": "NVDA",
  "fetched_at": "2026-05-12",
  "earnings_history": [
    {"period": "2025-10-26", "eps_estimate": 0.71, "eps_actual": 0.81, "surprise_pct": 14.0, "revenue": ...}
  ],
  "revenue_estimates": [...],
  "earnings_estimates": [...],
  "recommendations": [
    {"period": "2026-04", "strong_buy": 18, "buy": 22, "hold": 4, "sell": 0, "strong_sell": 0}
  ]
}
```

## Failure modes

* **Stale or missing estimates** — common for less-covered names; the
  fields are emitted but may be empty.
