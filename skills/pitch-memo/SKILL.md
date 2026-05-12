---
name: pitch-memo
description: Produce a buy-side pitch memo on a covered ticker. Use when a portfolio manager asks for an initial take on a name — typically the first written analyst output before maintenance updates or earnings reactions. Reads the ticker's primary filings (10-K minimum, plus 10-Q / 8-K when present), produces a structured Markdown memo at `data/tickers/<TICKER>/memos/pitch/<YYYY-MM-DD>.md`. Every specific claim is cited by evidence-ledger row ID. Skip this skill for ad-hoc Q&A, post-earnings updates, or sector overviews — those have their own skills.
allowed-tools: Read Write
license: MIT
metadata:
  skill-author: Compass
  output-target: data/tickers/<TICKER>/memos/pitch/<YYYY-MM-DD>.md
---

# Pitch Memo

## Overview

A pitch memo is the first written analyst output on a covered ticker. It tells the PM, in two pages or fewer, what this business is, what's happening now, and where the risks sit. It is **not** an investment recommendation; it is the briefing that lets a PM form their own view quickly. The author's job is fidelity to the source documents, not advocacy.

## When to Use This Skill

Apply when:

- The PM asks for an "initial take" on a name they haven't covered before
- A new ticker enters the watchlist and needs a baseline view before maintenance updates start
- A pitch memo doesn't yet exist for this ticker (check `data/tickers/<TICKER>/memos/pitch/`)

Don't use this skill for: post-earnings reactions (use `earnings-reaction`), recurring maintenance updates (use `maintenance-update`), sector overviews, or fielding follow-up Q&A on an existing memo (use `pm-interrogation`).

## Non-Negotiables

1. **Every specific claim cites an evidence row.** Numbers, dates, names, direct quotes, regulatory specifics, deal terms — anything a PM might verify — ends with `[ev#N]` where N is the `evidence.id` in `compass.db`. The evidence-ID mapping you'll need is provided in the prompt.
2. **No ungrounded inference.** If a claim cannot be cited, drop it or flag it `[UNGROUNDED]` so the citation-audit can strip it later. Do not extrapolate beyond the filings.
3. **No recommendations.** The memo informs; it does not advise to buy, sell, or hold. Phrasing like "the stock is attractive" or "we like this name" is forbidden. Replace with factual restatements ("management guides to first oil in H1 2026 [ev#42]").
4. **Brevity over completeness.** A PM scans the first paragraph for the thesis. Write it accordingly. Total length: 600–900 words.

## Memo Structure

Output is Markdown. The agent writes the memo via the `Write` tool to the path provided in the prompt. Required sections, in this order:

```markdown
# <Company Name> (<TICKER>) — Pitch Memo
*Compass · <YYYY-MM-DD>*

## Thesis
2–3 sentences. The single most important fact about this company, the
debate, and what would change a PM's view.

## Business
What the company does. Customers, geography, key assets. ~100–150 words.

## Recent Financials
The latest reported quarter and full year — revenue, margin, cash, debt.
Cite the figure to its evidence row. ~100 words.

## Risks
The 3–5 risks a PM should price in, ranked by severity. Each one in one
sentence, cited.

## Catalysts
Upcoming events (filings, earnings, regulatory decisions, debt
maturities) that could move the name in the next 6–12 months.

## Sources
- 10-K — accession `<NNNN-NN-NNNNNN>` filed `<YYYY-MM-DD>`
- (additional filings if read)
```

## How to Use This Skill

1. Read every document the prompt lists. EDGAR filings (`primary.md`) carry the fundamentals — business, financials, risks. Market snapshots (`snapshots/<source>/<date>.md`) carry the current price, 52-week range, analyst consensus, and recent news headlines — use these for the Catalysts and Thesis sections especially, and for any forward-looking framing. Use `Read` with `offset` and `limit` for efficient paging on large filings.
2. When the market snapshot's analyst consensus disagrees with the fundamentals (e.g., "strong_buy" target alongside a going-concern qualification), surface that disagreement explicitly in the Thesis — it's the most useful single insight a PM can carry into a meeting.
3. Build a draft of the memo in your scratch reasoning, structured per the section template above.
4. For each specific claim, identify the line range you read it from. Look up the matching `evidence.id` in the citation map provided in the prompt — the line range you read maps directly to one or more evidence rows.
5. Format the citation as `[ev#N]` at the end of the sentence carrying the claim. Multiple sources per sentence are fine: `[ev#12, ev#15]`.
6. Write the final memo to the path provided in the prompt using the `Write` tool. Do not echo the memo back as conversational text — the file is the artifact.
7. After writing, respond briefly with: the output path, the count of citations used, and any sections you had difficulty grounding.

## Common Failure Modes

- **Citing the wrong evidence row** — re-check that the row you cite actually contains the fact. Cite-first-row-that-seems-close is worse than no citation.
- **Padding to look thorough** — Length is a tax. Cut anything a PM would skim past.
- **Hedging language hiding ungrounded claims** — "Industry observers note…" is almost always uncited inference. Either find the source or remove the claim.
- **Writing recommendations** — "Bullish on the restart timeline" → "The PHMSA approval moves the restart timeline from indefinite to a 6-month window [ev#42]." Inform, don't advise.
