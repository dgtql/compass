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
    """Parsed SKILL.md frontmatter + body + filesystem location."""

    slug: str
    name: str
    description: str
    phase: str                       # setup | ingest | analyze | compose | maintain
    runner: str                      # 'deterministic' | 'agent'
    allowed_tools: list[str]         # tool names enabled for agent runner
    model: str | None
    body: str                        # SKILL.md content after frontmatter
    path: Path                       # absolute path to the skill directory

    @property
    def scripts_dir(self) -> Path:
        return self.path / "scripts"

    @property
    def run_py(self) -> Path:
        return self.scripts_dir / "run.py"


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
    """Load one skill by slug. Raises if missing or malformed."""
    skill_dir = SKILLS_DIR / slug
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        raise FileNotFoundError(
            f"skill not found: {slug} (looked for {skill_md})"
        )
    text = skill_md.read_text(encoding="utf-8")
    front, body = _split_frontmatter(text)
    meta = _parse_frontmatter(front)
    return SkillSpec(
        slug=slug,
        name=meta.get("name", slug),
        description=meta.get("description", ""),
        phase=meta.get("phase", "compose"),
        runner=meta.get("runner", "deterministic"),
        allowed_tools=_split_list(meta.get("allowed-tools", "")),
        model=meta.get("model") or None,
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


def _parse_frontmatter(text: str) -> dict[str, str]:
    """Parse a key:value-per-line frontmatter (no nesting). Values are strings."""
    out: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        out[key.strip()] = value.strip().strip("'\"")
    return out


def _split_list(value: str) -> list[str]:
    """Split a frontmatter list value (comma-, space-, or whitespace-separated)."""
    if not value:
        return []
    parts = [p.strip() for chunk in value.split(",") for p in chunk.split()]
    return [p for p in parts if p]
