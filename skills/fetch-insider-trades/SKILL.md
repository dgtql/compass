---
name: fetch-insider-trades
description: Pull recent insider transactions (buys, sells, option exercises by officers and directors) into `corpus/ownership/insider-trades-<date>.json`. Sources from yfinance's insider feed (which aggregates SEC Form 4 filings).
phase: ingest
runner: deterministic
---

# fetch-insider-trades

## What this skill does

Pulls the most recent insider transactions for the engagement's ticker
— purchases, sales, option exercises, and gifts by officers, directors,
and 10%+ holders — and writes them as a structured JSON file. The
underlying data is SEC Form 4, surfaced via yfinance.

## When to use

* Pitch memos on names where insider buying/selling shapes the bear or
  bull case (small caps, founder-led companies, post-IPO names).
* Earnings reactions if there's been notable insider activity in the
  blackout window.
* Any time the brief's `risks` or `catalysts` mention insider sentiment.

## Output

```
corpus/ownership/insider-trades-<YYYY-MM-DD>.json
```

```json
{
  "ticker": "NVDA",
  "fetched_at": "2026-05-12",
  "transactions": [
    {
      "insider": "Jen-Hsun Huang",
      "title": "Chief Executive Officer",
      "transaction_type": "Sale",
      "shares": 120000,
      "value_usd": 14400000,
      "date": "2026-04-15"
    }
  ]
}
```

## Failure modes

* **yfinance returns nothing** — the ticker has no recent insider
  filings (common for small caps). Report `count: 0` and continue;
  don't error.
* **Schema drift** — yfinance occasionally renames columns. The skill
  uses defensive `.get()` access and preserves unknown columns under
  `extra`.
