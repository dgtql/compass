# Slice 18 — Skills + Planner backend (overnight build, 2026-05-12 → 2026-05-13)

## What this is

The backend rewrite you asked for before going to sleep: replace
`agent.py`'s ask/summarize/research triad and the SQLite evidence ledger
with a **skills + planner** architecture, end-to-end runnable for NVDA
and SOC by morning.

Per your direction:

* Tasks fall into phases. Each phase has multiple tasks.
* Templates first; free-form planning is a v2 fallback.
* Full v1 — every skill is real, not stubs.
* Evidence ledger gone — artifacts + brief + tasks are the evidence.
* Added a web-search-flavored skill (`fetch-news`) so the agent can
  pull recent news beyond filings.

## How to drive it

```bash
# List available templates and skills
python -m compass.cli templates
python -m compass.cli skills

# Plan + run for a ticker
python -m compass.cli run NVDA pitch-memo
python -m compass.cli run SOC pitch-memo

# Inspect state without running
python -m compass.cli status NVDA
python -m compass.cli engagements

# Run only one phase or specific task IDs
python -m compass.cli run NVDA --phase compose
python -m compass.cli run NVDA --only ingest-news,ingest-snapshot
```

The output lands in `data/engagements/<analyst>/<TICKER>/` — exactly the
layout the React UI already expects (`coverage_brief.json`, `tasks.json`,
`corpus/`, `analysis/`, `memos/`).

## The architecture in one diagram

```
PM ask  ──►  planner ──► tasks.json
                          │
                          ▼
                       dispatcher  ──► loads skill from SKILL.md
                          │              │
                          ▼              ▼
                    one task at a time   deterministic (Python only)
                       │                 ── or ──
                       │                 agent (claude-agent-sdk loop
                       │                  with SKILL.md as system prompt)
                       ▼
                    writes artifact under engagement root
                       │
                       ▼
                    updates tasks.json status
```

The dispatcher is intentionally minimal (~100 lines). The cleverness lives
in the **skills** — each is a self-contained unit: SKILL.md (the
contract) + scripts/run.py (the executor).

## v1 skill catalog (16 skills)

### Setup
| # | Skill | Runner | What it does |
|---|---|---|---|
| 1 | `plan-research` | deterministic | Match PM ask to a template; emit `tasks.json`. |
| 2 | `build-coverage-brief` | agent | Author/refresh `coverage_brief.json` — thesis, KPIs, risks, catalysts. |

### Ingest — core
| # | Skill | Runner | What it does |
|---|---|---|---|
| 3 | `fetch-sec-filing` | deterministic | Wraps edgartools → `corpus/filings/<FORM>/<ACCESSION>/primary.md`. |
| 4 | `fetch-market-snapshot` | deterministic | Wraps yfinance → daily snapshot markdown. |
| 5 | `fetch-news` | deterministic | Recent ticker-tagged news headlines → JSON (Yahoo source). |
| 6 | `parse-10k-segments` | deterministic | Heuristic split of a 10-K into Business / Risks / MD&A / Financials. |

### Ingest — extended data sources (your "make more data available" set)
| # | Skill | Runner | What it does |
|---|---|---|---|
| 7 | `fetch-press-releases` | deterministic | Recent 8-Ks (material events) via edgartools — the catalyst tape. |
| 8 | `fetch-insider-trades` | deterministic | Insider Form-4 transactions via yfinance. |
| 9 | `fetch-institutional-holdings` | deterministic | Top 13F holders + ownership concentration via yfinance. |
| 10 | `fetch-earnings-history` | deterministic | Multi-year EPS / revenue history + forward estimates + recommendation changes. |
| 11 | `web-research` | agent | Real web search on a free-form query — uses the SDK's `WebSearch` + `WebFetch`. |

### Analyze
| # | Skill | Runner | What it does |
|---|---|---|---|
| 12 | `extract-kpis` | agent | Fill the brief's KPI list with current values, cited. |
| 13 | `gate-coverage-check` | deterministic | Verify every key question + KPI has evidence. Pass/fail JSON. |

### Compose
| # | Skill | Runner | What it does |
|---|---|---|---|
| 14 | `draft-memo-section` | agent | Draft one named section (thesis / risks / ownership / industry-context / …). |
| 15 | `assemble-memo` | agent | Stitch section drafts into the final memo. |

### Maintain
| # | Skill | Runner | What it does |
|---|---|---|---|
| 16 | `update-coverage-brief` | agent | Propagate new findings into the brief — conservative. |

## v1 templates (4)

* **`pitch-memo`** — 15 tasks. Setup-brief → 10-K + 10-Q + snapshot + news
  → parse segments + extract KPIs + gate → 5 section drafts + assemble
  → update brief.
* **`earnings-reaction`** — 10 tasks. Snapshot + news + 10-Q, KPI deltas
  + gate, 3 section drafts (headline / vs-thesis / next-steps).
* **`maintenance-refresh`** — 12 tasks. 10-Q + snapshot + news, parse +
  KPI deltas + gate, 3 section drafts.
* **`deep-dive`** — 19 tasks. The full menu: 10-K + 10-Q + 8-Ks +
  snapshot + news + insider + institutional + earnings history +
  web-research, plus 7 sections (incl. Ownership + Industry Context),
  assemble, update brief. This is the template that exercises every
  ingest skill.

Adding a new template is `@template("name")` + `def …(engagement) -> list[Task]`
in `compass/planner.py`. Adding a new skill is `skills/<slug>/SKILL.md`
+ `scripts/run.py`. Both are picked up automatically.

## What changed under `compass/`

**New / rewritten:**

* `compass/engagement.py` — `Engagement` class, brief/tasks I/O, path
  helpers. Single source of truth for "where things live on disk".
* `compass/planner.py` — three templates, decorator-registered.
* `compass/dispatcher.py` — topo-sorts tasks, runs them, persists status.
* `compass/skills.py` — discovery + frontmatter parser + dynamic `run.py`
  loader.
* `compass/agent_helper.py` — shared claude-agent-sdk loop for agent-mode
  skills (system prompt = SKILL.md body; PreToolUse hook = stderr + run
  log).
* `compass/cli.py` — new commands: `plan`, `run`, `status`, `skills`,
  `templates`, `engagements`. Old `ask` kept as a smoke test.
* `compass/api.py` — endpoints serve engagement state (`coverage_brief`
  + tasks + artifact tree), matching what the UI's `TickerCoverageView`
  consumes.
* `compass/ingest/edgar.py` + `yahoo.py` — refactored to take
  `engagement_root` instead of using the legacy workspace; SQLite
  references removed.

**Deleted:**

* `compass/agent.py` (ask/summarize/research triad → replaced by skill
  dispatch)
* `compass/db.py` (SQLite evidence ledger → artifacts on disk are the
  evidence)
* `compass/workspace.py` (per-ticker workspace dir → engagement dir)
* `skills/pitch-memo/` (the lone slice-6 skill → replaced by
  draft-memo-section + assemble-memo)
* `tests/test_agent_smoke.py`, `test_evidence_smoke.py`,
  `test_research_smoke.py`, `test_summarize_smoke.py`,
  `test_api_smoke.py` — referenced deleted modules.

**New tests:**

* `tests/test_engagement.py` — paths, brief/tasks roundtrip, run log
* `tests/test_planner.py` — templates valid, no cycles
* `tests/test_skills.py` — every skill discovered with valid frontmatter
* `tests/test_dispatcher.py` — order, skip done, dependency blocking

## End-to-end results

Both pitch-memo runs completed with **15/15 tasks done, 0 errors**. The
artifact trees mirror what the React UI already expects (slice-16
`mockCoverages` shape), so the bridge from mock UI to real backend is a
small wiring change in `web/src/`.

### NVDA — `data/engagements/maria-chen/NVDA/` (1.2 MB, 91 run-log events)

* **Brief** — `coverage_brief.json`. After `update-coverage-brief` ran,
  every KPI carries a real Q3 FY2026 actual: DC revenue $51.2B,
  non-GAAP gross margin ~73.5%, etc. Thesis one-liner: *"NVIDIA
  dominates AI accelerator silicon; the thesis turns on whether
  hyperscaler capex intensity is durable or set to plateau."*
* **Memo** — `memos/pitch/2026-05-12.md`. ~870 words, 7 deduplicated
  sources, 5 sections (Thesis · Business · Recent Financials · Risks ·
  Catalysts). Every numeric claim cites a path. No "buy/sell"
  recommendations leaked through.
* **Filings on disk** — 10-K (FY26 annual, accession `0001045810-26-000021`),
  10-Q latest, Yahoo snapshot, news JSON.

### SOC — `data/engagements/david-park/SOC/` (1.5 MB, 93 run-log events)

* **Brief** — full thesis built from scratch (no prior brief).
  Thesis one-liner: *"SOC is a binary-outcome, pre-revenue upstream
  play: SYU's stranded oil reaches market via pipeline reinstatement
  or the OS&T tanker alternative before a $921.6M / 15% PIK term loan
  triggers a going-concern event in March 2027."*
* **Memo** — `memos/pitch/2026-05-12.md`. ~830 words, 5 sources, 5
  sections. Correctly captures the binary regulatory/financing race
  the slice-16 mock data described — the agent surfaced this from the
  actual 10-K filing, not from the mock.

### Quality observations

* **Citations work.** The `(source: <path>)` parenthetical pattern lets
  the memo trace back to specific artifact files. A v2 UI tooltip can
  show the source inline.
* **The brief survives.** `update-coverage-brief` correctly enriched
  rather than overwrote — it filled `<NEEDS_EVIDENCE>` placeholders
  with real values and refined the thesis only when the new evidence
  materially updated it.
* **Heuristic 10-K splitter is good enough.** Both filings split into
  Business / Risk Factors / MD&A / Financial Statements cleanly. The
  v2 upgrade (semantic chunking) is not urgent.
* **Agent loop discipline.** No skill blew through its `max_turns`
  budget. The longest single skill was `extract-kpis` on NVDA at ~3.5
  minutes (paging through the 10-K + 10-Q for segment data); the
  others were under 2 minutes each.

## Decisions worth flagging for you

1. **No SQLite, no audit DB.** The `.pipeline/run.log` is a JSONL audit
   trail per engagement. Easy to grep, easy to delete, no schema
   migrations. If you eventually want cross-engagement analytics, a
   simple "tail every run.log" pass produces a dataframe.
2. **`fetch-news` is Yahoo-only in v1.** It's the right seam for a real
   search provider (Brave / Tavily / Anthropic's server-side web search),
   but for the overnight build I didn't add a new external API. The
   skill description calls this out so future-you remembers.
3. **The planner is templates-first, period.** No free-form
   LLM-decomposition fallback yet. You signed off on this — but
   re-flagging because the test of v2 is "PM asks 'why did NVDA drop?'"
   and the template match falls through. That's the prompt that lights
   up v2.
4. **`gate-coverage-check` is deliberately loose in v1.** It checks
   "any evidence under analyze/ingest" rather than topic-relevance per
   question. The right v2 upgrade is keyword overlap or a small LLM
   call per question.
5. **Brief retains thesis text on refresh.** `update-coverage-brief` is
   prompted to **not** rewrite the thesis one-liner / body unless the
   new evidence materially contradicts them. This is the institutional-
   memory protection.

## What's *not* done (and why)

* **No UI bridge yet.** The API endpoints serve real engagement data,
  but the React UI is still consuming `web/src/mocks/data.ts`. Wiring
  the UI's `TickerCoverageView` to `/api/engagements/<analyst>/<ticker>`
  is a one-file change in `web/src/`; I left it for you because UI
  routing tends to involve preferences I shouldn't decide solo.
* **No persistence for `_RUNS`.** The API's run registry is in-memory.
  Fine for single-user dev; the moment you want multi-user or restart-
  survival, it needs SQLite or Redis.
* **No `compass plan-research` skill invocation from CLI.** The CLI
  calls the planner directly (faster, simpler). The `plan-research`
  skill is callable via the dispatcher when an external trigger wants
  to (re)plan mid-engagement.

## Suggested first-thing-in-the-morning checks

1. `python -m compass.cli engagements` — confirm both NVDA and SOC are
   listed with `brief: yes` and `tasks: yes`.
2. Open `data/engagements/maria-chen/NVDA/memos/pitch/<today>.md` and
   read the memo. Note where it cites well vs. where it hand-waves.
3. Same for `data/engagements/david-park/SOC/memos/pitch/<today>.md`.
4. `python -m compass.cli status NVDA` — every task should be `[x]`.
5. Grep the run log for `task_error`:
   `grep '"task_error"' data/engagements/*/*/.pipeline/run.log`
6. If anything's off, the run log per engagement is the first place to
   look — every tool call, every task start/done, every error.
