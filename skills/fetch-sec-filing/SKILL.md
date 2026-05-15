---
name: fetch-sec-filing
description: Pull a specific SEC filing (10-K, 10-Q, 8-K, etc.) for a ticker into the engagement's `corpus/filings/` tree. Uses `edgartools` so the output is clean Markdown — no HTML/XBRL preprocessing needed.
phase: ingest
runner: deterministic
produces:
  category: filings
  params: [form]
  regions: [US]
  output_pattern: corpus/filings/{form}/{accession}/primary.md
---

# fetch-sec-filing

## What this skill does

Wraps `compass.ingest.edgar.EdgarSource` to fetch the most recent N
filings of a given form type for the engagement's ticker, writing both
the markdown rendering (`primary.md`) and a `metadata.json` per filing.

## When to use

Every research engagement that touches financial statements, risk
disclosures, segment data, or capital structure needs at least one
filing in the corpus. Default to fetching the latest 10-K at the start
of any pitch-memo run; add a 10-Q when quarter-level deltas matter.

## Parameters

| param  | type | default | notes |
|---|---|---|---|
| `form` | str  | `10-K`  | EDGAR form type — `10-K`, `10-Q`, `8-K`, etc. |
| `limit`| int  | `1`     | Number of most-recent filings to pull. |

## Preconditions

* `COMPASS_SEC_USER_NAME` and `COMPASS_SEC_USER_EMAIL` env vars set
  (SEC EDGAR requires identification on every request).

## Output

For each filing:

```
corpus/filings/<FORM>/<ACCESSION>/
    primary.md       # Filing.markdown() — clean prose + tables
    metadata.json    # ticker, accession, filing_date, period, source_url
```

The return value lists the absolute paths written so the dispatcher can
log them and downstream skills can find them.

## Failure modes

* **`EdgarConfigError`** — env vars missing; tell the user how to set them.
* **Empty result** — ticker has no filings of the requested form; the
  task should be marked `done` with a note rather than `error` so the
  pipeline doesn't stall on a benign absence.
