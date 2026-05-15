---
name: fetch-institutional-holdings
description: Pull top institutional + mutual-fund holders and concentration metrics into `corpus/ownership/institutional-<date>.json`. Sources from yfinance, which aggregates SEC Form 13F filings.
phase: ingest
runner: deterministic
produces:
  category: holdings
  regions: [US]
  output_pattern: corpus/ownership/institutional-{date}.json
---

# fetch-institutional-holdings

## What this skill does

Captures who owns the engagement's ticker at scale — top institutional
holders, top mutual-fund holders, and the aggregate insider / float
breakdown. The underlying data is SEC Form 13F filings, surfaced via
yfinance.

## When to use

* Pitch memos — useful context on how concentrated ownership is and
  whether known specialists are involved.
* Maintenance refreshes — pickup signal when a major holder enters or
  exits.
* Any thesis where ownership shifts matter (small caps, special
  situations, activist setups).

## Output

```
corpus/ownership/institutional-<YYYY-MM-DD>.json
```

```json
{
  "ticker": "NVDA",
  "fetched_at": "2026-05-12",
  "ownership_summary": {
    "insider_pct": "0.6%",
    "institutional_pct": "65.8%",
    "...": "..."
  },
  "top_institutional_holders": [
    {"holder": "Vanguard Group Inc.", "shares": 1_400_000_000, "value_usd": ...}
  ],
  "top_mutual_fund_holders": [...]
}
```

## Failure modes

* **No institutional data** — yfinance returns empty frames for very
  small caps; report `count: 0`.
* **Schema drift** — yfinance column names change occasionally. Skill
  uses defensive access.
