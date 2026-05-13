---
name: gate-coverage-check
description: Quality gate. Verifies that every key question in the brief has at least one supporting artifact on disk, and that the KPIs JSON has a `current` value for every KPI the brief lists. Writes `analysis/gates/coverage-check.json` with pass/fail per question.
phase: analyze
runner: deterministic
---

# gate-coverage-check

## What this skill does

Acts as a **quality gate** before composition. The Compose phase should
not start unless we can verify the engagement has enough evidence to
support the brief's questions and KPIs.

The gate is **deterministic** — no LLM call. It checks two things:

1. **Each `key_question` has an evidence artifact**: at least one
   `analysis/segments/*.md`, `corpus/news/*.json`, or
   `corpus/snapshots/yahoo/*.md` must exist that materially relates to
   the question. v1 uses a simple heuristic: every question yields a
   `pass` if any artifact exists in the analyze/ingest tree at all
   (we'll tighten this in v2 with keyword overlap or an LLM check).
2. **Each KPI has a `current` value** that isn't `<NOT_FOUND>` in the
   KPIs JSON.

The gate result is written to `analysis/gates/coverage-check.json` with
one entry per question/KPI and an overall `passed` flag.

## When to use

After the Ingest + Analyze tasks finish. Sits between `extract-kpis`
and the first `draft-memo-section`.

## Output

```json
{
  "passed": true,
  "questions": [
    {"question": "...", "supported_by": ["analysis/segments/..."], "status": "pass"}
  ],
  "kpis": [
    {"name": "...", "current": "...", "status": "pass|fail"}
  ],
  "notes": [
    "Heuristic v1: any evidence under analyze/ingest counts as support."
  ]
}
```

## Failure semantics

The gate **does not raise** when checks fail. It writes the JSON and
returns a `passed: false` flag. The dispatcher decides whether to
proceed — and in v1 we always proceed but log the failure for human
review. A future iteration may stop the pipeline on hard fails.
