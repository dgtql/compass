---
name: fetch-market-snapshot
description: Pull today's Yahoo Finance snapshot for the engagement's ticker — price, 52-week range, analyst consensus, recent financials, top news headlines — into `corpus/snapshots/yahoo/<date>.md`.
phase: ingest
runner: deterministic
---

# fetch-market-snapshot

## What this skill does

Wraps `compass.ingest.yahoo.YahooSource` to render a Markdown snapshot of
the ticker's current market state. One file per day under the
engagement's `corpus/snapshots/yahoo/` directory; re-running on the same
day overwrites today's file.

## When to use

Every engagement, on the first Ingest pass. The snapshot is how memos
acquire current price, analyst targets, recent news, and a quick read on
the income statement / balance sheet without re-parsing 10-Ks.

## Parameters

| param            | type | default | notes |
|---|---|---|---|
| `history_period` | str  | `1y`    | Lookback for the price series (e.g. `6mo`, `1y`, `2y`). |

## Output

```
corpus/snapshots/yahoo/<YYYY-MM-DD>.md
```

A single Markdown file with sections: Price · Identity · Analyst
consensus · Income statement · Balance sheet · Recent news.

## Failure modes

* **`yfinance` returns empty info** — usually means the ticker is wrong
  or temporarily delisted. Surface the empty result instead of erroring.
