"""Shared helpers for agent-runner skills.

Agent-mode skills all do the same outer dance: build a system prompt
(SKILL.md body + task context), open a ``claude-agent-sdk`` query loop
with the right tools and hook, stream assistant text + tool calls to
stderr, and return what the agent produced. This module centralizes that
loop, plus the **universal runner** :func:`run_agent_skill_default` that
drives any SKILL.md-only skill from frontmatter alone (no per-skill
``scripts/run.py``).

Two layers:

* :func:`run_agent_skill` — the low-level SDK loop. Used by hand-written
  skill ``run.py`` files (legacy) and by the universal runner.
* :func:`run_agent_skill_default` — resolves ``spec.needs`` to artifacts,
  picks the output path, builds the user prompt, and calls
  :func:`run_agent_skill`. This is what the dispatcher invokes when a
  skill has no ``run.py``.
"""

from __future__ import annotations

import re
import sys
import time
from datetime import date as _date
from pathlib import Path
from typing import Any, Callable

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    HookMatcher,
    TextBlock,
    query,
)

from compass.engagement import Engagement, Task
from compass.skills import SkillSpec
from compass.tools import make_tool_logger

DEFAULT_MODEL = "claude-sonnet-4-6"


async def run_agent_skill(
    *,
    spec: SkillSpec,
    engagement: Engagement,
    user_prompt: str,
    extra_dirs: list[Path] | None = None,
    max_turns: int = 30,
    on_event: Callable[[dict[str, Any]], None] | None = None,
    extra_allowed_tools: list[str] | None = None,
) -> str:
    """Run an agent-mode skill end-to-end. Returns the final assistant text.

    The agent gets:
    - System prompt: the skill's SKILL.md body.
    - User prompt: ``user_prompt`` (task-specific instructions, paths, etc.).
    - Tools: ``spec.allowed_tools`` plus ``extra_allowed_tools``.
    - Working directory access: the engagement root, plus any ``extra_dirs``.
    - PreToolUse hook: streams to stderr and appends to ``.pipeline/run.log``.
    """
    started_at = time.monotonic()
    tools = list(spec.allowed_tools) + list(extra_allowed_tools or [])
    add_dirs: list[str] = [str(engagement.root)]
    for d in extra_dirs or []:
        add_dirs.append(str(d))

    model = spec.model or DEFAULT_MODEL
    print(
        f"[   0.0s] [{spec.slug}] starting (model {model}, tools {tools})",
        flush=True,
        file=sys.stderr,
    )
    engagement.log_event(
        {
            "type": "skill_start",
            "skill": spec.slug,
            "model": model,
            "tools": tools,
        }
    )

    # Fold the analyst's persona into the system prompt so the skill body
    # (framework) and the persona (voice/style) both inform the output.
    # Empty persona ⇒ unchanged behaviour for non-pack analysts and CLI
    # runs without an analyst record on disk.
    system_prompt = spec.body
    if engagement.persona:
        system_prompt = (
            f"{spec.body}\n\n"
            f"---\n\n"
            f"# Voice and style for this run\n\n"
            f"You are this analyst:\n\n{engagement.persona}\n\n"
            f"Write the entire output in their voice while applying the "
            f"framework above. The framework dictates *what* you analyse "
            f"and *how* it's structured; the persona dictates *how it "
            f"reads*. If there's tension, stay in voice — a memo that "
            f"sounds like a generic analyst defeats the point of hiring "
            f"this persona."
        )

    options = ClaudeAgentOptions(
        model=model,
        system_prompt=system_prompt,
        tools=tools,
        allowed_tools=tools,
        add_dirs=add_dirs,
        hooks={
            "PreToolUse": [
                HookMatcher(hooks=[make_tool_logger(
                    started_at,
                    engagement=engagement,
                    session_id=spec.slug,
                    on_event=on_event,
                )])
            ],
        },
        max_turns=max_turns,
    )

    # Run the SDK loop in a worker thread with its own fresh asyncio loop.
    # Reason: when this helper is invoked from inside uvicorn's running
    # ProactorEventLoop on Windows, anyio's subprocess-spawn raises
    # NotImplementedError. Same fix we already use in compass.llm — keep
    # the SDK isolated from whatever loop the caller is on.
    import asyncio

    text = await asyncio.to_thread(
        _run_skill_sync,
        spec.slug, user_prompt, options, started_at, on_event,
    )

    elapsed = time.monotonic() - started_at
    print(
        f"[{elapsed:6.1f}s] [{spec.slug}] done",
        flush=True,
        file=sys.stderr,
    )
    engagement.log_event(
        {
            "type": "skill_done",
            "skill": spec.slug,
            "elapsed": round(elapsed, 2),
        }
    )
    return text


def _run_skill_sync(
    skill_slug: str,
    user_prompt: str,
    options: "ClaudeAgentOptions",
    started_at: float,
    on_event: Callable[[dict[str, Any]], None] | None,
) -> str:
    """Worker-thread entry point: runs the SDK query loop on its own loop.

    Returns the concatenated assistant text. Streams ``say`` events back
    through ``on_event`` (which must be thread-safe — the SSE bridge's
    queue.Queue.put already is)."""
    import asyncio
    import os

    os.environ.setdefault("CLAUDE_AGENT_SDK_SKIP_VERSION_CHECK", "1")

    async def _inner() -> str:
        text_parts: list[str] = []
        event_count = 0
        async for message in query(prompt=user_prompt, options=options):
            event_count += 1
            if event_count == 1:
                # Diagnostic: confirm the SDK produced its first event.
                # Hangs before this line mean subprocess-spawn is stuck;
                # hangs after it usually mean the model is taking long
                # or stuck in a tool loop (visible in PreToolUse logs).
                elapsed_now = time.monotonic() - started_at
                print(
                    f"[{elapsed_now:6.1f}s] [{skill_slug}] first SDK event ({type(message).__name__})",
                    flush=True,
                    file=sys.stderr,
                )
            if not isinstance(message, AssistantMessage):
                continue
            for block in message.content:
                if not isinstance(block, TextBlock) or not block.text.strip():
                    continue
                elapsed_now = time.monotonic() - started_at
                preview = block.text.strip()[:160]
                print(
                    f"[{elapsed_now:6.1f}s] [{skill_slug}] [say] {preview}",
                    flush=True,
                    file=sys.stderr,
                )
                text_parts.append(block.text)
                if on_event is not None:
                    try:
                        on_event({
                            "ts": time.time(),
                            "type": "say",
                            "elapsed": elapsed_now,
                            "message": preview,
                        })
                    except Exception:  # noqa: BLE001
                        pass
        return "".join(text_parts).strip()

    return asyncio.run(_inner())


# ---------------------------------------------------------------------------
# Universal agent-skill runner — drives SKILL.md-only skills
# ---------------------------------------------------------------------------

# Category → engagement-relative glob patterns. Each name in a skill's
# ``needs:`` resolves through this table; unknown categories resolve to an
# empty file list so the dispatcher doesn't blow up when a SKILL.md
# references a category we haven't taught Compass about yet.
_CATEGORY_GLOBS: dict[str, list[str]] = {
    "brief":       [".pipeline/docs/coverage_brief.json"],
    "tasks":       [".pipeline/tasks.json"],
    "filings":     ["corpus/filings/**/primary.md"],
    "snapshots":   ["corpus/snapshots/**/*.md"],
    "transcripts": ["corpus/transcripts/**/*.md"],
    "news":        ["corpus/news/**/*.json"],
    "insider":     ["corpus/ownership/insider-*.json"],
    "holdings":    ["corpus/ownership/institutional-*.json"],
    "earnings":    ["corpus/earnings/**/*.json"],
    "segments":    ["analysis/segments/**/*.md"],
    "kpis":        ["analysis/kpis/**/*.json"],
    "sections":    ["analysis/sections/**/*.md"],
    "gates":       ["analysis/gates/**/*.json"],
    "memos":       ["memos/**/*.md"],
    "corpus":      ["corpus/**/*.md", "corpus/**/*.json"],
    "analysis":    ["analysis/**/*.md", "analysis/**/*.json"],
}

# ``name`` or ``name(arg)`` — the arg is currently used only by
# ``filings(<FORM>)`` to narrow to one filing type.
_NEED_RE = re.compile(r"^([a-zA-Z_-]+)(?:\(([^)]+)\))?$")


def _resolve_needs(spec: SkillSpec, engagement: Engagement) -> dict[str, list[Path]]:
    """For each declared need, find matching files under ``engagement.root``.

    Returns ``{need_string: [absolute_path, ...]}`` with each list sorted
    and deduped. Unknown categories resolve to an empty list — the skill
    still runs; the agent just sees "(none yet)" for that section.
    """
    out: dict[str, list[Path]] = {}
    root = engagement.root
    for need in spec.needs:
        m = _NEED_RE.match(need.strip())
        if not m:
            out[need] = []
            continue
        name = m.group(1).lower()
        arg = m.group(2)
        patterns = _CATEGORY_GLOBS.get(name)
        if patterns is None:
            out[need] = []
            continue
        if arg and name == "filings":
            patterns = [f"corpus/filings/{arg}/**/primary.md"]
        found: list[Path] = []
        for pattern in patterns:
            found.extend(root.glob(pattern))
        seen: set[Path] = set()
        deduped: list[Path] = []
        for p in sorted(found):
            if p in seen or not p.is_file():
                continue
            seen.add(p)
            deduped.append(p)
        out[need] = deduped
    return out


def _resolve_output(
    spec: SkillSpec, task: Task, engagement: Engagement,
) -> Path | None:
    """Pick the output path for this task.

    Precedence:

    1. ``task.artifact_path`` — the planner's explicit choice wins.
    2. ``spec.output`` with ``{date}``/``{ticker}``/``{analyst}`` substitution.
    3. ``None`` — read-only skill (e.g. a quick filter that only chats back).
    """
    if task.artifact_path:
        return engagement.artifact_path(task.artifact_path)
    if spec.output:
        # Substitute the engagement-level vars + everything in task.params, so
        # parametric outputs like ``analysis/sections/{ticker}__{memo_type}__{section_slug}.md``
        # resolve when the planner has set those params. Missing keys fall
        # back to the raw template — the planner's ``task.artifact_path``
        # usually wins anyway and frontmatter ``output:`` is mostly docs.
        fmt_vars: dict[str, Any] = {
            "date": _date.today().isoformat(),
            "ticker": engagement.ticker,
            "analyst": engagement.analyst_slug,
            **(task.params or {}),
        }
        try:
            substituted = spec.output.format(**fmt_vars)
        except (KeyError, IndexError):
            substituted = spec.output
        return engagement.artifact_path(substituted)
    return None


def _build_default_user_prompt(
    spec: SkillSpec,
    engagement: Engagement,
    task: Task,
    artifacts: dict[str, list[Path]],
    output_path: Path | None,
) -> str:
    """Assemble the per-task user prompt for a SKILL.md-only skill.

    The agent's system prompt is the SKILL.md body (set by
    :func:`run_agent_skill`). The user prompt below adds the *runtime*
    context the skill body can't know in advance: which engagement, which
    ticker, what artifacts are actually on disk, where to write.
    """
    parts: list[str] = [
        f"You are running the {spec.name} skill for {engagement.ticker} "
        f"(analyst: {engagement.analyst_slug}).",
        "",
        f"Engagement root: {engagement.root}",
    ]
    # The references/ directory (if present) is accessible because the
    # caller adds spec.path to add_dirs — surface its location so the
    # agent doesn't have to guess.
    if spec.references_dir.exists():
        parts.append(f"Skill references: {spec.references_dir}")

    if task.description:
        parts.append("")
        parts.append(f"Task context: {task.description}")

    if task.params:
        # Surface params (memo_type, section_order, query, etc.) as JSON so
        # the skill can switch on them without each runner reinventing this.
        import json
        parts.append("")
        parts.append("Task parameters:")
        parts.append("```json")
        parts.append(json.dumps(task.params, indent=2, ensure_ascii=False))
        parts.append("```")

    if spec.needs:
        parts.append("")
        parts.append("# Available artifacts under the engagement root")
        parts.append("")
        parts.append(
            "Read what you need with the Read tool — paths below are relative "
            "to the engagement root."
        )
        parts.append("")
        for need in spec.needs:
            files = artifacts.get(need, [])
            parts.append(f"## {need}")
            if not files:
                parts.append("  (none yet)")
            else:
                for f in files:
                    parts.append(f"  - {engagement.relative(f)}")

    if output_path is not None:
        parts.append("")
        parts.append("# Your output")
        parts.append("")
        parts.append(
            "Write your result to this absolute path using the Write tool:"
        )
        parts.append(f"    {output_path}")

    parts.append("")
    parts.append(
        "When you're done, reply with one or two sentences summarizing what "
        "you produced."
    )
    return "\n".join(parts)


async def run_agent_skill_default(
    *,
    spec: SkillSpec,
    engagement: Engagement,
    task: Task,
    on_event: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Drive a SKILL.md-only skill from frontmatter alone.

    Resolves ``spec.needs`` to a list of artifact paths under
    ``engagement.root``, computes the output path
    (``task.artifact_path > spec.output``), builds the user prompt, and
    runs the SDK loop via :func:`run_agent_skill`. Auto-adds ``Write`` to
    the allowed tools when an output path is set; passes the skill's own
    directory through ``extra_dirs`` so ``references/`` is readable.

    Returns ``{"skill", "reply", "artifact"?, "warning"?}``. The
    ``artifact`` key is set when the skill was supposed to write output;
    a ``warning`` is added if it didn't.
    """
    artifacts = _resolve_needs(spec, engagement)
    output_path = _resolve_output(spec, task, engagement)
    user_prompt = _build_default_user_prompt(
        spec, engagement, task, artifacts, output_path,
    )

    extra_tools: list[str] = []
    if output_path is not None and "Write" not in spec.allowed_tools:
        extra_tools.append("Write")

    extra_dirs: list[Path] = []
    if spec.path.exists():
        extra_dirs.append(spec.path)

    text = await run_agent_skill(
        spec=spec,
        engagement=engagement,
        user_prompt=user_prompt,
        extra_dirs=extra_dirs or None,
        max_turns=spec.max_turns,
        on_event=on_event,
        extra_allowed_tools=extra_tools or None,
    )

    result: dict[str, Any] = {"skill": spec.slug, "reply": text}
    if output_path is not None:
        rel = engagement.relative(output_path)
        result["artifact"] = rel
        if not output_path.exists():
            result["warning"] = f"skill did not write expected output: {rel}"
    return result
