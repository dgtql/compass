---
name: web-research
description: Run a real web search on a free-form query (industry trends, competitor moves, regulatory developments) and write a structured summary into `corpus/research/<query-slug>-<date>.md`. Uses the Claude Agent SDK's WebSearch tool.
phase: ingest
runner: agent
allowed-tools: WebSearch WebFetch Write
model: claude-sonnet-4-6
max_turns: 25
needs:
  - brief
output: corpus/research/{query_slug}-{date}.md
---

# web-research

## What this skill does

You are running **open web research** for the engagement — not the
ticker-tagged news feed (`fetch-news` covers that), but a free-form
query on whatever the brief or PM cares about: a competitor's recent
launch, a regulatory development, an industry capex trend, a court
ruling.

You have two tools: **`WebSearch`** to discover relevant pages, and
**`WebFetch`** to read the most important ones in depth. Then you write
a **structured summary** as a markdown file. This is the artifact —
your conversational reply is not.

## When to use

* When the brief mentions a competitor, regulator, or industry trend
  that isn't covered by SEC filings or ticker-tagged news.
* When a thesis assumption depends on something happening at peers
  (e.g. "AVGO Tomahawk 5 ramp" for an NVDA thesis).
* When earnings commentary is happening across the sector and you want
  to see how peers are framing it.

## Inputs

* `task.params.query` — the search query (required)
* `.pipeline/docs/coverage_brief.json` — for context on what matters to
  this thesis (optional, but read it if it exists)

## Output

Write to the absolute path the prompt provides — typically
`corpus/research/<query-slug>-<YYYY-MM-DD>.md`.

The file structure:

```markdown
# Research: <verbatim query>
*Compass · web-research · <YYYY-MM-DD>*

## Summary
2–4 sentences answering the query, cited.

## Key findings
- Bullet point 1 (source: <publisher>, <date>) — URL
- ...

## Sources consulted
- [Title](URL) — Publisher · YYYY-MM-DD
```

## Non-negotiables

1. **Cite every claim.** Each bullet ends with the publisher and a URL.
   If you can't cite something, don't say it.
2. **Use WebSearch first, then WebFetch.** Don't fetch every result —
   pick the 2–4 highest-signal pages and read those in depth.
3. **Quote sparingly, paraphrase carefully.** Direct quotes longer than
   one sentence should be rare.
4. **No recommendations.** Inform, don't advise — same rule as the memo
   skills.
5. **Stop when you have enough.** 3–5 well-cited bullets beats 15
   weakly-grounded ones. Length cap: 400 words total.

## How to use

1. Read the brief (if it exists) to understand context.
2. Run `WebSearch` with the query. Skim the result titles.
3. `WebFetch` the 2–4 highest-signal URLs. Look for primary sources
   (regulator filings, company IR pages, peer 10-Ks) over secondary
   commentary.
4. Compose the summary in your head.
5. `Write` the markdown to the path the prompt provides.
6. Reply in one sentence: query, source count, path.
