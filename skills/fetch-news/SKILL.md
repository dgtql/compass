---
name: fetch-news
description: Pull recent ticker-tagged news headlines into `corpus/news/<date>.json`. v1 uses Yahoo Finance's news feed; v2 will add a real web-search provider (Brave / Tavily) when the engagement needs queries beyond the ticker tag.
phase: ingest
runner: deterministic
---

# fetch-news

## What this skill does

Pulls the most-recent N news items tagged to the engagement's ticker and
writes them as a structured JSON file. Each item has `title`, `link`,
`published`, and `publisher`.

## When to use

* Any time the memo needs to discuss recent events, catalysts, or
  controversies that move faster than 10-K filings.
* Earnings reactions — every time.
* Pitch memos — yes; the catalysts and risks sections lean heavily on
  recent news framing.
* Maintenance refreshes — yes, to surface anything new since the last
  brief update.

## Parameters

| param   | type | default | notes |
|---|---|---|---|
| `limit` | int  | `10`    | Max number of news items to include. |

## Output

```
corpus/news/<YYYY-MM-DD>.json
```

```json
{
  "ticker": "NVDA",
  "fetched_at": "2026-05-12T...",
  "items": [
    {"title": "...", "link": "...", "published": "...", "publisher": "..."}
  ]
}
```

## v2 roadmap

This skill is the natural seam for general web search. When the planner
needs to research a topic broader than ticker-tagged news (e.g. "what are
analysts saying about AVGO Tomahawk 5 ramp?"), a future iteration will
add a `query` parameter and route through a real search provider.
