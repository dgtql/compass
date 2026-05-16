---
name: survey-theme
description: Run an open web survey on a trading-idea theme — pull primary sources (filings, regulator pages, peer IR, sell-side, reputable press), synthesize key findings with citations, and identify gaps. Adapted from Dr. Claw's `inno-deep-research` for trading themes.
phase: ingest
runner: agent
allowed-tools: WebSearch WebFetch Read Write
model: claude-sonnet-4-6
max_turns: 30
needs:
  - theme
output: corpus/research/survey.md
---

# survey-theme

## What this skill does

You are conducting a **survey** for a trading-idea exploration. The PM
has handed you a theme — your job is to find what's actually being said
about it in primary sources, synthesize the picture, and surface the
gaps that downstream ideation should attack.

This is research-grade, not commentary. You have two tools: `WebSearch`
to discover relevant pages, `WebFetch` to read the highest-signal ones
in depth. Then you write a structured markdown report. **The report is
the artifact** — your conversational reply is one sentence.

## Inputs

* `.pipeline/docs/theme.json` — the structured framing of the PM's ask.
  Read it first. The `framing`, `scope`, and `questions_to_answer`
  fields are your search agenda.

## Output

Write to the absolute path the prompt provides — typically
`corpus/research/survey.md`.

Use this structure (loosely adapted from Dr. Claw's deep-research pattern):

```markdown
# Survey: <theme title>
*Compass · survey-theme · <YYYY-MM-DD>*

## Executive summary
2–4 sentences answering: where is the theme today, what's the consensus,
what's contested. Cite [1][2].

## Key findings
- **<finding 1 headline>**: <one-paragraph explanation> [1]
- **<finding 2 headline>**: <one-paragraph explanation> [2][3]
- **<finding 3 headline>**: <one-paragraph explanation> [4]
(5–8 findings total — fewer if the theme is narrow.)

## Areas of consensus
- 2–3 bullets where sources broadly agree.

## Areas of debate
- 2–3 bullets where sources disagree or signals are mixed. This is where
  trading edges hide — flag them explicitly.

## Names mentioned
- A flat list of tickers/companies that surfaced repeatedly. Each with a
  one-line "why it came up." This feeds the inventory + idea-generation
  steps.

## Sources
[1] <Publisher>, "<Title>", <YYYY-MM-DD>, <URL>
[2] <Publisher>, "<Title>", <YYYY-MM-DD>, <URL>
...

## Gaps and open questions
- 3–5 bullets: what couldn't you answer, what would change the picture if
  you had it. The ideation step uses these as raw material.
```

## Non-negotiables

1. **Cite every claim.** Every key-finding bullet ends with `[N]` linking
   to the Sources list. No bullet without a citation.
2. **Primary sources first.** Regulator filings, company IR pages,
   government statistics, peer 10-Ks, central-bank releases. Sell-side
   notes and reputable financial press are fine as secondary. Random
   blogs and tweets are not OK as the sole source of a finding.
3. **Search broadly, fetch narrowly.** Use `WebSearch` for breadth.
   Then `WebFetch` the 4–8 highest-signal URLs and read them in depth.
   Don't fetch every result.
4. **No recommendations.** This is research, not a memo. Don't say
   "buy XYZ." Inform, don't advise.
5. **Quote sparingly.** Direct quotes longer than one sentence should be
   rare. Paraphrase carefully and cite.
6. **Stop when you have enough.** A tight 5-finding survey beats a sprawling
   15-finding one. Length cap: ~900 words for the body (excluding sources).
7. **Names mentioned must be tradable.** Tickers + listed exchanges. If a
   company is private, note it but don't include in the tradable-names
   bullet list.

## How to use

1. Read `.pipeline/docs/theme.json` for the framing.
2. Run `WebSearch` on each of the `questions_to_answer` — typically 3–5
   distinct searches. Skim titles + snippets.
3. Pick the 4–8 highest-signal URLs and `WebFetch` them.
4. Synthesize into the structured report above.
5. `Write` the markdown to the output path the prompt provides.
6. Reply in one sentence: source count, finding count, path.
