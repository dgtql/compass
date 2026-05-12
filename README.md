# Compass

> Your AI analyst team — analyst-grade research at AI speed and cost.

Compass produces the work a buy-side analyst would: pitch memos, maintenance
updates, earnings reactions, and real-time alerts on covered names — grounded
in primary sources, scalable to any number of tickers, available 24/7.

**Status: pre-alpha.** Currently at Slice 1 of the
[build plan](docs/design/README.md#7-build-plan) — the agent can answer a
prompt. Ingestion, skills, memos, evidence ledger, and UI are on the runway.

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
| 2. Ingest one document | planned | SEC EDGAR fetch for 10-Ks |
| 3+ | planned | See the [build plan](docs/design/README.md#7-build-plan) |

## Design

The full design — positioning, target user, architecture, repo layout, build
plan, open questions — lives in [`docs/design/README.md`](docs/design/README.md).
Start there to understand or contribute.

## License

MIT (pending).
