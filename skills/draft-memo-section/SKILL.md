---
name: draft-memo-section
description: Draft one named section of an analyst memo. Reads the brief, the KPIs, the parsed filing sections, and any news — produces a tightly-scoped markdown file under `analysis/sections/` that the `assemble-memo` skill later stitches into the final memo.
phase: compose
runner: agent
allowed-tools: Read Write
model: claude-sonnet-4-6
max_turns: 20
needs:
  - brief
  - segments
  - kpis
  - gates
  - snapshots
  - news
output: analysis/sections/{ticker}__{memo_type}__{section_slug}.md
---

# draft-memo-section

## What this skill does

You are drafting **one section** of an analyst memo — not the whole memo.
The section is named in the task params (`section_slug` + `section_label`).
The memo type (pitch / earnings-reaction / maintenance) is also a param;
use it to choose the voice and emphasis appropriate to that document.

The drafted section is written as its own markdown file. The
`assemble-memo` skill stitches all section files into the final memo.

## When to use

After the Ingest + Analyze phases finish and `gate-coverage-check` has
run. One task per section — the dispatcher fans them out.

## Inputs

* `.pipeline/docs/coverage_brief.json` — the structured thesis
* `analysis/kpis/<TICKER>__kpis.json` — current values for every KPI
* `analysis/gates/coverage-check.json` — what passed / failed
* `analysis/segments/*.md` — Business / Risks / MD&A / Financials
* `corpus/snapshots/yahoo/<date>.md` — market context
* `corpus/news/<date>.json` — recent news

Read selectively. You don't need every artifact for every section.

## Output

Write to the absolute path the prompt provides — typically
`analysis/sections/<TICKER>__<memo_type>__<section_slug>.md`.

The section starts with a level-2 heading: `## <section_label>`.

## Section voice cheat sheet

| section_slug          | what it does | length |
|---|---|---|
| `thesis`              | 2–3 sentences. The single most important fact, the debate, what would change a view. | 80–140 words |
| `business`            | What the company does, customers, geography, key assets. | 100–150 words |
| `recent-financials`   | The latest reported period — revenue, margin, cash, debt. Numbers from KPIs JSON. | 80–120 words |
| `risks`               | 3–5 ranked risks, one sentence each. | 80–120 words |
| `catalysts`           | Upcoming events that move the name in the next 6–12 months. | 60–100 words |
| `headline`            | Earnings-reaction: 1 short paragraph. Beat/miss, headline takeaway, market reaction. | 40–80 words |
| `vs-thesis`           | Earnings-reaction: what the print means for the brief's thesis. | 80–120 words |
| `next-steps`          | Earnings-reaction: what we're watching next quarter. | 40–80 words |
| `what-changed`        | Maintenance: what's different since the last brief update. | 80–120 words |
| `thesis-check`        | Maintenance: which brief assumptions still hold, which need revisiting. | 80–120 words |
| `watch-list`          | Maintenance: catalysts on the radar. | 40–80 words |
| `ownership`           | Deep-dive: top institutional / insider activity summary; flag concentration risk. | 80–120 words |
| `industry-context`    | Deep-dive: sector / competitor framing from the web-research artifact and 8-Ks. | 100–150 words |

## Non-negotiables

1. **Ground every specific claim.** Numbers, dates, names — followed by a
   parenthetical citation: `(source: analysis/segments/...)` or
   `(source: corpus/snapshots/yahoo/2026-05-12.md)`. The path is enough;
   line ranges are nice-to-have, not required.
2. **No recommendations.** Inform, don't advise. "The market reacted
   negatively" is fine; "The stock looks attractive" is not.
3. **Brevity bands above are real.** Cut anything a PM would skim past.
4. **Don't restate the section heading.** Start the body directly.

## How to use

1. Read the brief, the KPIs JSON, and the gate result.
2. Pick the 2–4 evidence files most relevant to *your section*. Read
   them with `offset`/`limit` where helpful.
3. Draft the section in your head.
4. `Write` to the path the prompt gives.
5. Reply in one sentence with the word count and the path you wrote.
