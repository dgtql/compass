# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Compass

An AI analyst team for portfolio managers. The PM "hires" analysts (or persona packs like Buffett / Munger / Dalio), each one runs research **engagements** against tickers, producing pitch memos, earnings reactions, and maintenance updates grounded in primary sources.

The README is out of date — see `docs/design/README.md` for the authoritative design. The project went through a major rewrite in slice 18 (see `docs/slice-18-overnight.md`): the old `agent.py` triad (ask/summarize/research) and the SQLite evidence ledger are gone, replaced by a skills + planner + dispatcher architecture. The current CLI surface is `compass plan / run / status / skills / templates / engagements / serve / chat / ask`.

## Common commands

```powershell
# Install (editable + dev extras)
pip install -e ".[dev]"

# CLI entry: `compass` (alias for `python -m compass.cli`)
compass templates              # list planner templates
compass skills                 # list discovered skills
compass plan NVDA pitch-memo   # stamp out .pipeline/tasks.json for an engagement
compass run NVDA pitch-memo    # plan + dispatch tasks end-to-end
compass run NVDA --phase compose          # only run one phase
compass run NVDA --only ingest-news,ingest-snapshot
compass status NVDA            # show brief + per-task status
compass engagements            # list materialized engagements

# Web (FastAPI + React)
compass serve --port 8001      # backend at http://127.0.0.1:8001, serves built React from compass/static/
cd web; npm install; npm run build   # rebuild the frontend bundle into compass/static/

# Tests (pytest-asyncio auto mode)
pytest tests/
pytest tests/test_dispatcher.py
pytest tests/test_dispatcher.py::test_order_respects_dependencies

# Smoke checks against live services (need creds — usually skipped)
pytest tests/test_edgar_smoke.py tests/test_yahoo_smoke.py tests/test_buffett_e2e.py
```

Auth is **OAuth-only**: install Claude Code (`npm install -g @anthropic-ai/claude-code`), run `claude /login` once, and the SDK + `compass.llm` pick up `~/.claude/.credentials.json` automatically. `ANTHROPIC_API_KEY` is intentionally not read — `.env.example` documents why. SEC EDGAR calls additionally require `COMPASS_SEC_USER_NAME` and `COMPASS_SEC_USER_EMAIL` env vars (SEC's user-agent requirement).

## Architecture (the big picture)

### Planner → Dispatcher → Skills

```
PM ask ─► planner ─► tasks.json ─► dispatcher ─► loads SKILL.md ─► writes artifact ─► updates task status
```

Three pieces, each small and orthogonal:

1. **`compass.planner`** — template-driven. Each named template (`pitch-memo`, `earnings-reaction`, `maintenance-refresh`) returns `list[Task]`. The compose step's `needs:` frontmatter drives **auto-ingest derivation**: the planner walks `needs:`, looks up each category in the data-source registry, and stamps out the right ingest tasks. Free-form agent planning is a v2 fallback.
2. **`compass.dispatcher`** (~100 LOC) — topo-sorts tasks by `depends_on`, walks them, calls each task's skill, and persists `tasks.json` after each status transition so the UI polls live progress. A dependency in `skipped` state counts as satisfied (so EU tickers don't stall on SEC-only producers).
3. **`compass.skills`** — discovers + loads `skills/<slug>/SKILL.md`. Two runner kinds: `deterministic` (skill ships `scripts/run.py` with an async `run(engagement, task, *, on_event)`) or `agent` (no `run.py` — `compass.agent_helper.run_agent_skill_default` drives a claude-agent-sdk loop with the SKILL.md body as the system prompt and `spec.needs` resolved to artifact paths in the user prompt).

### The Engagement is the unit of work

`compass.engagement.Engagement` materializes `data/engagements/<analyst-slug>/<TICKER>/` and is the single source of truth for one analyst × one ticker:

```
.pipeline/{tasks.json, docs/coverage_brief.json, run.log}
corpus/{filings/<FORM>/<ACCESSION>/, snapshots/yahoo/, news/, transcripts/}
analysis/{kpis/, sections/, gates/}
memos/{pitch/, earnings-reaction/, maintenance/}
```

The artifact tree + brief + task list **are the evidence** — there is no SQLite ledger anymore. Memo citations are relative paths into this tree (optionally with a line anchor). The `PreToolUse` hook in `compass.tools.make_tool_logger` streams tool calls to stderr and appends JSONL to `.pipeline/run.log` (and/or fires a user `on_event` callback for the API's polling endpoints). Tasks bind to an analyst via `DEFAULT_ANALYST_FOR_TICKER` unless `--analyst` overrides.

### Skills are markdown-first

Every skill is `skills/<slug>/SKILL.md` with YAML-ish frontmatter (hand-parsed, no PyYAML dep) + a Markdown body. Important frontmatter keys:

- `phase`: `setup | ingest | analyze | compose | maintain` — drives both UI grouping and planner dependency wiring.
- `runner`: `deterministic` (has `scripts/run.py`) or `agent` (SKILL.md is the system prompt). Inferred from the presence of `scripts/run.py` if omitted.
- `produces:` — turns the skill into a **data-source-registry producer**. `category`, `params`, `regions`, `output_pattern`. Dropping a new `fetch-*` skill folder with a `produces:` block instantly makes it discoverable to compose skills that name that category in `needs:`. No code change.
- `needs:` — list of categories the compose skill wants surfaced in its prompt (`filings(10-K)`, `news`, `snapshots`, `overview`, etc.). Parameterized entries (`filings(10-K)` + `filings(10-Q)`) produce distinct ingest tasks with stable IDs.
- `allowed-tools`, `model`, `max_turns` — agent-runner only.

`skills/_reference/` is **not** loaded — leading underscore signals "pattern library only" (vendored Dr. Claw reference skills).

### Data sources registry

`compass.data_sources` is a **derived view** over `skills/` — it scans every SKILL.md with a `produces:` block on each call (no cache). `regions: ["US"]` on a producer means the planner won't even plan that task for EU tickers (clean UI: no impossible green-checkmark tasks). Empty `regions` = universal.

### Personas / packs

`packs/*.json` are persona-pack manifests (Buffett / Munger / Ray Dalio). Hiring a pack fills an `Analyst` record (`compass.analysts`) with the pack's title, sector hint, voice (persona), skill toolkit, default template, and chat-chip workflows. The agent's writing voice comes from the persona; the skill catalogue stays generic.

### Frontend

React 18 + Vite 6 + TypeScript + Tailwind 3.4 under `web/`, build outputs to `compass/static/` which FastAPI serves. The bundle is committed (source maps gitignored) so `pip install` + `compass serve` works without Node installed. shadcn-style primitives live in `web/src/components/ui/`. The UI's `PipelineTask` type in `web/src/types/domain.ts` mirrors `compass.engagement.Task` field-for-field — keep them in sync when changing schemas. Mocks in `web/src/mocks/` document the shape the API must return.

### Auth quirk worth knowing

Don't route chat replies through the raw Anthropic Messages API with a Bearer OAuth token — that path gets rate-limited far more aggressively than calls routed through `claude-agent-sdk`'s `query()`. `compass.llm` exists to keep all OAuth-shaped traffic going through the SDK, which inherits the Claude Code user-agent and headers.

## When adding things

- **New data source** → new `skills/fetch-<thing>/` folder with a `produces:` block. The planner picks it up automatically for any compose skill whose `needs:` names that category. No edit to `data_sources.py`.
- **New memo type** → new compose skill + new planner template function in `compass.planner`. Add it to `TEMPLATES`.
- **New analyst persona** → new `packs/<id>.json` manifest. The roster in `compass.analysts` hires from it.
- **Region-aware producer** → set `regions: [...]` in `produces:`. EU tickers skip US-only fetchers cleanly.
- **Per-skill instructions for the agent** → edit the SKILL.md body. The system prompt is just that body verbatim.

## Doc layout

- `docs/design/README.md` — living design doc (slice notes, decisions, architecture rationale). Update after each slice that exposes an architectural surprise.
- `docs/slice-18-overnight.md` — the skills-architecture rewrite. Read this if `agent.py` / "evidence ledger" / "ev#N citations" appear in old docs or comments.
- `background/` — gitignored personal reference (Dr. Claw notes, case study PDF). Not part of the product.
