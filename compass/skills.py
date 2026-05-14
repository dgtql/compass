"""Skill discovery and loading.

A skill is a directory ``skills/<slug>/`` containing:

* ``SKILL.md`` — a Markdown file with YAML-ish frontmatter declaring the
  skill's name, phase, runner, allowed tools, etc., followed by prose
  instructions (which agent-runner skills inject into the system prompt).
* ``scripts/run.py`` (optional but conventional) — exposes an async
  ``run(engagement, task, *, on_event=None) -> dict`` entry the
  dispatcher calls.

The dispatcher hands a skill an :class:`Engagement` and a :class:`Task`;
the skill writes artifacts under ``engagement.root`` and returns a small
dict that ends up in the run log.

Frontmatter is hand-parsed (no PyYAML dependency) for the simple
``key: value`` lines we use — see :func:`_parse_frontmatter`.
"""

from __future__ import annotations

import importlib.util
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Awaitable

import compass

# Repo root → ``skills/`` directory. Works in editable installs; revisit
# packaging when we ship via PyPI.
SKILLS_DIR: Path = Path(compass.__file__).resolve().parent.parent / "skills"


@dataclass
class SkillSpec:
    """Parsed SKILL.md frontmatter + body + filesystem location.

    ``needs`` and ``output`` drive the universal agent-skill runner — they
    let a SKILL.md alone (no per-skill ``scripts/run.py``) describe what
    artifacts the agent should be shown and where it should write its
    result. The planner's ``Task.artifact_path`` still wins when set; the
    skill's ``output`` is the default/docs.

    ``runner`` is inferred at load time when not declared explicitly:
    a skill with no ``scripts/run.py`` is assumed to be an agent skill.
    """

    slug: str
    name: str
    description: str
    phase: str                       # setup | ingest | analyze | compose | maintain
    runner: str                      # 'deterministic' | 'agent'
    allowed_tools: list[str]         # tool names enabled for agent runner
    needs: list[str]                 # artifact categories the agent should be shown
    output: str | None               # default output path pattern ({date}, {ticker} substituted)
    max_turns: int                   # SDK loop budget for agent skills
    model: str | None
    body: str                        # SKILL.md content after frontmatter
    path: Path                       # absolute path to the skill directory

    @property
    def scripts_dir(self) -> Path:
        return self.path / "scripts"

    @property
    def run_py(self) -> Path:
        return self.scripts_dir / "run.py"

    @property
    def references_dir(self) -> Path:
        return self.path / "references"


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------


def list_skills() -> list[SkillSpec]:
    """Discover and parse every skill under ``skills/`` (alphabetical order)."""
    if not SKILLS_DIR.exists():
        return []
    skills: list[SkillSpec] = []
    for entry in sorted(SKILLS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        if entry.name.startswith("_"):
            continue  # _reference/ etc.
        skill_md = entry / "SKILL.md"
        if not skill_md.exists():
            continue
        try:
            skills.append(load_skill(entry.name))
        except Exception:  # noqa: BLE001
            # A broken skill shouldn't take down discovery — skip it.
            continue
    return skills


def load_skill(slug: str) -> SkillSpec:
    """Load one skill by slug. Raises if missing or malformed.

    Inference at load time keeps externally-authored skills (Anthropic-style
    ``SKILL.md`` + ``references/`` with no ``scripts/run.py``) droppable
    into ``skills/<slug>/`` with no Compass-side wrapper:

    - ``runner`` defaults to ``agent`` when no ``scripts/run.py`` exists.
    - ``allowed-tools`` defaults to ``["Read"]`` for agent skills (every
      reference-heavy skill needs at least Read to consult its own files).
    - ``phase`` defaults to ``compose`` — the most common place for an
      external thinking skill to land.
    """
    skill_dir = SKILLS_DIR / slug
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        raise FileNotFoundError(
            f"skill not found: {slug} (looked for {skill_md})"
        )
    text = skill_md.read_text(encoding="utf-8")
    front, body = _split_frontmatter(text)
    meta = _parse_frontmatter(front)

    # allowed-tools and needs accept either a list (YAML block form) or a
    # comma/whitespace-separated string (legacy compact form).
    allowed_tools = _coerce_list(meta.get("allowed-tools", []))
    needs = _coerce_list(meta.get("needs", []))

    has_run_py = (skill_dir / "scripts" / "run.py").exists()
    runner = str(meta.get("runner", "")).strip() or ("deterministic" if has_run_py else "agent")

    if runner == "agent" and not allowed_tools:
        allowed_tools = ["Read"]

    raw_max_turns = meta.get("max_turns") or meta.get("max-turns")
    try:
        max_turns = int(raw_max_turns) if raw_max_turns else 0
    except (TypeError, ValueError):
        max_turns = 0
    if max_turns <= 0:
        max_turns = 30

    output_val = meta.get("output")
    output = str(output_val).strip() if output_val else None

    return SkillSpec(
        slug=slug,
        name=str(meta.get("name", slug)),
        description=str(meta.get("description", "")),
        phase=str(meta.get("phase", "compose")),
        runner=runner,
        allowed_tools=allowed_tools,
        needs=needs,
        output=output,
        max_turns=max_turns,
        model=(str(meta["model"]).strip() if meta.get("model") else None),
        body=body.strip(),
        path=skill_dir,
    )


# ---------------------------------------------------------------------------
# Runner invocation
# ---------------------------------------------------------------------------

# Type alias kept loose — Engagement/Task imported at call sites to avoid a
# circular import with compass.engagement.
RunFn = Callable[..., Awaitable[dict[str, Any]]]


def import_run_function(spec: SkillSpec) -> RunFn:
    """Dynamically import ``skills/<slug>/scripts/run.py:run``."""
    if not spec.run_py.exists():
        raise FileNotFoundError(
            f"skill '{spec.slug}' has no scripts/run.py — cannot dispatch."
        )
    module_name = f"compass_skill_{spec.slug.replace('-', '_')}"
    loader = importlib.util.spec_from_file_location(module_name, spec.run_py)
    if loader is None or loader.loader is None:
        raise ImportError(f"could not load run.py for skill {spec.slug}")
    module = importlib.util.module_from_spec(loader)
    loader.loader.exec_module(module)  # type: ignore[union-attr]
    fn = getattr(module, "run", None)
    if fn is None:
        raise AttributeError(
            f"skill '{spec.slug}' run.py is missing a 'run' coroutine"
        )
    return fn


# ---------------------------------------------------------------------------
# Frontmatter parsing — intentionally minimal
# ---------------------------------------------------------------------------


def _split_frontmatter(text: str) -> tuple[str, str]:
    """Split ``---\\n…\\n---\\n…`` into (frontmatter, body)."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return "", text
    # Find the closing '---'.
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return "\n".join(lines[1:i]), "\n".join(lines[i + 1 :])
    return "", text  # malformed — treat whole file as body


def _parse_frontmatter(text: str) -> dict[str, Any]:
    """Parse a YAML subset rich enough for our SKILL.md frontmatter.

    Supports three value shapes on top of the trivial ``key: value`` case:

    * **Block scalar** — ``key: |`` (preserve newlines) or ``key: >`` (folded
      into spaces), followed by indented continuation lines. Used by
      external skills (e.g. Buffett) for long descriptions.
    * **List** — ``key:`` with no value, followed by ``  - item`` lines.
      Returns ``list[str]``. Used for ``needs:`` and ``allowed-tools:``.
    * **Inline list** — ``key: a, b, c`` or ``key: a b c`` — still legal
      via the string return value; the caller passes it through
      :func:`_coerce_list` when a list is wanted.

    Top-level keys must be unindented. Comments (``#…``) and blank lines
    are ignored. Surrounding quotes on scalar values are stripped.
    """
    out: dict[str, Any] = {}
    lines = text.splitlines()
    i = 0
    n = len(lines)
    while i < n:
        raw = lines[i]
        i += 1
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        # Indented lines aren't top-level keys — they're either continuation
        # content we already consumed, or stray indented content we ignore.
        if raw[:1].isspace():
            continue
        if ":" not in raw:
            continue

        key, _, value = raw.partition(":")
        key = key.strip()
        value = value.strip()

        # ---------- block scalar (| or >) ----------
        if value in ("|", ">"):
            block: list[str] = []
            while i < n:
                nxt = lines[i]
                if not nxt.strip():
                    block.append("")
                    i += 1
                    continue
                if nxt[:1].isspace():
                    block.append(nxt.strip())
                    i += 1
                else:
                    break
            while block and block[-1] == "":
                block.pop()
            out[key] = (" " if value == ">" else "\n").join(block)
            continue

        # ---------- list (empty value followed by `- item` lines) ----------
        if value == "":
            items: list[str] = []
            saw_item = False
            while i < n:
                nxt = lines[i]
                if not nxt.strip():
                    i += 1
                    continue
                if not nxt[:1].isspace():
                    break
                ls = nxt.lstrip()
                if ls.startswith("- "):
                    items.append(ls[2:].strip().strip("'\""))
                    saw_item = True
                    i += 1
                elif ls.startswith("-"):
                    # Tolerate "-item" with no space.
                    items.append(ls[1:].strip().strip("'\""))
                    saw_item = True
                    i += 1
                else:
                    break
            out[key] = items if saw_item else ""
            continue

        # ---------- simple scalar ----------
        out[key] = value.strip("'\"")

    return out


def _coerce_list(value: Any) -> list[str]:
    """Return ``value`` as a clean ``list[str]``.

    Accepts a YAML-parsed list, a comma/whitespace-separated string, or
    ``None``/empty. Whitespace-trims, drops empties, preserves order.
    """
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        return _split_list(value)
    return [str(value).strip()] if str(value).strip() else []


def _split_list(value: str) -> list[str]:
    """Split a frontmatter list value (comma-, space-, or whitespace-separated)."""
    if not value:
        return []
    parts = [p.strip() for chunk in value.split(",") for p in chunk.split()]
    return [p for p in parts if p]
