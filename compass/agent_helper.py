"""Shared helpers for agent-runner skills.

Agent-mode skills all do the same outer dance: build a system prompt
(SKILL.md body + task context), open a ``claude-agent-sdk`` query loop
with the right tools and hook, stream assistant text + tool calls to
stderr, and return what the agent produced. This module centralizes that
loop so each skill's ``run.py`` stays focused on its prompt and
post-processing.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Any, Callable

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    HookMatcher,
    TextBlock,
    query,
)

from compass.engagement import Engagement
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

    options = ClaudeAgentOptions(
        model=model,
        system_prompt=spec.body,
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
