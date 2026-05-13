---
name: update-coverage-brief
description: Propagate findings from the freshly-written memo back into the coverage brief. Updates KPI `current` values, re-ranks risks if new evidence has surfaced, and adjusts catalysts. Never rewrites the thesis unless explicitly justified.
phase: maintain
runner: agent
allowed-tools: Read Write
model: claude-sonnet-4-6
---

# update-coverage-brief

## What this skill does

You are running the **maintain** phase: take the latest memo and the
latest KPI extraction, and update the coverage brief so it reflects the
current state of the world.

This is a careful, conservative update — the brief is institutional
memory. Do not invent new key questions; refine the ones already there.
Do not rewrite the thesis one-liner unless the new evidence materially
contradicts it (and if so, explain in one sentence in your reply).

## When to use

* The last task in any template flow (Setup → Ingest → Analyze →
  Compose → Maintain).
* Also useful as a standalone task when fresh evidence has landed but
  no memo is needed.

## Inputs

* `.pipeline/docs/coverage_brief.json` — the current brief
* `memos/<memo_type>/<date>.md` — the just-written memo
* `analysis/kpis/<TICKER>__kpis.json` — fresh KPI values
* Whatever artifacts the prompt names

## Output

Overwrite `.pipeline/docs/coverage_brief.json` with the updated JSON
(schema documented in `build-coverage-brief`).

Allowed updates:
* `kpis[*].current` — copy from the fresh KPI JSON
* `kpis[*].trend`   — recompute against the previous brief value when sensible
* `risks` — rerank, edit text, add up to one new risk if newly emerged
* `catalysts` — remove past-dated items, add up to one new item if mentioned in the memo
* `key_questions` — refine wording, do not add new questions

Forbidden updates without explanation:
* `thesis_one_liner`, `thesis_body` — only change if a new fact in the
  memo materially contradicts them. If you do change either, say so
  explicitly in your one-line reply.

## How to use

1. Read the current brief, the new memo, and the new KPI JSON.
2. Compose the updated brief in your head — diff in your mind against
   the current version.
3. `Write` the new JSON.
4. Reply in one sentence: what fields you updated, and a flag if you
   touched the thesis text.
