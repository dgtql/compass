---
name: generate-trading-ideas
description: Synthesize a trading-idea memo for the PM. Reads the theme frame, the survey, and the inventory of existing pod memos, then writes a structured memo with two sections — "Existing pod ideas relevant to this theme" and "New trading ideas" — each with rationale and risks. Adapted from Dr. Claw's idea-generation pattern for trading.
phase: compose
runner: agent
allowed-tools: Read Write
model: claude-sonnet-4-6
max_turns: 25
needs:
  - theme
  - survey
  - existing-memos
output: memos/ideas/{date}.md
---

# generate-trading-ideas

## What this skill does

You are producing the **final deliverable** of an idea-exploration: a
trading-idea memo for the PM. You have three inputs:

1. `.pipeline/docs/theme.json` — the PM's framing.
2. `corpus/research/survey.md` — what the open web is saying about it.
3. `analysis/existing-memos.json` — every memo already on disk across
   the pod (so you can surface ideas the team already has, not just net-new
   ones).

This is **not** a pitch memo on a single name. It's a "here's what I'd
look at" idea-flow document — closer to a sell-side morning starter than
a full thesis.

## Output shape

Write to the absolute path the prompt provides — typically
`memos/ideas/<YYYY-MM-DDTHH-MM-SS>.md`.

```markdown
# Trading ideas — <theme title>
*Compass · generate-trading-ideas · <YYYY-MM-DD>*

## Theme framing
(2–3 sentences distilled from theme.json's `framing`. State the question
the PM is asking and the time horizon.)

## What the survey says
(3–5 bullets summarizing the survey's executive summary + key findings.
Cite the survey path: `corpus/research/survey.md`. Don't repeat its
detail — point the PM to it for depth.)

## Existing pod ideas relevant to this theme
(0–N bullets. Walk `existing-memos.json`. For each memo that's actually
relevant to the theme, write a bullet with:
- ticker, analyst, memo_type, date
- 1-sentence "what the prior memo said" — read the memo with the Read
  tool when you need to ground this
- path to the memo so the PM can open it
If nothing in the pod is relevant, say so explicitly — "Nothing in the
pod corpus touches this theme yet" — and move on.)

## New trading ideas
(3–6 ideas. Each one has:
- **Headline** — a one-line punchy framing (e.g.
  "Long AVGO into the AI-networking ASIC cycle; short LRCX as a
  capex-overhang hedge").
- **Setup** — 2–3 sentences on what the idea is and how it relates to
  the theme.
- **Why now** — 1–2 sentences citing the survey finding that makes the
  trade timely.
- **What would confirm / invalidate** — 1–2 sentences each on the
  signals that would prove the idea right or wrong. The PM lives or
  dies on these.
- **Risks** — 1–2 bullets.)

## Watchlist
(A compact bulleted list of every ticker that came up across the survey
and the new ideas. The PM uses this to seed a watchlist. Format: ticker
— one-phrase reason it's on the list.)

## What's missing
(2–3 bullets on what the next research step would be — open questions
the survey couldn't answer, data we'd need to fetch, names worth deep-
diving. This points the PM at the next move.)
```

## How to generate good ideas (the dr-claw / trading hybrid)

Use these moves to **diverge** before converging on 3–6 final ideas.
You don't have to walk every move — pick whichever ones light up given
the theme.

1. **Direct beneficiary / direct loser.** If the survey says X is
   happening, who is mechanically helped or hurt? (Most obvious move,
   often the right first idea.)
2. **One-step-removed.** Who's the supplier-to-the-beneficiary, or the
   customer-of-the-loser? Often where the better risk/reward hides.
3. **Pair trade.** Long the strongest exposure, short the weakest in
   the same theme bucket. Hedges the macro and isolates the alpha.
4. **Adapt to a different time horizon.** If the consensus play is
   the 6-month catalyst, what's the 18-month structural angle? Or the
   1-month tactical mean-reversion?
5. **Reverse — the survey's contested view.** When the "areas of debate"
   section flags real disagreement, pick the contrarian side and frame
   it as the idea.
6. **Substitute — same setup, different instrument.** Same exposure via
   credit, options, ADR, sector ETF — sometimes the cleaner expression.
7. **Combine with existing pod work.** If the inventory shows an analyst
   already has a pitch on a relevant name, the idea is "lean into that
   thesis when the theme catalyst fires" — not net-new.

Pick the 3–6 strongest. Each should be a **specific trade** (long X,
short Y, or "watch X for entry below $Z") — not "look at semis."

## Non-negotiables

1. **Cite every claim.** Every survey-derived statement points to the
   survey path or a finding number. Every pod-memo reference points to
   the memo path. The PM will click these.
2. **Specific instruments only.** "Long AVGO" or "Long the SOXX-XSD pair"
   — not "look at semiconductors." If the idea isn't expressible as a
   trade, drop it.
3. **No hype.** Words like "explosive," "massive," "no-brainer" are
   tells of a thin idea. Use them and the PM stops reading.
4. **Don't bury existing pod work.** If the inventory shows the pod has
   prior work that's *actually relevant*, the "Existing pod ideas"
   section comes first for a reason — the PM wants to know what they
   already have before you propose new things.
5. **Risks are required.** An idea without a risks bullet doesn't ship.
6. **Length cap.** 1,000–1,400 words. Tight beats thorough.

## How to run

1. `Read` `.pipeline/docs/theme.json`.
2. `Read` `corpus/research/survey.md`.
3. `Read` `analysis/existing-memos.json`.
4. For pod memos that look topically relevant, `Read` them in full
   before quoting (don't make up what a prior analyst said).
5. Draft in your head. Apply 2–4 of the "moves" above to diverge.
6. Converge to 3–6 ideas.
7. `Write` the memo to the output path.
8. Reply with one sentence: idea count, pod-ideas-referenced count, path.
