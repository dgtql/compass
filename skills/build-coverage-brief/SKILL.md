---
name: build-coverage-brief
description: Author or refresh `.pipeline/docs/coverage_brief.json` — the structured thesis on a covered ticker (one-liner, body, key questions, KPIs, risks, catalysts). Reads any existing brief and any artifacts already in the engagement; never destroys human edits.
phase: setup
runner: agent
allowed-tools: Read Write
model: claude-sonnet-4-6
max_turns: 20
needs:
  - brief
  - snapshots
  - news
  - filings
  - segments
output: .pipeline/docs/coverage_brief.json
---

# build-coverage-brief

## What this skill does

You are authoring the **coverage brief**, the structured thesis document
that anchors every downstream task. The brief is the contract between
the PM and the engagement: it captures the thesis in one line and one
paragraph, the open questions, the KPIs being tracked, the risks, and
the catalysts on the horizon.

The brief is JSON, not prose, because every downstream skill (extract-kpis,
gate-coverage-check, draft-memo-section, update-coverage-brief) reads
specific fields out of it.

## When to use

* **Bootstrapping** — first run for a ticker. Produce a sensible
  starting brief from whatever is on disk (snapshot, filings) so
  Analyze-phase skills have a frame.
* **Refreshing** — re-run after new evidence has landed. Update the
  brief incrementally; do **not** wipe out human-edited fields silently.

## Inputs you can read

* The current brief if it exists: `.pipeline/docs/coverage_brief.json`
* Any filings under `corpus/filings/...`
* Any snapshots under `corpus/snapshots/yahoo/...`
* Any news under `corpus/news/...`
* Any sections under `analysis/segments/...`

Use the `Read` tool. Paths are absolute when listed in the prompt.

## Output schema (write with the `Write` tool)

```json
{
  "ticker": "NVDA",
  "thesis_one_liner": "<= 140 chars — the single most important fact",
  "thesis_body":      "<= 600 chars — what the business does, the debate, what would change a view",
  "key_questions": [
    "5–7 open questions whose answers move the thesis"
  ],
  "kpis": [
    {"name": "<metric>", "target": "<target value>", "current": "<latest>", "trend": "up|down|flat"}
  ],
  "risks": [
    {"rank": 1, "risk": "<one sentence>", "severity": "high|medium|low"}
  ],
  "catalysts": [
    {"date": "YYYY-MM-DD or YYYY-Qn", "description": "<event>", "impact": "high|medium|low"}
  ],
  "start_stage": "setup|ingest|analyze|compose|maintain",
  "mode": "idea|plan"
}
```

`updated_at` is added automatically — don't set it yourself.

## Non-negotiables

1. **Ground every claim in evidence on disk.** If you cannot find
   support for a thesis bullet, mark the relevant field with
   `"<NEEDS_EVIDENCE>"` rather than inventing a number.
2. **No recommendations.** No "buy", "sell", "we like". Inform, don't advise.
3. **Refresh, don't overwrite.** When refreshing, keep `thesis_one_liner`
   and `thesis_body` unless the new evidence materially changes the
   thesis — explain the change in one line of stderr ("say") output.
4. **Brevity.** This is a JSON document, not an essay. Limits are real.

## How to use

1. Read the current brief (if any) and the most relevant artifact paths
   the prompt lists. Skim, don't deep-read.
2. Compose the JSON in your head.
3. Write the JSON to `.pipeline/docs/coverage_brief.json` using `Write`.
4. Respond in two sentences: "Wrote brief with N key questions, M
   KPIs, P risks. Notable updates: …" — that's all.
