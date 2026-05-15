---
name: fetch-press-releases
description: Pull recent 8-K filings (material events — earnings releases, M&A, debt, leadership changes, regulatory actions) into `corpus/filings/8-K/<accession>/`. Uses edgartools for clean Markdown rendering and a metadata index.
phase: ingest
runner: deterministic
produces:
  category: press-releases
  regions: [US]
  output_pattern: corpus/filings/8-K/{accession}/primary.md
---

# fetch-press-releases

## What this skill does

Fetches the engagement ticker's recent 8-K filings — the SEC form for
material events. Each 8-K lands as clean Markdown plus a
`metadata.json`, identical layout to `fetch-sec-filing` but specialized
for 8-Ks and capable of pulling several at once.

8-Ks are the catalyst tape: earnings releases, mergers, executive
changes, debt issuance, regulatory inquiries. They move stocks more
often than 10-Ks.

## When to use

* Pitch memos — the Catalysts section benefits from a recent-events
  scan; ground new commentary in the actual 8-K text.
* Earnings reactions — the earnings release itself is filed as an 8-K
  (Item 2.02).
* Maintenance refreshes — capture anything material that's happened
  since the last update.

## Parameters

| param | type | default | notes |
|---|---|---|---|
| `limit` | int | `5` | Number of most-recent 8-Ks to pull. |

## Preconditions

Same as `fetch-sec-filing` — SEC identification env vars must be set.

## Output

```
corpus/filings/8-K/<ACCESSION>/
  primary.md
  metadata.json
```

Plus a roll-up index at `corpus/filings/8-K/index-<date>.json` listing
all 8-Ks fetched in this run.
