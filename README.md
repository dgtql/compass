<div align="center">
  <h1>Compass: Your AI Analyst Team</h1>
  <p><strong>Analyst-grade research at AI speed and cost.</strong></p>
</div>

<p align="center">
<a href="#license">
<img src="https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-blue?style=for-the-badge" alt="License: PolyForm Noncommercial 1.0.0" />
</a>
<a href="https://www.python.org/downloads/">
<img src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.10+" />
</a>
<a href="https://claude.com/claude-code">
<img src="https://img.shields.io/badge/Powered%20by-Claude%20Code-7C3AED?style=for-the-badge" alt="Powered by Claude Code" />
</a>
</p>

<p align="center">
  <strong>English</strong> | <a href="./README.zh-CN.md">中文</a> | <a href="./README.ar.md">العربية</a> | <a href="./README.es.md">Español</a>
</p>

## Table of Contents

- [Overview](#overview)
- [Highlights](#highlights)
- [Tour](#tour)
- [What an Engagement Produces](#what-an-engagement-produces)
- [Quick Start](#quick-start)
- [A Typical Day](#a-typical-day)
- [Persona Packs](#persona-packs)
- [License](#license)
- [Support & Feedback](#support--feedback)

## Overview

Compass is a research workbench for portfolio managers. You **hire analysts** — generic, or persona packs like Warren Buffett, Charlie Munger, and Ray Dalio — assign them tickers, and ask them to write the work a buy-side analyst would: pitch memos, earnings reactions, maintenance updates, and free-form theme explorations. Every claim cites a primary source you can click into.

The workbench is the surface — a browser UI where chats, coverage trees, memos, and a live knowledge graph sit side by side. Everything an analyst produces is a plain file on disk: open it in your editor, grep it, version it, share it. There's no hidden database.

<p align="center">
  <img src="assets/interface_main.PNG" alt="Compass main interface" width="1000">
</p>

## Highlights

- **🎓 Onboard anyone as an analyst** — Hire from bundled persona packs (Buffett, Munger, Dalio) or onboard a new mind by pointing us at a public figure's writings, interviews, or a book. Each onboarded persona becomes a hireable analyst with their own voice and lens.
- **⚗️ Distillation pipeline** — Feed in a Wikipedia page, a stack of shareholder letters, or a book; out comes a structured analyst skill — voice, mental models, default workflow — ready for you to refine before putting them on the desk.
- **👥 Run a pod, not a single agent** — You're the PM. Hire equity analysts, risk managers, data scientists, data engineers, sector specialists, and more. Each seat keeps its own coverage list, default workflow, and writing voice.
- **🧠 Knowledge graph as your second brain** — Memos, tickers, themes, analysts, and citations rendered as one connected board. See what your pod has written, where claims trace back to, and where the gaps are.
- **💡 Idea research across every source** — Synthesize across past memos from every seat on the desk, academic papers (arXiv, SSRN, Semantic Scholar), sell-side reports, online content, and the web. The master agent surfaces ideas the pod already holds and hunts for new ones.
- **🛠️ Workflow control per deliverable** — Compose the chain of skills behind each output: pitch memos, morning briefs, earnings reactions, maintenance updates, theme explorations. Drop in new skills, reorder steps, or build entirely new memo types.

## Tour

<details>
<summary><strong>🎓 Talent Pool</strong> — Distilled personas and onboarded analysts, ready to hire.</summary>

<p align="center">
  <img src="assets/talent_pool.PNG" alt="Talent pool" width="1000">
</p>

</details>

<details open>
<summary><strong>🧠 Second Brain</strong> — Knowledge graph of every memo, ticker, theme, analyst, and citation your pod has produced.</summary>

<p align="center">
  <img src="assets/second_brain.PNG" alt="Knowledge graph as second brain" width="1000">
</p>

</details>

<details>
<summary><strong>🧰 Skill Library</strong> — Atomic skills your analysts chain into workflows — drop in new ones without code.</summary>

<p align="center">
  <img src="assets/skills_lib.PNG" alt="Skill library" width="1000">
</p>

</details>

<details>
<summary><strong>🧭 Workflow Library</strong> — Templated workflows behind each deliverable: pitch memo, earnings reaction, morning brief — fully composable.</summary>

<p align="center">
  <img src="assets/workflow_lib.PNG" alt="Workflow library" width="1000">
</p>

</details>

<details>
<summary><strong>🗄️ Data Library</strong> — Pluggable data sources available to every seat on the desk.</summary>

<p align="center">
  <img src="assets/data_lib.PNG" alt="Data library" width="1000">
</p>

</details>

## What an Engagement Produces

When an analyst works a ticker, everything lands under `data/engagements/<analyst>/<TICKER>/`:

| | Artifact | Location | Description |
|---|---|---|---|
| 📄 | Memos | `memos/` | Pitch memos, earnings reactions, maintenance updates, idea write-ups |
| 📚 | Filings | `corpus/filings/<FORM>/<ACCESSION>/` | 10-K, 10-Q, 8-K — fetched as clean Markdown via `edgartools` |
| 📈 | Market snapshots | `corpus/snapshots/yahoo/` | Daily price, 52-week range, analyst consensus, financials |
| 📰 | News & press | `corpus/news/`, `corpus/press/` | Recent news and press releases |
| 🎤 | Transcripts | `corpus/transcripts/` | Earnings call transcripts when available |
| 🔬 | Research | `corpus/research/` | Web search and academic literature survey notes |
| 📐 | Analysis | `analysis/kpis/`, `analysis/sections/` | Extracted KPIs and drafted memo sections |
| 🧾 | Coverage brief | `.pipeline/docs/coverage_brief.json` | The analyst's living one-pager about this name |

Theme engagements (free-form trading ideas through the master chat) land under a synthetic `house/IDEA-<slug>/` so they don't pollute real coverage trees.

## Quick Start

### Prerequisites

- **Python 3.10+**
- A **[Claude Code](https://claude.com/claude-code) subscription** — Compass authenticates through Claude Code's OAuth, so there's no separate API key to manage.
- **Node.js** is *not* required — the web UI is pre-built and shipped with the package.

### Install

```bash
git clone https://github.com/<your-username>/compass
cd compass
pip install -e .
```

### Sign in to Claude Code

```bash
npm install -g @anthropic-ai/claude-code
claude /login
```

Follow the OAuth prompt. Compass picks up the credentials automatically.

### Identify yourself to SEC EDGAR

SEC requires a name + email in the User-Agent for filings requests. Copy `.env.example` to `.env` and set:

```env
COMPASS_SEC_USER_NAME=Your Name
COMPASS_SEC_USER_EMAIL=you@example.com
```

### Start the workbench

```bash
compass serve
```

Open [http://127.0.0.1:8001](http://127.0.0.1:8001) in your browser. From here you can hire analysts, build a watchlist, and run engagements without touching the terminal again.

<details>
<summary><strong>Prefer the CLI?</strong></summary>

A few useful commands if you'd rather drive things from the terminal:

```bash
compass templates                  # list available memo workflows
compass plan NVDA pitch-memo       # plan an engagement (stamp out tasks.json)
compass run NVDA pitch-memo        # plan + execute end-to-end
compass status NVDA                # see brief + per-task status
compass engagements                # list materialized engagements
compass universe --sector Technology   # browse the US ticker catalogue
```

</details>

## A Typical Day

1. **Pick names.** Open *My Universe*, search the US ticker catalogue, and add the names you care about to your watchlist.
2. **Hire your team.** Drop in a persona pack (Buffett, Munger, Dalio) or distill a new one from a Wikipedia page. Each analyst gets a desk, a voice, and a default workflow.
3. **Open a chat.** Ask Maria Chen (or Warren) "write a pitch memo on NVDA." The right rail shows you the work happening live — filings being pulled, news being read, sections being drafted.
4. **Read the memo.** Every claim is a clickable citation back to the underlying filing, transcript, or news article. Disagree with a take? Reply in the chat and the analyst will rework it.
5. **Theme work in the master chat.** When you want to think across the book — "where are we exposed if the Fed is on hold through Q3?" — the master chat runs a survey and pulls together a two-section memo: which of your existing ideas are exposed, plus new ideas to consider.

## Persona Packs

Compass ships with three bundled investor personas you can hire immediately:

| | Persona | Style | Built-in lens |
|---|---|---|---|
| 🟦 | **Warren Buffett** | Owner-mindset, moat-first, long-duration | Economic moats, owner earnings, management quality |
| 🟧 | **Charlie Munger** | Latticework of mental models, inversion | Multidisciplinary checklist, "what would make this a terrible idea?" |
| 🟪 | **Ray Dalio** | Macro, principles-driven, regime-aware | Big cycles, debt dynamics, regime shifts |

You can also distill a new persona from a public figure's Wikipedia page — Compass uses the bundled Buffett skill as a shape template and asks Claude to write the rest. Treat the output as a starting point, then refine by hand.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Free to use, modify, and share for **personal projects, research, education, and other noncommercial purposes**. **Commercial use is not permitted** without a separate license — reach out if you'd like to discuss one.

## Support & Feedback

Compass is actively under development. The core workflow — hire, watchlist, pitch memo, earnings reaction, theme exploration — works end-to-end. Expect rough edges, especially around non-US names and esoteric data sources.

- 🐛 **Found a bug?** Open an issue on GitHub.
- 💡 **Have an idea or a workflow you wish existed?** Open a discussion — feedback shapes the roadmap.
- 📬 **Commercial licensing or partnership inquiries?** Reach out via the repository contact.
