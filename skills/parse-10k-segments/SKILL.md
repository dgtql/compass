---
name: parse-10k-segments
description: Split a 10-K (or 10-Q) markdown into structured sections — Business, Risk Factors, MD&A, Financial Statements — and write each as its own artifact under `analysis/segments/`. Heuristic-based, no LLM call.
phase: ingest
runner: deterministic
---

# parse-10k-segments

## What this skill does

Reads the most recent filing of the requested form for the engagement
ticker and splits it into the canonical sections SEC filings carry:

* **Business** — Item 1 (10-K) / Item 1 (10-Q skip)
* **Risk Factors** — Item 1A
* **Management's Discussion** (MD&A) — Item 7 / Item 2
* **Financial Statements** — Item 8 / Item 1

The splitter is heuristic: it walks Markdown headings and matches them
against a known label set. When a heading isn't found, the section is
omitted from the output (downstream skills should not assume every
section exists).

## When to use

After `fetch-sec-filing` has landed a 10-K or 10-Q. Splitting up front
means the Analyze-phase skills (extract-kpis, draft-memo-section) don't
have to re-page through a 500KB markdown blob.

## Parameters

| param  | type | default | notes |
|---|---|---|---|
| `form` | str  | `10-K`  | Which form to look up. Picks the most-recent. |

## Output

```
analysis/segments/<TICKER>__<FORM>__<accession>__<section>.md
```

One file per detected section. The dispatcher's return value lists the
relative paths written.

## Failure modes

* **No filings yet** — task should report `count: 0` and not raise.
* **No matching headings** — common with older / poorly formatted
  filings; report which sections were missed but produce whatever could
  be split.
