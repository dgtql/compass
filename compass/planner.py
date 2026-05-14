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

from datetime import date, datetime, timezone
from typing import Callable

from compass.engagement import Engagement, Task

TEMPLATES: dict[str, Callable[[Engagement], list[Task]]] = {}


def _run_stamp() -> str:
    """Per-run UTC timestamp for deliverable filenames.

    Format ``YYYY-MM-DDTHH-MM-SS`` — lexicographically sortable, safe on
    Windows (no colons), readable enough to skim in a directory listing.
    Each call returns a fresh value, so two same-day runs of the same
    template produce distinct files instead of overwriting each other.
    """
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")


# ---------------------------------------------------------------------------
# Persona template factory — auto-generates ``<slug>-pitch`` per pack
# ---------------------------------------------------------------------------
#
# Hand-authored templates (pitch-memo, buffett-pitch, …) cover known shapes.
# But distilled or user-uploaded "person" skills (Munger, Lynch, Klarman, …)
# need a *runnable* template the moment their pack ships — otherwise the
# Hire modal lists them but the dispatcher can't execute their workflows.
#
# The factory below clones the buffett-pitch structure, swaps the compose
# skill for ``skill_slug``, and registers it under ``{slug}-pitch``. The
# packs loader scans on each request, so as soon as ``packs/<slug>.json``
# lands on disk a corresponding template is also created in this process.


def _make_persona_pitch_template(skill_slug: str, person_name: str = ""):
    """Return a planner function that wires ``skill_slug`` at compose.

    The returned function follows the same shape as ``_buffett_pitch``
    (full data spine + KPI extraction + one compose task + brief refresh),
    but its compose task invokes the named persona skill.
    """
    display = person_name or skill_slug

    def _pitch(engagement: Engagement) -> list[Task]:
        t = engagement.ticker
        today = date.today().isoformat()
        tasks: list[Task] = []

        tasks.append(Task(
            id="setup-brief",
            stage="setup",
            title=f"Build coverage brief for {t}",
            skill="build-coverage-brief",
            priority="high",
            task_type="planning",
            artifact_path=".pipeline/docs/coverage_brief.json",
        ))
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
            id="analyze-segments", stage="analyze",
            title="Parse 10-K into structured sections",
            skill="parse-10k-segments", priority="high", task_type="analysis",
            depends_on=["ingest-10k"],
        ))
        tasks.append(Task(
            id="analyze-kpis", stage="analyze",
            title="Extract KPIs into a structured table",
            skill="extract-kpis", priority="high", task_type="analysis",
            artifact_path=f"analysis/kpis/{t}__kpis.json",
            depends_on=["analyze-segments", "ingest-snapshot"],
        ))
        tasks.append(Task(
            id=f"compose-{skill_slug}",
            stage="compose",
            title=f"{display} analysis for {t}",
            skill=skill_slug,
            priority="high",
            task_type="writing",
            params={"path": "B", "memo_type": f"{skill_slug}-pitch"},
            artifact_path=f"memos/{skill_slug}-pitch/{_run_stamp()}.md",
            depends_on=["analyze-segments", "analyze-kpis", "ingest-news"],
            description=(
                f"Apply {display}'s full framework end-to-end. Read the "
                f"brief, parsed 10-K segments, KPI extraction, snapshot, "
                f"and recent news. Produce a structured pitch memo that "
                f"follows the skill's Standard Output Format."
            ),
        ))
        tasks.append(Task(
            id="maintain-update-brief",
            stage="maintain",
            title=f"Propagate {display}'s findings back into the brief",
            skill="update-coverage-brief",
            priority="medium",
            task_type="maintenance",
            artifact_path=".pipeline/docs/coverage_brief.json",
            depends_on=[f"compose-{skill_slug}"],
        ))
        return tasks

    return _pitch


def register_persona_template(skill_slug: str, person_name: str = "") -> str | None:
    """Register ``{skill_slug}-pitch`` as a planner template.

    Idempotent: returns ``None`` if the template name is already taken
    (hand-authored templates like ``buffett-pitch`` always win). Returns
    the registered template name otherwise.

    Called when a new pack is created at runtime (POST /api/skills with
    ``pack``) so the new persona is immediately hireable + runnable
    without restarting the server.
    """
    if not skill_slug:
        return None
    name = f"{skill_slug}-pitch"
    if name in TEMPLATES:
        return None
    TEMPLATES[name] = _make_persona_pitch_template(skill_slug, person_name)
    return name


def _autoregister_pack_templates() -> None:
    """At module load, scan ``packs/`` and register templates for each pack.

    A pack declares ``default_template`` and ``workflows[].command``.
    For any command that isn't a hand-authored template AND follows the
    ``<slug>-pitch`` convention, we generate a parametric template using
    the pack's first skill as the compose target. Hand-authored ones
    (buffett-pitch, buffett-quick-filter, buffett-sell-check) are
    already registered above and aren't overwritten.
    """
    try:
        from compass.packs import list_packs
    except Exception:  # noqa: BLE001 — packs module optional during early bootstrap
        return
    for pack in list_packs():
        if not pack.skills:
            continue
        compose_skill = pack.skills[0]
        # Register pack's declared workflows that follow the convention.
        for wf in pack.workflows:
            cmd = wf.command
            if not cmd or cmd in TEMPLATES:
                continue
            if cmd.endswith("-pitch"):
                register_persona_template(compose_skill, pack.name)
        # Also register the default_template if it's a -pitch we didn't catch.
        if pack.default_template and pack.default_template.endswith("-pitch"):
            register_persona_template(compose_skill, pack.name)


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


def inspect_template(name: str, *, ticker: str = "TICKER") -> dict:
    """Introspect a planner template without writing to disk.

    Constructs the ``Engagement`` dataclass directly (skipping
    ``Engagement.open``'s ``_materialize``) so we never touch the
    filesystem just to enumerate what a workflow would do. Returns
    enough for the Workflows tab to render a card per template:
    task count, phases hit, ordered skill list, final output path.
    """
    if name not in TEMPLATES:
        raise KeyError(f"unknown template: {name}")
    from pathlib import Path
    from compass.engagement import PHASES
    stub_root = Path("__preview__") / "preview-analyst" / ticker
    eng = Engagement(
        analyst_slug="preview-analyst", ticker=ticker, root=stub_root,
    )
    tasks = TEMPLATES[name](eng)
    phase_index = {p: i for i, p in enumerate(PHASES)}
    phases = sorted(
        {t.stage for t in tasks},
        key=lambda s: phase_index.get(s, 99),
    )
    skills: list[str] = []
    seen: set[str] = set()
    for t in tasks:
        if t.skill and t.skill not in seen:
            seen.add(t.skill)
            skills.append(t.skill)
    compose_outputs = [
        t.artifact_path for t in tasks
        if t.stage == "compose" and t.artifact_path
    ]
    return {
        "name": name,
        "task_count": len(tasks),
        "phases": phases,
        "skills": skills,
        "final_output": compose_outputs[-1] if compose_outputs else None,
    }


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
        artifact_path=f"memos/pitch/{_run_stamp()}.md",
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
        artifact_path=f"memos/earnings-reaction/{_run_stamp()}.md",
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
        artifact_path=f"memos/deep-dive/{_run_stamp()}.md",
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


# ---------------------------------------------------------------------------
# Buffett pack — three workflows backed by the single ``buffett`` skill
# ---------------------------------------------------------------------------
#
# All three templates ingest+analyze using Compass's stock skills, then
# replace the 5-section-drafts+assemble compose phase with one
# ``compose-buffett`` task. The buffett SKILL.md body internally branches
# on ``params.path``: ``B`` = Path B full deep analysis (default),
# ``A`` = Path A 8-question quick filter, ``sell-check`` = the four
# sell criteria. The universal runner surfaces ``task.params`` in the
# prompt so the skill can switch behaviour from one pack entry point to
# the next without authoring a separate SKILL.md per workflow.


@template("buffett-pitch")
def _buffett_pitch(engagement: Engagement) -> list[Task]:
    """Path B — full Buffett deep analysis on a covered ticker.

    Same data spine as ``pitch-memo``; the compose phase collapses to one
    holistic task that produces the structured memo (Conclusion / Circle of
    Competence / Business Quality / Financial Snapshot / Valuation / Sell
    Criteria / Key Risks / Monitoring Indicators / Overall Assessment).
    """
    today = date.today().isoformat()
    t = engagement.ticker
    tasks: list[Task] = []

    tasks.append(Task(
        id="setup-brief",
        stage="setup",
        title=f"Build coverage brief for {t}",
        skill="build-coverage-brief",
        priority="high",
        task_type="planning",
        artifact_path=".pipeline/docs/coverage_brief.json",
    ))

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
        id="analyze-segments", stage="analyze",
        title="Parse 10-K into structured sections",
        skill="parse-10k-segments", priority="high", task_type="analysis",
        depends_on=["ingest-10k"],
    ))
    tasks.append(Task(
        id="analyze-kpis", stage="analyze",
        title="Extract KPIs into a structured table",
        skill="extract-kpis", priority="high", task_type="analysis",
        artifact_path=f"analysis/kpis/{t}__kpis.json",
        depends_on=["analyze-segments", "ingest-snapshot"],
    ))

    tasks.append(Task(
        id="compose-buffett",
        stage="compose",
        title=f"Buffett deep analysis for {t}",
        skill="buffett",
        priority="high",
        task_type="writing",
        params={"path": "B", "memo_type": "buffett-pitch"},
        artifact_path=f"memos/buffett-pitch/{_run_stamp()}.md",
        depends_on=["analyze-segments", "analyze-kpis", "ingest-news"],
        description=(
            "Apply Buffett's full Path B framework: business quality "
            "(moat type + trend), management integrity, financial snapshot "
            "(ROIC, owner earnings, cash conversion), intrinsic value + "
            "margin of safety, sell-criteria item-by-item, key risks, "
            "monitoring indicators. Cite paths to artifacts read."
        ),
    ))

    tasks.append(Task(
        id="maintain-update-brief",
        stage="maintain",
        title="Propagate Buffett's findings back into the brief",
        skill="update-coverage-brief",
        priority="medium",
        task_type="maintenance",
        artifact_path=".pipeline/docs/coverage_brief.json",
        depends_on=["compose-buffett"],
    ))

    return tasks


@template("buffett-quick-filter")
def _buffett_quick_filter(engagement: Engagement) -> list[Task]:
    """Path A — the 8-question pass/fail filter, ~2 minutes of thinking.

    Light data spine: brief + snapshot + recent news. No 10-K parse, no
    KPI extraction. The skill produces a short pass/fail table with a
    one-sentence rationale per dimension, then a top-line "deeper analysis
    worth doing?" verdict.
    """
    today = date.today().isoformat()
    t = engagement.ticker
    tasks: list[Task] = []

    tasks.append(Task(
        id="setup-brief",
        stage="setup",
        title=f"Build coverage brief for {t} (light)",
        skill="build-coverage-brief",
        priority="high",
        task_type="planning",
        artifact_path=".pipeline/docs/coverage_brief.json",
    ))

    tasks.append(Task(
        id="ingest-snapshot", stage="ingest",
        title=f"Yahoo snapshot for {t}",
        skill="fetch-market-snapshot", priority="medium", task_type="ingestion",
        artifact_path=f"corpus/snapshots/yahoo/{today}.md",
        depends_on=["setup-brief"],
    ))
    tasks.append(Task(
        id="ingest-news", stage="ingest",
        title=f"Recent news for {t}",
        skill="fetch-news", priority="medium", task_type="ingestion",
        artifact_path=f"corpus/news/{today}.json",
        depends_on=["setup-brief"],
    ))

    tasks.append(Task(
        id="compose-buffett",
        stage="compose",
        title=f"Buffett 8-question filter on {t}",
        skill="buffett",
        priority="high",
        task_type="writing",
        params={"path": "A", "memo_type": "buffett-quick-filter"},
        artifact_path=f"memos/buffett-quick-filter/{_run_stamp()}.md",
        depends_on=["ingest-snapshot", "ingest-news"],
        description=(
            "Run the Path A 8-question filter only — Circle of Competence, "
            "Durability, Moat, Pricing Power, Earnings Quality, Debt Safety, "
            "Management Integrity, Reasonable Price. One-sentence rationale "
            "per question, pass/fail, then top-line verdict on whether deeper "
            "Path B analysis is worth doing."
        ),
    ))

    return tasks


@template("buffett-sell-check")
def _buffett_sell_check(engagement: Engagement) -> list[Task]:
    """Apply the four sell criteria to an existing covered name.

    Assumes a brief already exists (the thesis being checked against).
    Light ingest: refresh snapshot and recent news so the price + catalysts
    are current, then run the skill against the existing brief.
    """
    today = date.today().isoformat()
    t = engagement.ticker
    tasks: list[Task] = []

    tasks.append(Task(
        id="setup-brief",
        stage="setup",
        title=f"Refresh coverage brief for {t}",
        skill="build-coverage-brief",
        priority="high",
        task_type="planning",
        artifact_path=".pipeline/docs/coverage_brief.json",
        description=(
            "Light refresh — the sell check is anchored to the existing "
            "thesis; don't rewrite it unless evidence forces a change."
        ),
    ))

    tasks.append(Task(
        id="ingest-snapshot", stage="ingest",
        title=f"Yahoo snapshot for {t}",
        skill="fetch-market-snapshot", priority="high", task_type="ingestion",
        artifact_path=f"corpus/snapshots/yahoo/{today}.md",
        depends_on=["setup-brief"],
    ))
    tasks.append(Task(
        id="ingest-news", stage="ingest",
        title=f"Recent news for {t}",
        skill="fetch-news", priority="medium", task_type="ingestion",
        artifact_path=f"corpus/news/{today}.json",
        depends_on=["setup-brief"],
    ))

    tasks.append(Task(
        id="compose-buffett",
        stage="compose",
        title=f"Buffett sell-check on {t}",
        skill="buffett",
        priority="high",
        task_type="writing",
        params={"path": "sell-check", "memo_type": "buffett-sell-check"},
        artifact_path=f"memos/buffett-sell-check/{_run_stamp()}.md",
        depends_on=["ingest-snapshot", "ingest-news"],
        description=(
            "Apply only the four sell criteria item-by-item: "
            "(1) Price severely overvalued? "
            "(2) Fundamental moat destruction? "
            "(3) Management integrity issue (auto-sell if yes)? "
            "(4) Significantly better opportunity available? "
            "For each, explicit Yes/No + the evidence cited. End with a "
            "single sentence: Sell / Trim / Hold / Add."
        ),
    ))

    return tasks


# ---------------------------------------------------------------------------
# Maintenance refresh (generic, persona-agnostic)
# ---------------------------------------------------------------------------


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
        artifact_path=f"memos/maintenance/{_run_stamp()}.md",
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


# ---------------------------------------------------------------------------
# Auto-wire pack-declared templates at import time
# ---------------------------------------------------------------------------
#
# Runs AFTER all hand-authored ``@template`` decorators so collisions
# resolve in favour of the hand-curated version (e.g. ``buffett-pitch``
# stays hand-authored, not the parametric clone).
_autoregister_pack_templates()
