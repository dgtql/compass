---
name: fetch-wikipedia-overview
description: Pull the engagement ticker's company-overview from English Wikipedia — business description, history, segments, key facts — into `corpus/overview/wikipedia-<date>.md`. Useful for any name (US or EU), and the primary substantive source when SEC filings aren't available (EU listings).
phase: ingest
runner: deterministic
produces:
  category: overview
  output_pattern: corpus/overview/wikipedia-{date}.md
---

# fetch-wikipedia-overview

## What this skill does

Resolves the engagement ticker against the universe seed to recover the
canonical company name, hits the English Wikipedia action API for that
name's plain-text extract, and writes the result as Markdown under the
engagement's `corpus/overview/` directory.

This is the cheapest path to a substantive business narrative — without
it, EU-listed tickers (where Compass has no SEC filings) leave the
compose agent reasoning from a Yahoo snapshot alone.

## When to use

* Any pitch / earnings / deep-dive engagement that wants a written
  company narrative beyond price + headlines.
* Especially **EU-listed names**: Compass has no SEC analog for Oslo /
  London / Paris filings yet — Wikipedia fills the substance gap.
* Once-per-engagement is enough — the page changes slowly. Re-running
  on the same day overwrites the file.

## Input

Reads the universe seed to map ticker → company name. The Wikipedia
query is built from `Ticker.name` (e.g. `AKSO.OL → "Aker Solutions ASA"`).
If the ticker carries a `bloomberg_ticker`, the trailing exchange code
is stripped to reduce noise in the search.

## Output

Single Markdown file: `corpus/overview/wikipedia-<YYYY-MM-DD>.md`.

* Front matter: `ticker`, `company_name`, `source_url`, `fetched_at`,
  `wiki_chars`.
* Body: the Wikipedia plain-text extract.

If Wikipedia returns no page for the company name (rare, but happens
for very recent listings), the skill writes a short "not found" marker
file and returns `count: 0` rather than raising — the dispatcher
continues.

## Caveats

* Wikipedia content is community-edited. Treat as background context,
  not as a primary source for financials. Compose skills should still
  cite specific filings / snapshots for *numbers* — overview is for the
  *story*.
* The extract is plain text, no tables or footnotes. Sufficient for the
  agent's narrative grounding; not a replacement for the 10-K equivalents.
