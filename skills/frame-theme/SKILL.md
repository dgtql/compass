---
name: frame-theme
description: Capture the PM's free-form trading-idea theme and write it as a structured `.pipeline/docs/theme.json`. Lets every downstream task (survey, inventory, ideation) work off a single canonical frame.
phase: setup
runner: agent
allowed-tools: Write
model: claude-sonnet-4-6
max_turns: 6
output: .pipeline/docs/theme.json
---

# frame-theme

## What this skill does

You are framing a **trading-idea exploration** — turning the PM's free-form
ask ("what's going on with semi-cap-ex slowdown?", "ideas around obesity
drug fade", "pair trades in offshore E&P") into a structured `theme.json`
that the downstream survey, inventory, and idea-generation skills will all
read.

This is a quick framing step. **No web tools.** No deep thinking. Just
parse what the PM said into the right shape and write it.

## Inputs

* `task.params.theme` — the PM's raw message text (the framing prompt
  they typed in the chat). Always present.
* `task.params.theme_slug` — a normalized slug (e.g. `SEMI-CAPEX-SLOWDOWN`)
  used as the engagement key. Always present.

## Output

Write to the absolute path the prompt provides — typically
`.pipeline/docs/theme.json`. Schema:

```json
{
  "theme_slug": "SEMI-CAPEX-SLOWDOWN",
  "title": "Short human-readable headline (≤80 chars)",
  "raw_prompt": "the verbatim PM message",
  "framing": "1–2 sentences capturing what the PM actually wants to explore",
  "scope": {
    "sectors": ["semiconductors", "semi-cap"],
    "geographies": ["US", "global"],
    "instruments": ["equities"],
    "time_horizon": "6–18 months"
  },
  "out_of_scope": [
    "fundamental write-ups on a single name (those belong in a pitch memo)",
    "macro-only takes with no equity instrument"
  ],
  "questions_to_answer": [
    "Which subsegments are most exposed to a capex slowdown?",
    "What signals would confirm or invalidate the thesis?",
    "Which names are already in our pod's coverage?"
  ]
}
```

Use sensible defaults when the PM was vague (most asks will be). Don't
ask follow-up questions — this skill never has a back-and-forth; the
downstream survey/inventory/ideation tasks do the real work.

## Non-negotiables

1. **One file written, one short reply.** Write `theme.json`, then reply
   with a single sentence: the title + the 3 questions you'll explore.
2. **Verbatim raw_prompt.** Don't paraphrase the PM's framing into the
   `raw_prompt` field — it should be byte-for-byte what they typed.
3. **Keep `framing` short.** 1–2 sentences. If you can't compress the
   theme into two sentences you don't understand it well enough yet.
4. **Sensible defaults, not silence.** If the PM said "ideas around X",
   default to: equities, global, 6–18 month horizon, 3 broad questions.
   The PM can refine in chat after seeing the survey.

## How to run

1. Read `task.params.theme` and `task.params.theme_slug`.
2. Draft the JSON in your head (or on a scratch line).
3. `Write` it to the output path the prompt gives you.
4. Reply with one sentence.
