"""Planner — turn a PM ask into an engagement's ``tasks.json``.

v1 is template-driven (the user signed off on this approach): each named
template emits a fixed list of :class:`Task`s, grouped by phase. The
planner does no LLM work itself — it stamps out task lists. The
agent-driven planning (free-form decomposition) comes later as a v2
fallback when no template matches.

Templates currently supported:

* ``pitch-memo`` — initial coverage write-up
* ``earnings-reaction`` — short post-earnings note
* ``maintenance-refresh`` — quarterly update against the existing brief

Adding a template = adding a function that returns ``list[Task]``.
"""

from __future__ import annotations

from datetime import date
from typing import Callable

from compass.engagement import Engagement, Task

TEMPLATES: dict[str, Callable[[Engagement], list[Task]]] = {}


def template(name: str) -> Callable[[Callable[[Engagement], list[Task]]], Callable[[Engagement], list[Task]]]:
    """Decorator to register a template."""

    def wrap(fn: Callable[[Engagement], list[Task]]) -> Callable[[Engagement], list[Task]]:
        TEMPLATES[name] = fn
        return fn

    return wrap


def plan(engagement: Engagement, template_name: str) -> list[Task]:
    """Return the task list for ``template_name`` (does not save)."""
    if template_name not in TEMPLATES:
        raise KeyError(
            f"unknown template: {template_name}. "
            f"Available: {sorted(TEMPLATES)}"
        )
    return TEMPLATES[template_name](engagement)


def list_templates() -> list[str]:
    return sorted(TEMPLATES)


# ---------------------------------------------------------------------------
# Pitch memo
# ---------------------------------------------------------------------------


@template("pitch-memo")
def _pitch_memo(engagement: Engagement) -> list[Task]:
    today = date.today().isoformat()
    t = engagement.ticker
    SECTIONS = [
        ("thesis",          "Thesis"),
        ("business",        "Business"),
        ("recent-financials", "Recent Financials"),
        ("risks",           "Risks"),
        ("catalysts",       "Catalysts"),
    ]

    tasks: list[Task] = []

    # --- Setup -------------------------------------------------------------
    tasks.append(Task(
        id="setup-brief",
        stage="setup",
        title=f"Build coverage brief for {t}",
        skill="build-coverage-brief",
        priority="high",
        task_type="planning",
        artifact_path=".pipeline/docs/coverage_brief.json",
        description=f"Author or refresh the structured coverage brief for {t}. This frames every downstream task.",
    ))

    # --- Ingest ------------------------------------------------------------
    tasks.append(Task(
        id="ingest-10k",
        stage="ingest",
        title=f"Fetch {t} latest 10-K",
        skill="fetch-sec-filing",
        priority="high",
        task_type="ingestion",
        params={"form": "10-K", "limit": 1},
        depends_on=["setup-brief"],
        description="Pull the most recent 10-K from EDGAR into corpus/filings/10-K/.",
    ))
    tasks.append(Task(
        id="ingest-10q",
        stage="ingest",
        title=f"Fetch {t} latest 10-Q",
        skill="fetch-sec-filing",
        priority="medium",
        task_type="ingestion",
        params={"form": "10-Q", "limit": 1},
        depends_on=["setup-brief"],
        description="Pull the most recent 10-Q for quarter-over-quarter context.",
    ))
    tasks.append(Task(
        id="ingest-snapshot",
        stage="ingest",
        title=f"Yahoo market snapshot for {t}",
        skill="fetch-market-snapshot",
        priority="medium",
        task_type="ingestion",
        artifact_path=f"corpus/snapshots/yahoo/{today}.md",
        depends_on=["setup-brief"],
        description="Capture today's price, analyst consensus, and recent financial-statement summary.",
    ))
    tasks.append(Task(
        id="ingest-news",
        stage="ingest",
        title=f"Recent news for {t}",
        skill="fetch-news",
        priority="medium",
        task_type="ingestion",
        artifact_path=f"corpus/news/{today}.json",
        depends_on=["setup-brief"],
        description="Pull recent ticker-tagged news headlines for the catalysts/risks framing.",
    ))

    # --- Analyze -----------------------------------------------------------
    tasks.append(Task(
        id="analyze-segments",
        stage="analyze",
        title="Parse 10-K into structured sections",
        skill="parse-10k-segments",
        priority="high",
        task_type="analysis",
        depends_on=["ingest-10k"],
        description="Split the 10-K markdown into Business / MD&A / Risk Factors / Financials artifacts.",
    ))
    tasks.append(Task(
        id="analyze-kpis",
        stage="analyze",
        title="Extract KPIs into a structured table",
        skill="extract-kpis",
        priority="high",
        task_type="analysis",
        artifact_path=f"analysis/kpis/{t}__kpis.json",
        depends_on=["analyze-segments", "ingest-snapshot"],
        description="Pull revenue, margin, cash, and debt for the last 2-3 reporting periods.",
    ))
    tasks.append(Task(
        id="analyze-gate",
        stage="analyze",
        title="Quality gate: brief vs evidence coverage",
        skill="gate-coverage-check",
        priority="medium",
        task_type="review",
        artifact_path=f"analysis/gates/coverage-check.json",
        depends_on=["analyze-segments", "analyze-kpis"],
        description="Verify every key question in the brief is supported by an artifact.",
    ))

    # --- Compose -----------------------------------------------------------
    section_ids: list[str] = []
    for slug, label in SECTIONS:
        task_id = f"compose-{slug}"
        section_ids.append(task_id)
        tasks.append(Task(
            id=task_id,
            stage="compose",
            title=f"Draft memo section: {label}",
            skill="draft-memo-section",
            priority="high",
            task_type="writing",
            params={"section_slug": slug, "section_label": label, "memo_type": "pitch"},
            artifact_path=f"analysis/sections/{t}__pitch__{slug}.md",
            depends_on=["analyze-gate"],
            description=f"Write the '{label}' section using the brief and analyze-phase artifacts. Cite paths.",
        ))

    tasks.append(Task(
        id="compose-assemble",
        stage="compose",
        title=f"Assemble {t} pitch memo",
        skill="assemble-memo",
        priority="high",
        task_type="writing",
        params={
            "memo_type": "pitch",
            "section_order": [s for s, _ in SECTIONS],
        },
        artifact_path=f"memos/pitch/{today}.md",
        depends_on=section_ids,
        description="Stitch the drafted sections into the final pitch memo at memos/pitch/<date>.md.",
    ))

    # --- Maintain ----------------------------------------------------------
    tasks.append(Task(
        id="maintain-update-brief",
        stage="maintain",
        title="Propagate findings back into the brief",
        skill="update-coverage-brief",
        priority="medium",
        task_type="maintenance",
        artifact_path=".pipeline/docs/coverage_brief.json",
        depends_on=["compose-assemble"],
        description="Update KPI currents, risk ranks, and catalysts in coverage_brief.json based on the just-written memo.",
    ))

    return tasks


# ---------------------------------------------------------------------------
# Earnings reaction
# ---------------------------------------------------------------------------


@template("earnings-reaction")
def _earnings_reaction(engagement: Engagement) -> list[Task]:
    today = date.today().isoformat()
    t = engagement.ticker
    SECTIONS = [
        ("headline", "Headline"),
        ("vs-thesis", "What this means for the thesis"),
        ("next-steps", "What we're watching next"),
    ]

    tasks: list[Task] = []

    tasks.append(Task(
        id="setup-brief",
        stage="setup",
        title=f"Refresh coverage brief for {t}",
        skill="build-coverage-brief",
        priority="high",
        task_type="planning",
        artifact_path=".pipeline/docs/coverage_brief.json",
        description=f"Reuse or refresh the existing brief — the thesis is the frame for reaction.",
    ))

    tasks.append(Task(
        id="ingest-snapshot",
        stage="ingest",
        title=f"Yahoo market snapshot for {t}",
        skill="fetch-market-snapshot",
        priority="high",
        task_type="ingestion",
        artifact_path=f"corpus/snapshots/yahoo/{today}.md",
        depends_on=["setup-brief"],
    ))
    tasks.append(Task(
        id="ingest-news",
        stage="ingest",
        title=f"Earnings-flavored news for {t}",
        skill="fetch-news",
        priority="high",
        task_type="ingestion",
        artifact_path=f"corpus/news/{today}.json",
        depends_on=["setup-brief"],
        description="Pull recent news, especially earnings coverage.",
    ))
    tasks.append(Task(
        id="ingest-10q",
        stage="ingest",
        title=f"Fetch {t} latest 10-Q",
        skill="fetch-sec-filing",
        priority="medium",
        task_type="ingestion",
        params={"form": "10-Q", "limit": 1},
        depends_on=["setup-brief"],
    ))

    tasks.append(Task(
        id="analyze-kpis",
        stage="analyze",
        title="KPI deltas (latest quarter vs prior period)",
        skill="extract-kpis",
        priority="high",
        task_type="analysis",
        artifact_path=f"analysis/kpis/{t}__kpis.json",
        depends_on=["ingest-10q", "ingest-snapshot"],
    ))
    tasks.append(Task(
        id="analyze-gate",
        stage="analyze",
        title="Quality gate: does evidence support the reaction?",
        skill="gate-coverage-check",
        priority="medium",
        task_type="review",
        artifact_path="analysis/gates/coverage-check.json",
        depends_on=["analyze-kpis"],
    ))

    section_ids: list[str] = []
    for slug, label in SECTIONS:
        task_id = f"compose-{slug}"
        section_ids.append(task_id)
        tasks.append(Task(
            id=task_id,
            stage="compose",
            title=f"Draft reaction section: {label}",
            skill="draft-memo-section",
            priority="high",
            task_type="writing",
            params={"section_slug": slug, "section_label": label, "memo_type": "earnings-reaction"},
            artifact_path=f"analysis/sections/{t}__earnings-reaction__{slug}.md",
            depends_on=["analyze-gate"],
        ))

    tasks.append(Task(
        id="compose-assemble",
        stage="compose",
        title=f"Assemble {t} earnings reaction",
        skill="assemble-memo",
        priority="high",
        task_type="writing",
        params={"memo_type": "earnings-reaction", "section_order": [s for s, _ in SECTIONS]},
        artifact_path=f"memos/earnings-reaction/{today}.md",
        depends_on=section_ids,
    ))

    tasks.append(Task(
        id="maintain-update-brief",
        stage="maintain",
        title="Propagate the reaction's findings into the brief",
        skill="update-coverage-brief",
        priority="medium",
        task_type="maintenance",
        artifact_path=".pipeline/docs/coverage_brief.json",
        depends_on=["compose-assemble"],
    ))

    return tasks


# ---------------------------------------------------------------------------
# Maintenance refresh
# ---------------------------------------------------------------------------


@template("deep-dive")
def _deep_dive(engagement: Engagement) -> list[Task]:
    """A wide-net research engagement — every available data source pulled in.

    Adds insider trades, institutional holdings, earnings history, recent
    8-Ks, and a free-form web research task on top of the pitch-memo flow.
    The compose phase gets two extra sections (Ownership and Industry
    Context) so the new data has somewhere to land in the final memo.
    """
    today = date.today().isoformat()
    t = engagement.ticker
    SECTIONS = [
        ("thesis",             "Thesis"),
        ("business",           "Business"),
        ("recent-financials",  "Recent Financials"),
        ("ownership",          "Ownership & Insider Activity"),
        ("industry-context",   "Industry Context"),
        ("risks",              "Risks"),
        ("catalysts",          "Catalysts"),
    ]

    tasks: list[Task] = []

    # --- Setup -------------------------------------------------------------
    tasks.append(Task(
        id="setup-brief",
        stage="setup",
        title=f"Build coverage brief for {t}",
        skill="build-coverage-brief",
        priority="high",
        task_type="planning",
        artifact_path=".pipeline/docs/coverage_brief.json",
    ))

    # --- Ingest (wide net) -------------------------------------------------
    tasks.append(Task(
        id="ingest-10k", stage="ingest", title=f"Fetch {t} latest 10-K",
        skill="fetch-sec-filing", priority="high", task_type="ingestion",
        params={"form": "10-K", "limit": 1}, depends_on=["setup-brief"],
    ))
    tasks.append(Task(
        id="ingest-10q", stage="ingest", title=f"Fetch {t} latest 10-Q",
        skill="fetch-sec-filing", priority="medium", task_type="ingestion",
        params={"form": "10-Q", "limit": 1}, depends_on=["setup-brief"],
    ))
    tasks.append(Task(
        id="ingest-8k", stage="ingest", title=f"Fetch {t} recent 8-Ks (press releases)",
        skill="fetch-press-releases", priority="medium", task_type="ingestion",
        params={"limit": 5}, depends_on=["setup-brief"],
    ))
    tasks.append(Task(
        id="ingest-snapshot", stage="ingest", title=f"Yahoo snapshot for {t}",
        skill="fetch-market-snapshot", priority="medium", task_type="ingestion",
        artifact_path=f"corpus/snapshots/yahoo/{today}.md",
        depends_on=["setup-brief"],
    ))
    tasks.append(Task(
        id="ingest-news", stage="ingest", title=f"Recent news for {t}",
        skill="fetch-news", priority="medium", task_type="ingestion",
        artifact_path=f"corpus/news/{today}.json",
        depends_on=["setup-brief"],
    ))
    tasks.append(Task(
        id="ingest-insider", stage="ingest", title=f"Insider trades for {t}",
        skill="fetch-insider-trades", priority="medium", task_type="ingestion",
        artifact_path=f"corpus/ownership/insider-trades-{today}.json",
        depends_on=["setup-brief"],
    ))
    tasks.append(Task(
        id="ingest-institutional", stage="ingest", title=f"Institutional holders for {t}",
        skill="fetch-institutional-holdings", priority="medium", task_type="ingestion",
        artifact_path=f"corpus/ownership/institutional-{today}.json",
        depends_on=["setup-brief"],
    ))
    tasks.append(Task(
        id="ingest-earnings", stage="ingest", title=f"Multi-year earnings history for {t}",
        skill="fetch-earnings-history", priority="medium", task_type="ingestion",
        artifact_path=f"corpus/earnings/history-{today}.json",
        depends_on=["setup-brief"],
    ))
    tasks.append(Task(
        id="ingest-web", stage="ingest", title=f"Web research: industry context for {t}",
        skill="web-research", priority="medium", task_type="ingestion",
        params={"query": f"{t} sector competitors latest industry trends 2026"},
        depends_on=["setup-brief"],
    ))

    # --- Analyze -----------------------------------------------------------
    tasks.append(Task(
        id="analyze-segments", stage="analyze", title="Parse 10-K into structured sections",
        skill="parse-10k-segments", priority="high", task_type="analysis",
        depends_on=["ingest-10k"],
    ))
    tasks.append(Task(
        id="analyze-kpis", stage="analyze", title="Extract KPIs into a structured table",
        skill="extract-kpis", priority="high", task_type="analysis",
        artifact_path=f"analysis/kpis/{t}__kpis.json",
        depends_on=["analyze-segments", "ingest-snapshot", "ingest-earnings"],
    ))
    tasks.append(Task(
        id="analyze-gate", stage="analyze", title="Quality gate",
        skill="gate-coverage-check", priority="medium", task_type="review",
        artifact_path="analysis/gates/coverage-check.json",
        depends_on=["analyze-segments", "analyze-kpis"],
    ))

    # --- Compose (7 sections) ---------------------------------------------
    section_ids: list[str] = []
    for slug, label in SECTIONS:
        task_id = f"compose-{slug}"
        section_ids.append(task_id)
        tasks.append(Task(
            id=task_id,
            stage="compose",
            title=f"Draft memo section: {label}",
            skill="draft-memo-section",
            priority="high",
            task_type="writing",
            params={"section_slug": slug, "section_label": label, "memo_type": "deep-dive"},
            artifact_path=f"analysis/sections/{t}__deep-dive__{slug}.md",
            depends_on=["analyze-gate"],
        ))

    tasks.append(Task(
        id="compose-assemble",
        stage="compose",
        title=f"Assemble {t} deep-dive memo",
        skill="assemble-memo",
        priority="high",
        task_type="writing",
        params={"memo_type": "deep-dive", "section_order": [s for s, _ in SECTIONS]},
        artifact_path=f"memos/deep-dive/{today}.md",
        depends_on=section_ids,
    ))

    # --- Maintain ----------------------------------------------------------
    tasks.append(Task(
        id="maintain-update-brief",
        stage="maintain",
        title="Propagate findings into the brief",
        skill="update-coverage-brief",
        priority="medium",
        task_type="maintenance",
        artifact_path=".pipeline/docs/coverage_brief.json",
        depends_on=["compose-assemble"],
    ))

    return tasks


@template("maintenance-refresh")
def _maintenance_refresh(engagement: Engagement) -> list[Task]:
    today = date.today().isoformat()
    t = engagement.ticker
    SECTIONS = [
        ("what-changed", "What changed since last update"),
        ("thesis-check", "Thesis check"),
        ("watch-list", "On the radar"),
    ]

    tasks: list[Task] = []

    tasks.append(Task(
        id="setup-brief",
        stage="setup",
        title=f"Load current brief for {t}",
        skill="build-coverage-brief",
        priority="high",
        task_type="planning",
        artifact_path=".pipeline/docs/coverage_brief.json",
        description="Refresh — do not overwrite. The maintenance update is anchored to the existing thesis.",
    ))

    tasks.append(Task(
        id="ingest-10q",
        stage="ingest",
        title=f"Fetch {t} latest 10-Q",
        skill="fetch-sec-filing",
        priority="high",
        task_type="ingestion",
        params={"form": "10-Q", "limit": 1},
        depends_on=["setup-brief"],
    ))
    tasks.append(Task(
        id="ingest-snapshot",
        stage="ingest",
        title=f"Yahoo market snapshot for {t}",
        skill="fetch-market-snapshot",
        priority="medium",
        task_type="ingestion",
        artifact_path=f"corpus/snapshots/yahoo/{today}.md",
        depends_on=["setup-brief"],
    ))
    tasks.append(Task(
        id="ingest-news",
        stage="ingest",
        title=f"Recent news for {t}",
        skill="fetch-news",
        priority="medium",
        task_type="ingestion",
        artifact_path=f"corpus/news/{today}.json",
        depends_on=["setup-brief"],
    ))

    tasks.append(Task(
        id="analyze-segments",
        stage="analyze",
        title="Parse new 10-Q sections",
        skill="parse-10k-segments",
        priority="medium",
        task_type="analysis",
        depends_on=["ingest-10q"],
        params={"form": "10-Q"},
    ))
    tasks.append(Task(
        id="analyze-kpis",
        stage="analyze",
        title="KPI deltas vs the brief",
        skill="extract-kpis",
        priority="high",
        task_type="analysis",
        artifact_path=f"analysis/kpis/{t}__kpis.json",
        depends_on=["analyze-segments", "ingest-snapshot"],
    ))
    tasks.append(Task(
        id="analyze-gate",
        stage="analyze",
        title="Quality gate",
        skill="gate-coverage-check",
        priority="medium",
        task_type="review",
        artifact_path="analysis/gates/coverage-check.json",
        depends_on=["analyze-kpis"],
    ))

    section_ids: list[str] = []
    for slug, label in SECTIONS:
        task_id = f"compose-{slug}"
        section_ids.append(task_id)
        tasks.append(Task(
            id=task_id,
            stage="compose",
            title=f"Draft maintenance section: {label}",
            skill="draft-memo-section",
            priority="medium",
            task_type="writing",
            params={"section_slug": slug, "section_label": label, "memo_type": "maintenance"},
            artifact_path=f"analysis/sections/{t}__maintenance__{slug}.md",
            depends_on=["analyze-gate"],
        ))

    tasks.append(Task(
        id="compose-assemble",
        stage="compose",
        title=f"Assemble {t} maintenance update",
        skill="assemble-memo",
        priority="high",
        task_type="writing",
        params={"memo_type": "maintenance", "section_order": [s for s, _ in SECTIONS]},
        artifact_path=f"memos/maintenance/{today}.md",
        depends_on=section_ids,
    ))

    tasks.append(Task(
        id="maintain-update-brief",
        stage="maintain",
        title="Propagate findings into the brief",
        skill="update-coverage-brief",
        priority="medium",
        task_type="maintenance",
        artifact_path=".pipeline/docs/coverage_brief.json",
        depends_on=["compose-assemble"],
    ))

    return tasks
