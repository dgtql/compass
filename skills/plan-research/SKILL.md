---
name: plan-research
description: Turn a PM's research ask into a per-engagement task list (`tasks.json`) grouped by phase. v1 matches asks to named templates (pitch-memo / earnings-reaction / maintenance-refresh); v2 will fall back to free-form decomposition when no template fits.
phase: setup
runner: deterministic
---

# plan-research

## What this skill does

This is the **planner**. It takes a PM ask (e.g. "write a pitch memo on NVDA")
plus the current engagement state (existing brief? prior memos? recent
filings?) and emits a task list grouped by the five phases — Setup,
Ingest, Analyze, Compose, Maintain.

The task list is saved as `.pipeline/tasks.json` and consumed by the
dispatcher (`compass.dispatcher`), which walks the tasks in dependency
order and invokes the right skill for each.

## When to use

* Bootstrapping a new engagement.
* Re-planning when the ask changes mid-engagement (e.g. PM pivots from
  pitch to earnings-reaction).
* Catching up after a long-running engagement has drifted from its
  original brief.

## How to use

Two entry points:

1. **Programmatic** (preferred for CLI): call `compass.planner.plan(engagement, template_name)`. It returns a `list[Task]` you save with `engagement.save_tasks(...)`.
2. **As a dispatched task**: include a task with `skill: plan-research`
   and `params: {template: "...", user_ask: "..."}`. The task's `run.py`
   does the same thing.

## Templates supported in v1

| template | use case | rough shape |
|---|---|---|
| `pitch-memo` | first analyst write-up on a covered name | Setup ▸ ingest 10-K/10-Q/snapshot/news ▸ parse + KPIs + gate ▸ 5 section drafts + assemble ▸ update brief |
| `earnings-reaction` | short post-earnings note | Setup ▸ ingest snapshot + news + 10-Q ▸ KPI deltas + gate ▸ 3 section drafts + assemble ▸ update brief |
| `maintenance-refresh` | quarterly update against the existing thesis | Setup ▸ ingest 10-Q + snapshot + news ▸ parse + KPI deltas + gate ▸ 3 section drafts + assemble ▸ update brief |

## Non-negotiables

1. **Tasks are small.** Each task should fit on one screen of run.log. If
   a task description spans multiple sentences of distinct work, split it.
2. **Every task names a skill.** No "TBD" or "manual". If a step has no
   skill yet, write the skill first.
3. **Every task names a phase.** Phases are the contract with the UI.
4. **Templates emit deterministic IDs.** Re-planning the same template
   for the same engagement should produce a stable set of task IDs so
   progress isn't lost when a task list is regenerated.
