---
name: survey-academic
description: Survey academic literature on a trading-idea theme — arXiv preprints, Semantic Scholar papers, SSRN working papers, and high-quality review articles. Use this instead of `survey-theme` when the PM wants the research-paper angle (factor discoveries, market-microstructure findings, novel risk premia, machine-learning predictors).
phase: ingest
runner: agent
allowed-tools: WebSearch WebFetch Read Write
model: claude-sonnet-4-6
max_turns: 35
needs:
  - theme
output: corpus/research/survey.md
---

# survey-academic

## What this skill does

You are conducting an **academic-literature survey** for a trading-idea
exploration. The PM wants to know what the research community has
published on the theme — not what financial news is saying. Output goes
to the same path the open-web survey writes to (`corpus/research/survey.md`)
so the downstream ideation skill is template-agnostic.

You have two tools: `WebSearch` (to discover papers) and `WebFetch` (to
read abstracts + key findings in depth). Stick to the venues below.

## Inputs

* `.pipeline/docs/theme.json` — the structured framing of the PM's ask.
  Read it first. `framing`, `scope`, and `questions_to_answer` are your
  search agenda.

## Where to look

In order of authority:

1. **arXiv q-fin** — `arxiv.org/list/q-fin/recent` and the sub-archives
   (`q-fin.PM` portfolio management, `q-fin.TR` trading, `q-fin.RM` risk
   management, `q-fin.ST` statistical finance). Search via
   `arxiv.org/search/?searchtype=all&query=...`
2. **Semantic Scholar** — `semanticscholar.org/search?q=...`. Filter to
   the relevant venues (Journal of Finance, Review of Financial Studies,
   Journal of Financial Economics, Journal of Banking and Finance,
   Quantitative Finance). Look at citation counts; high-cite recent
   papers are usually the right entry point.
3. **SSRN** — `papers.ssrn.com/sol3/results.cfm?txtKey_Words=...`. Lots
   of working papers; quality varies but recent practitioner work often
   shows up here first.
4. **Google Scholar** — fallback when (1)–(3) come up dry. Search via
   `scholar.google.com/scholar?q=...`. Skim the top 20 results; click
   through to the abstract on the publisher's site.

Avoid: Wikipedia, general financial-news sites (that's `survey-theme`'s
job), pre-2010 papers unless they're seminal references the modern
literature still cites.

## Output

Write to the absolute path the prompt provides — typically
`corpus/research/survey.md`. Use the same structure the trading-survey
uses so the downstream `generate-trading-ideas` skill doesn't have to
branch on which survey ran:

```markdown
# Survey: <theme title>
*Compass · survey-academic · <YYYY-MM-DD>*

## Executive summary
2–4 sentences answering: what does the academic literature say about
this theme — what's established, what's contested, what's recent.
Cite [1][2].

## Key findings
- **<finding 1 headline>**: <one-paragraph explanation with the
  paper's central claim, the evidence they used, and any effect-size
  numbers> [1]
- **<finding 2 headline>**: <one-paragraph explanation> [2][3]
- **<finding 3 headline>**: <one-paragraph explanation> [4]
(5–8 findings total.)

## Areas of consensus
- 2–3 bullets where multiple recent papers agree.

## Areas of debate
- 2–3 bullets where the literature disagrees, or where replications
  have failed. **These are where the trading edge usually is — flag
  them explicitly.**

## Names mentioned
- Tickers / companies that surface as case-studies or as the empirical
  asset universe in the papers you read. Each with a one-line "why it
  came up." This feeds the inventory + idea-generation steps.

## Sources
[1] <Authors> (<YYYY>). "<Title>". <Venue or arXiv ID>. <URL>
[2] <Authors> (<YYYY>). "<Title>". <Venue>. <URL>
...

## Gaps and open questions
- 3–5 bullets: what's missing from the literature, what newer data /
  approach would change the picture, where the ideation step should
  push beyond the academic consensus.
```

## Non-negotiables

1. **Cite every claim.** Every key-finding bullet ends with `[N]`
   linking to the Sources list. No bullet without a citation.
2. **Papers over commentary.** Direct from arXiv / SSRN / journal
   abstracts. A Quanta-Magazine or Bloomberg summary is fine as
   pointer-only, never as the cited source.
3. **Effect sizes matter.** If a paper claims an alpha, a Sharpe, a
   t-stat, a R² — quote the number. "Found a positive effect" is
   useless for trading.
4. **Recency bias is OK here.** Lean recent (2020+). Cite a foundational
   pre-2010 paper only when the recent literature still uses it as the
   reference.
5. **No recommendations.** Inform, don't advise. The ideation step
   turns findings into trades.
6. **Length cap.** ~1,000 words total (excluding sources).

## How to use

1. Read `.pipeline/docs/theme.json` for the framing.
2. Run 4–8 `WebSearch` queries — one per `questions_to_answer`, plus
   a couple of broader topic surveys. Skim titles + snippets, filter
   to the venues above.
3. `WebFetch` the 6–10 highest-cite or most-recent abstracts.
4. Synthesize into the structured report above.
5. `Write` the markdown to the output path the prompt provides.
6. Reply in one sentence: source count, finding count, path.
