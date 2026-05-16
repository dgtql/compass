---
name: inventory-existing-ideas
description: Scan every materialized engagement on disk and emit a flat JSON index of all memos the pod has already produced. The ideation skill cross-references this against the survey to surface "ideas we already have" alongside new ones.
phase: analyze
runner: deterministic
output: analysis/existing-memos.json
---

# inventory-existing-ideas

## What this skill does

Walks `data/engagements/<analyst>/<TICKER>/memos/**/*.md` across the
whole pod and writes a flat machine-readable index to
`analysis/existing-memos.json` under the current (idea-exploration)
engagement.

This is a **deterministic** skill — no LLM, no web tools. It's the cheap
inventory step that gives the ideation agent a pointer to every existing
piece of work the pod has, so it can quote/build on prior ideas instead
of pretending the corpus is empty.

## What it produces

```json
{
  "scanned_at": "2026-05-15T...",
  "engagements_scanned": 47,
  "memo_count": 23,
  "memos": [
    {
      "analyst": "maria-chen",
      "ticker": "NVDA",
      "memo_type": "pitch",
      "path": "data/engagements/maria-chen/NVDA/memos/pitch/2026-04-12T...md",
      "name": "2026-04-12T14-22-08.md",
      "modified_at": 1715520000.0,
      "headline": "Pitch — NVDA: Hyperscaler capex is the moat",
      "first_paragraph": "Two-sentence excerpt for at-a-glance scanning..."
    }
  ]
}
```

## Why this is deterministic, not agent-driven

The relevance filtering ("is this memo about the current theme?") is the
ideation agent's job — it has the survey in context and can read whichever
memos look promising. The inventory just answers the much simpler
question "what memos exist at all?" — a file-system walk, sub-second.
