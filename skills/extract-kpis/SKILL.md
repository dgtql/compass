---
name: extract-kpis
description: Pull the structured KPIs the coverage brief tracks into `analysis/kpis/<TICKER>__kpis.json`. Reads the latest filing markdown and the Yahoo snapshot; fills in `current` values for every KPI named in the brief, plus trend direction vs. the prior period when available.
phase: analyze
runner: agent
allowed-tools: Read Write
model: claude-sonnet-4-6
---

# extract-kpis

## What this skill does

You are pulling **structured KPIs** out of the engagement's evidence
(latest 10-K/10-Q sections, Yahoo snapshot) and writing them to a JSON
artifact that downstream skills can read without re-paging through
prose.

The KPI list comes from the brief's `kpis` field — those are the
metrics the PM cares about for this thesis. Your job is to find the
**current** value for each one, plus a one-period-prior value when
extractable, plus the **trend** (`up`/`down`/`flat`).

## Inputs

* `.pipeline/docs/coverage_brief.json` (REQUIRED — defines which KPIs to extract)
* `corpus/filings/10-K/<accession>/primary.md` and any `analysis/segments/*__financial-statements.md`
* `corpus/snapshots/yahoo/<date>.md` (for market-cap, price, analyst consensus when relevant)

## Output

Write the JSON to the absolute path the prompt names. Schema:

```json
{
  "ticker": "NVDA",
  "as_of": "YYYY-MM-DD",
  "kpis": [
    {
      "name": "DC revenue YoY %",
      "current": "212%",
      "prior": "165%",
      "trend": "up",
      "source": "analysis/segments/...__mdna.md",
      "note": "FY25 vs FY24, computed from segment table"
    }
  ],
  "notes": [
    "one-line caveats about extraction confidence — at most 3 bullets"
  ]
}
```

## Non-negotiables

1. **One KPI per brief entry.** If the brief lists 5 KPIs, output 5
   entries. If a value cannot be located, set `current: "<NOT_FOUND>"`
   and leave `trend: "flat"` — never fabricate.
2. **Cite the source.** `source` is the engagement-relative path you
   read the number from. Use the exact path; downstream tooling parses it.
3. **Keep notes brief.** This is structured data, not a memo.

## How to use

1. Read the brief. Extract the `kpis` list — those are your targets.
2. Read the financial-statements / MD&A segment files to find current
   and prior-period values.
3. For market-related KPIs (price, market cap), read the Yahoo snapshot.
4. Compose the JSON and write it.
5. Respond in one sentence: "Extracted N of M KPIs successfully."
