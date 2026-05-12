# Compass

> Your AI analyst team — analyst-grade research at AI speed and cost.

Compass produces the work a buy-side analyst would: pitch memos, maintenance
updates, earnings reactions, and real-time alerts on covered names — grounded
in primary sources, scalable to any number of tickers, available 24/7.

**Status: pre-alpha.** Slices 1–9 of the
[build plan](docs/design/README.md#7-build-plan) shipped: the agent can
answer a prompt, ingest SEC filings as clean Markdown via `edgartools`,
pull a daily Yahoo Finance snapshot (price, analyst consensus, news)
via `yfinance`, write every fetched chunk + every tool call into the
SQLite evidence ledger, produce a **structured analyst pitch memo**
that cites both fundamentals and market context by evidence-row ID,
and run as an **interactive web workbench**: add tickers, click "Run"
to fetch filings / pull snapshots / generate memos, watch tool calls
stream live into a tasks panel, click any `[ev#N]` citation to see the
source chunk. More memo types and ingestion sources (Oslo NewsWeb, IR
pages, transcripts) are on the runway.

## Quickstart

Requires Python ≥ 3.10.

```bash
git clone https://github.com/<your-username>/compass
cd compass
pip install -e ".[dev]"
```

Authenticate one of two ways:

**Option A — Claude Code subscription (recommended for personal use).**
Install [Claude Code](https://claude.com/claude-code) and run `claude` once to
log in via OAuth. Compass picks up these credentials automatically.

**Option B — API key.** Copy `.env.example` to `.env` and set
`ANTHROPIC_API_KEY=sk-ant-...`. The API key takes priority over OAuth if both
are present.

### Try it

```bash
compass ask "What is 2+2?"
```

Or run the smoke test, which exercises the full path end-to-end:

```bash
pytest tests/
```

## What's here so far

| Slice | Status | What it does |
|---|---|---|
| 1. Hello, agent | done | `compass ask` — minimal CLI that talks to Claude |
| 2. Ingest one document | done | `compass fetch SOC 10-K` — pulls the latest 10-K into `data/tickers/SOC_US/corpus/filings/10-K/<accession>/primary.md` as clean Markdown via `edgartools` |
| 3. Agent reads a document | done | `compass summarize SOC <path>` — agent reads a filing with the Read tool, observed by a PreToolUse hook, returns a grounded one-paragraph PM-grade summary |
| 4. Evidence ledger | done | `compass evidence list/show/audit` — SQLite at `data/compass.db`; every fetched doc chunked into rows; every tool call audited |
| 5+6. First skill + pitch memo end-to-end | done | `compass research SOC --type pitch` — agent reads the corpus, consults `skills/pitch-memo/SKILL.md`, and writes a structured Markdown pitch memo to `data/tickers/SOC_US/memos/pitch/<date>.md` with `[ev#N]` citations into the evidence ledger |
| 7. Yahoo Finance ingestion | done | `compass snapshot SOC` — fetches a daily Yahoo snapshot (price, 52-week range, analyst consensus, financials, news) via `yfinance` into `corpus/snapshots/yahoo/<date>.md`; pitch memo now cites both fundamentals and market context |
| 8. Web UI (read-only) | done | `compass serve` — FastAPI + vanilla-JS SPA at `http://localhost:8000`. Three-pane layout: tickers/memos list, memo viewer with clickable `[ev#N]` tags, evidence side panel showing the cited chunk with source link |
| 9. Interactive workbench | done | The UI now drives actions: add a ticker via the sidebar input, click "Fetch 10-K" / "Yahoo snapshot" / "Generate pitch memo" to start a background task, watch the agent's tool calls stream into the Tasks panel live, see new memos appear without page reload |
| 10+ | planned | More memo types (earnings-reaction, maintenance-update, morning-brief), more sources (Oslo NewsWeb, IR pages, transcripts), agent-autonomous skill discovery, WebSocket push instead of polling |

## Design

The full design — positioning, target user, architecture, repo layout, build
plan, open questions — lives in [`docs/design/README.md`](docs/design/README.md).
Start there to understand or contribute.

## License

MIT (pending).
