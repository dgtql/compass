---
name: assemble-memo
description: Stitch the section drafts (from `draft-memo-section`) into the final memo at `memos/<memo_type>/<date>.md`. Adds the header, lists sources, and polishes transitions between sections.
phase: compose
runner: agent
allowed-tools: Read Write
model: claude-sonnet-4-6
max_turns: 20
needs:
  - brief
  - sections
output: memos/{memo_type}/{date}.md
---

# assemble-memo

## What this skill does

You are **assembling** the final memo. The hard work — finding facts,
choosing words for each section — was already done by
`draft-memo-section`. Your job:

1. Read the drafted section files in the order given.
2. Concatenate them under a top-level header and a date line.
3. Smooth transitions between sections (one connective sentence at most,
   only when the abrupt cut is jarring).
4. Append a **Sources** section: a flat list of the artifact paths
   that the section drafts cite, deduplicated.

## When to use

After every `draft-memo-section` task in the engagement is `done`.

## Inputs

* `.pipeline/docs/coverage_brief.json` — for company name, ticker.
* `analysis/sections/<TICKER>__<memo_type>__<section_slug>.md` — one per
  section. The order is provided in `task.params.section_order`.

## Output

Write the assembled memo to the absolute path the prompt provides —
typically `memos/<memo_type>/<YYYY-MM-DD>.md`.

The header is:

```markdown
# <Company name> (<TICKER>) — <memo type, title case>
*Compass · <YYYY-MM-DD>*

```

## Non-negotiables

1. **Faithful concatenation.** Do not rewrite the section bodies. You
   may add at most one transition sentence between two sections, and
   only when needed.
2. **Sources list at the end.** Deduplicate paths. Use the engagement-
   relative form (`analysis/segments/...`, not absolute).
3. **No recommendations**, same as the section drafts.

## How to use

1. Read each section file in the order given by the prompt.
2. Concatenate them with a single blank line between sections. Smooth
   only when needed.
3. Grep your concatenated text for `(source: ...)` parentheticals;
   extract the paths to build the Sources list.
4. `Write` the assembled memo.
5. Respond in one sentence: word count, section count, source count.
