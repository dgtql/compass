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

import re
from datetime import date, datetime, timezone
from typing import Callable

from compass.engagement import Engagement, Task

TEMPLATES: dict[str, Callable[[Engagement], list[Task]]] = {}


# ---------------------------------------------------------------------------
# Registry-driven ingest derivation
# ---------------------------------------------------------------------------
#
# A compose skill's ``needs:`` is a shopping list of artifact categories
# it wants surfaced in its prompt at run time. For the *ingest* portion
# of that list, the data-source registry knows which producer skill
# handles each category. ``auto_ingest_tasks`` walks the list and stamps
# out the right ingest tasks — so dropping a new ``fetch-*`` skill (with
# a ``produces:`` block) into the skills folder makes it instantly
# usable by any compose skill whose ``needs:`` already names that
# category.

_NEED_RE = re.compile(r"^([a-zA-Z_-]+)(?:\(([^)]+)\))?$")


def auto_ingest_tasks(
    *,
    compose_skill_slug: str,
    engagement: Engagement,
    depends_on: list[str] | None = None,
    default_priority: str = "medium",
) -> list[Task]:
    """Generate ingest tasks for a compose skill's declared ``needs:``.

    For each category in the compose skill's frontmatter that maps to an
    *ingest-stage* producer in the data-source registry, return a Task
    that invokes that producer. Categories with no producer (yet) are
    silently skipped — the compose agent's user prompt will show
    "(none yet)" for that ``needs:`` entry, which is the right UX.

    Parameterized needs work too: ``filings(10-K)`` becomes a task with
    ``params={"form": "10-K", "limit": 1}``. Two parameterized entries
    of the same category (``filings(10-K)`` + ``filings(10-Q)``) produce
    two distinct tasks with stable ids ``ingest-filings-10-k`` /
    ``ingest-filings-10-q``.

    The caller owns the surrounding stages — setup, analyze, compose,
    maintain. This helper only fills the ingest portion of the DAG.
    """
    # Lazy imports — keep planner.py importable in contexts where the
    # data-source registry / skill loader haven't been initialized yet.
    from compass.data_sources import find_producer
    from compass.skills import load_skill
    from compass.universe import ticker_region

    try:
        compose = load_skill(compose_skill_slug)
    except FileNotFoundError:
        return []

    today = date.today().isoformat()
    ticker = engagement.ticker
    region = ticker_region(ticker)
    deps = list(depends_on or [])
    out: list[Task] = []
    seen_ids: set[str] = set()

    for need in compose.needs:
        m = _NEED_RE.match(need.strip())
        if not m:
            continue
        category = m.group(1).lower()
        arg = (m.group(2) or "").strip() or None

        ds = find_producer(category)
        if ds is None:
            continue  # No producer registered for this category — skip.

        # Region gate — if the producer declares supported regions and the
        # ticker's region isn't in that list, don't even plan the task.
        # An empty regions list means "universal" (default for Yahoo /
        # Wikipedia producers).
        if not ds.supports_region(region):
            continue

        # Confirm the producer is an ingest-stage skill. (Future-proofs
        # against analyze-stage skills declaring ``produces:`` later.)
        try:
            producer = load_skill(ds.producer_skill)
        except FileNotFoundError:
            continue
        if producer.phase != "ingest":
            continue

        # Stable task id. Parameterized needs append the slug-safe arg so
        # `filings(10-K)` + `filings(10-Q)` get distinct ids.
        if arg:
            arg_slug = re.sub(r"[^a-z0-9]+", "-", arg.lower()).strip("-") or "arg"
            task_id = f"ingest-{category}-{arg_slug}"
            title = f"Fetch {ticker} latest {arg}"
            params: dict = {"limit": 1}
            # The producer's declared params drive what we pass through.
            # Today the only param-aware producer is fetch-sec-filing
            # with ``form``; this generalizes cleanly when more arrive.
            for p in ds.params:
                params[p] = arg
        else:
            task_id = f"ingest-{category}"
            title = f"{category.replace('-', ' ').title()} for {ticker}"
            params = {}

        if task_id in seen_ids:
            continue
        seen_ids.add(task_id)

        # Output path: substitute what we know; leave producer-only
        # placeholders (like ``{accession}``) unfilled so they don't
        # appear in tasks.json as garbled text. If anything remains
        # unsubstituted, drop the path — the producer's run.py will
        # write to its conventional location anyway.
        artifact_path: str | None = None
        if ds.output_pattern:
            substituted = ds.output_pattern
            for marker, value in (("{date}", today), ("{ticker}", ticker), ("{form}", arg or "")):
                substituted = substituted.replace(marker, value)
            if "{" not in substituted:
                artifact_path = substituted

        out.append(Task(
            id=task_id,
            stage="ingest",
            title=title,
            skill=ds.producer_skill,
            priority=default_priority,
            task_type="ingestion",
            params=params,
            artifact_path=artifact_path,
            depends_on=list(deps),
        ))

    return out


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

    The returned function builds:

    * **setup-brief** — always (the brief is the planning frame).
    * **ingest** — derived from the compose skill's ``needs:`` via the
      data-source registry. Drop a new ``fetch-*`` skill that produces a
      category the persona already needs, and the next plan picks it up
      automatically — no Python change.
    * **analyze** — hardcoded recipe (parse-10k-segments + extract-kpis),
      conditional on the compose skill having declared the relevant
      categories AND the ingest having generated the upstream task. The
      analyze stage will move to a registry the same way ingest did,
      once compose skills consistently declare ``segments``/``kpis``
      categories in their needs.
    * **compose** — one task invoking ``skill_slug``.
    * **maintain-update-brief** — propagate findings back.

    Hand-authored persona templates (``buffett-pitch``) take precedence
    over this factory at registration time.
    """
    display = person_name or skill_slug

    def _pitch(engagement: Engagement) -> list[Task]:
        from compass.skills import load_skill

        t = engagement.ticker
        tasks: list[Task] = []

        # --- Setup ---------------------------------------------------------
        tasks.append(Task(
            id="setup-brief",
            stage="setup",
            title=f"Build coverage brief for {t}",
            skill="build-coverage-brief",
            priority="high",
            task_type="planning",
            artifact_path=".pipeline/docs/coverage_brief.json",
        ))

        # --- Ingest — registry-derived from the persona's `needs:` --------
        # Auto-derivation: the compose skill declares the categories it
        # wants surfaced; the registry maps those to producer skills; we
        # stamp out the matching ingest tasks. Adding a new producer
        # (e.g. fetch-transcripts) lights up here automatically as long
        # as the persona's needs list includes the category.
        ingest_tasks = auto_ingest_tasks(
            compose_skill_slug=skill_slug,
            engagement=engagement,
            depends_on=["setup-brief"],
        )
        # Prioritize the 10-K higher than the others — analyze-segments
        # depends on it and downstream tasks block waiting for it.
        for it in ingest_tasks:
            if it.id == "ingest-filings-10-k":
                it.priority = "high"
        tasks.extend(ingest_tasks)
        ingest_ids = {it.id for it in ingest_tasks}

        # Load the persona's compose skill so we can gate analyze + the
        # compose dependency list on what categories it actually declared.
        try:
            compose = load_skill(skill_slug)
            compose_needs_str = " ".join(compose.needs)
        except FileNotFoundError:
            compose_needs_str = ""

        # --- Analyze (still hardcoded — gated on declared needs) ----------
        analyze_ids: list[str] = []
        wants_segments = "segments" in compose_needs_str
        wants_kpis = "kpis" in compose_needs_str
        if wants_segments and "ingest-filings-10-k" in ingest_ids:
            tasks.append(Task(
                id="analyze-segments", stage="analyze",
                title="Parse 10-K into structured sections",
                skill="parse-10k-segments", priority="high", task_type="analysis",
                depends_on=["ingest-filings-10-k"],
            ))
            analyze_ids.append("analyze-segments")
        if wants_kpis:
            kpi_deps = list(analyze_ids)
            if "ingest-snapshots" in ingest_ids:
                kpi_deps.append("ingest-snapshots")
            tasks.append(Task(
                id="analyze-kpis", stage="analyze",
                title="Extract KPIs into a structured table",
                skill="extract-kpis", priority="high", task_type="analysis",
                artifact_path=f"analysis/kpis/{t}__kpis.json",
                depends_on=kpi_deps,
            ))
            analyze_ids.append("analyze-kpis")

        # --- Compose ------------------------------------------------------
        # Depend on whichever analyze tasks ran + any news ingest (so the
        # agent sees fresh headlines when composing). Falls back to
        # setup-brief if nothing else was generated.
        compose_deps = analyze_ids[:]
        if "ingest-news" in ingest_ids and "ingest-news" not in compose_deps:
            compose_deps.append("ingest-news")
        if not compose_deps:
            compose_deps = ["setup-brief"]
        tasks.append(Task(
            id=f"compose-{skill_slug}",
            stage="compose",
            title=f"{display} analysis for {t}",
            skill=skill_slug,
            priority="high",
            task_type="writing",
            params={"path": "B", "memo_type": f"{skill_slug}-pitch"},
            artifact_path=f"memos/{skill_slug}-pitch/{_run_stamp()}.md",
            depends_on=compose_deps,
            description=(
                f"Apply {display}'s full framework end-to-end. Read the "
                f"brief and all available ingested artifacts (filings, "
                f"snapshot, news, plus anything else the data-source "
                f"registry surfaced). Produce a structured pitch memo "
                f"that follows the skill's Standard Output Format."
            ),
        ))

        # --- Maintain -----------------------------------------------------
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
    """Initial-coverage pitch memo. Ingest is registry-derived so SEC tasks
    don't get planned for EU tickers; analyze stages are conditional on
    what was actually ingested; compose runs section-by-section regardless.
    """
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

    # --- Ingest — registry-derived from draft-memo-section's needs --------
    # SEC-only producers (fetch-sec-filing) declare ``regions: [US]`` so
    # the planner doesn't stamp an ``ingest-filings-10-k`` for AKSO.OL.
    # Yahoo and Wikipedia producers are universal — they always show up.
    ingest_tasks = auto_ingest_tasks(
        compose_skill_slug="draft-memo-section",
        engagement=engagement,
        depends_on=["setup-brief"],
    )
    # Bump 10-K to high priority — analyze-segments waits on it.
    for it in ingest_tasks:
        if it.id == "ingest-filings-10-k":
            it.priority = "high"
    tasks.extend(ingest_tasks)
    ingest_ids = {it.id for it in ingest_tasks}

    # --- Analyze — conditional on what actually got planned ---------------
    analyze_ids: list[str] = []
    if "ingest-filings-10-k" in ingest_ids:
        tasks.append(Task(
            id="analyze-segments",
            stage="analyze",
            title="Parse 10-K into structured sections",
            skill="parse-10k-segments",
            priority="high",
            task_type="analysis",
            depends_on=["ingest-filings-10-k"],
            description="Split the 10-K markdown into Business / MD&A / Risk Factors / Financials artifacts.",
        ))
        analyze_ids.append("analyze-segments")

    # KPIs need at least the snapshot to be useful. segments is a bonus.
    if "ingest-snapshots" in ingest_ids:
        kpi_deps = list(analyze_ids)
        kpi_deps.append("ingest-snapshots")
        tasks.append(Task(
            id="analyze-kpis",
            stage="analyze",
            title="Extract KPIs into a structured table",
            skill="extract-kpis",
            priority="high",
            task_type="analysis",
            artifact_path=f"analysis/kpis/{t}__kpis.json",
            depends_on=kpi_deps,
            description="Pull revenue, margin, cash, and debt for the last 2-3 reporting periods.",
        ))
        analyze_ids.append("analyze-kpis")

    # Gate runs only when there's actually something to gate against.
    if analyze_ids:
        tasks.append(Task(
            id="analyze-gate",
            stage="analyze",
            title="Quality gate: brief vs evidence coverage",
            skill="gate-coverage-check",
            priority="medium",
            task_type="review",
            artifact_path="analysis/gates/coverage-check.json",
            depends_on=list(analyze_ids),
            description="Verify every key question in the brief is supported by an artifact.",
        ))
        analyze_ids.append("analyze-gate")

    # --- Compose -----------------------------------------------------------
    # Sections depend on the gate (if it ran) else on the analyze tasks
    # (if any ran) else on whatever ingested. Always have something.
    if "analyze-gate" in analyze_ids:
        section_deps = ["analyze-gate"]
    elif analyze_ids:
        section_deps = list(analyze_ids)
    else:
        section_deps = list(ingest_ids) or ["setup-brief"]

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
            depends_on=list(section_deps),
            description=f"Write the '{label}' section using the brief and any analyze-phase artifacts. Cite paths.",
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


# ``buffett-pitch`` is intentionally NOT hand-authored — the persona
# factory (_make_persona_pitch_template) generates it from the buffett
# compose skill's ``needs:``. That way Buffett picks up any new producer
# the registry adds (e.g. ``overview`` via fetch-wikipedia-overview) the
# same way Munger and Ray already do. The hand-authored version used to
# live here; deleted on the registry refactor so it doesn't drift.
#
# ``buffett-quick-filter`` and ``buffett-sell-check`` stay hand-authored
# because their compose phase is meaningfully different from the standard
# pitch shape (different params, lighter data spine, no analyze stage).


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
# Idea exploration (master-agent trading-idea workflow)
# ---------------------------------------------------------------------------


@template("idea-exploration")
def _idea_exploration(engagement: Engagement) -> list[Task]:
    """A non-ticker workflow: PM hands the master agent a trading theme
    (capex slowdown, obesity-drug fade, offshore E&P pair trades, ...);
    we run a 4-task pipeline that frames it, surveys the open web,
    inventories the pod's existing memos, and generates a trading-idea
    memo with two sections (existing relevant ideas + new ideas).

    The engagement key (``engagement.ticker``) is a synthetic theme slug
    — usually ``IDEA-<short-slug>`` — and the engagement is filed under a
    ``house`` analyst so it doesn't pollute any real analyst's coverage
    tree. None of the ticker-keyed producers (SEC, Yahoo, …) run for this
    template; everything here is theme-keyed.

    The PM's raw framing message is threaded in via ``frame-theme``'s
    ``params.theme``, set by the chat caller (``run_idea_exploration_for_chat``).
    """
    theme_slug = engagement.ticker  # caller already set this to the theme slug
    tasks: list[Task] = []

    tasks.append(Task(
        id="frame-theme",
        stage="setup",
        title=f"Frame the theme: {theme_slug}",
        skill="frame-theme",
        priority="high",
        task_type="planning",
        params={"theme_slug": theme_slug},  # ``theme`` text injected by chat caller
        artifact_path=".pipeline/docs/theme.json",
        description=(
            "Capture the PM's free-form theme as .pipeline/docs/theme.json. "
            "The survey, inventory, and idea-generation skills all read this."
        ),
    ))

    tasks.append(Task(
        id="survey-theme",
        stage="ingest",
        title=f"Open-web survey on {theme_slug}",
        skill="survey-theme",
        priority="high",
        task_type="ingestion",
        artifact_path="corpus/research/survey.md",
        depends_on=["frame-theme"],
        description=(
            "Run an open-web survey (WebSearch + WebFetch) on the theme. "
            "Primary sources first; cite every claim; surface key findings, "
            "contested areas, and the names that come up repeatedly."
        ),
    ))

    tasks.append(Task(
        id="inventory-existing-ideas",
        stage="analyze",
        title="Inventory existing pod memos",
        skill="inventory-existing-ideas",
        priority="medium",
        task_type="analysis",
        artifact_path="analysis/existing-memos.json",
        depends_on=["frame-theme"],
        description=(
            "Walk every analyst × ticker engagement on disk and produce a "
            "flat JSON index of memos. The ideation skill picks the relevant "
            "ones to quote in the final output."
        ),
    ))

    tasks.append(Task(
        id="generate-trading-ideas",
        stage="compose",
        title=f"Generate trading-idea memo for {theme_slug}",
        skill="generate-trading-ideas",
        priority="high",
        task_type="writing",
        artifact_path=f"memos/ideas/{_run_stamp()}.md",
        depends_on=["survey-theme", "inventory-existing-ideas"],
        description=(
            "Synthesize the survey + existing-pod-memos inventory into a "
            "trading-idea memo. Two sections: existing pod ideas relevant "
            "to the theme, then 3–6 new trading ideas with rationale and risks."
        ),
    ))

    return tasks


@template("academic-exploration")
def _academic_exploration(engagement: Engagement) -> list[Task]:
    """Same shape as ``idea-exploration`` but the survey reads academic
    literature (arXiv, Semantic Scholar, SSRN) instead of the open web.

    The downstream ideation skill is the same — `generate-trading-ideas`
    reads ``corpus/research/survey.md`` and doesn't care which surveyor
    wrote it. That's intentional: the PM gets trading ideas regardless
    of which lens they wanted the survey through; the lens just changes
    what evidence is on the table.
    """
    theme_slug = engagement.ticker
    tasks: list[Task] = []

    tasks.append(Task(
        id="frame-theme",
        stage="setup",
        title=f"Frame the theme: {theme_slug}",
        skill="frame-theme",
        priority="high",
        task_type="planning",
        params={"theme_slug": theme_slug},
        artifact_path=".pipeline/docs/theme.json",
        description=(
            "Capture the PM's free-form theme as .pipeline/docs/theme.json. "
            "The academic survey, inventory, and idea-generation skills "
            "all read this."
        ),
    ))

    tasks.append(Task(
        id="survey-academic",
        stage="ingest",
        title=f"Academic-literature survey on {theme_slug}",
        skill="survey-academic",
        priority="high",
        task_type="ingestion",
        artifact_path="corpus/research/survey.md",
        depends_on=["frame-theme"],
        description=(
            "Survey arXiv q-fin, Semantic Scholar, and SSRN for what the "
            "research community has published on the theme. Cite every "
            "finding; quote effect sizes; surface contested results."
        ),
    ))

    tasks.append(Task(
        id="inventory-existing-ideas",
        stage="analyze",
        title="Inventory existing pod memos",
        skill="inventory-existing-ideas",
        priority="medium",
        task_type="analysis",
        artifact_path="analysis/existing-memos.json",
        depends_on=["frame-theme"],
        description=(
            "Walk every analyst × ticker engagement on disk and produce a "
            "flat JSON index of memos so the ideation skill can quote prior "
            "pod work alongside the academic findings."
        ),
    ))

    tasks.append(Task(
        id="generate-trading-ideas",
        stage="compose",
        title=f"Generate trading-idea memo for {theme_slug}",
        skill="generate-trading-ideas",
        priority="high",
        task_type="writing",
        artifact_path=f"memos/ideas/{_run_stamp()}.md",
        depends_on=["survey-academic", "inventory-existing-ideas"],
        description=(
            "Synthesize the academic survey + existing-pod-memos inventory "
            "into a trading-idea memo. Two sections: existing pod ideas "
            "relevant to the theme, then 3–6 new trading ideas with rationale "
            "and risks. Lean on the effect sizes the survey quoted."
        ),
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
