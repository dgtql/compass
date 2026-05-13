"""Chat LLM wiring.

Two auth paths, tried in order:

1. **API key** (``ANTHROPIC_API_KEY`` in env or ``.env``) — direct call
   to the Anthropic Messages API via the official ``anthropic`` SDK.
   Cleanest multi-turn shape, no extra binaries needed.
2. **Claude Code OAuth** (the ``claude`` CLI logged in) — call through
   ``claude-agent-sdk``, which spawns the ``claude`` CLI subprocess
   under the hood. Free if you're already logged in; requires the
   ``claude`` binary to be on the API process's PATH.

If neither works the error bubbles up and is surfaced inline in the
chat ("couldn't reach the LLM — …").

Per-owner system prompts shape the voice:

* ``master``    → the master agent: routes work, synthesizes across the pod.
* analyst slug → that analyst's persona + sector + coverage.

No tools yet — pure text chat. Hooking the analyst skills (fetch-filing,
web-research, etc.) into the chat agent comes later; for now the chat
just produces a reasoned reply, and longer-running research flows happen
through the slice-18 dispatcher.
"""

from __future__ import annotations

import os
from functools import lru_cache

from compass.analysts import get_analyst, list_analysts
from compass.chats import Session

DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_MAX_TOKENS = 1024


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------


def build_system_prompt(owner_key: str) -> str:
    if owner_key == "master":
        return _master_system_prompt()
    return _analyst_system_prompt(owner_key)


def _master_system_prompt() -> str:
    analysts = list_analysts()
    if analysts:
        roster = "\n".join(
            f"- {a.name} ({a.title}) · sector: {a.sector} · "
            f"coverage: {', '.join(a.coverage) if a.coverage else '(none yet)'}"
            for a in analysts
        )
    else:
        roster = "(no analysts hired yet — the PM may not have built a pod)"
    return f"""You are the master agent in Compass — the PM's right hand.

Your job:
- Help the PM understand what's happening across their pod.
- Route work to the analyst best positioned for the question.
- Synthesize across analysts' memos and notes when the PM asks a cross-pod question.
- Answer top-of-stack questions about the PM's universe and engagements.

The PM's current pod:
{roster}

Style:
- Be concise. PMs read fast — short paragraphs and bulleted lists beat prose blocks.
- Inform, don't advise. No 'buy', 'sell', 'we like' — that's not your job.
- When a question should clearly go to a specific analyst, say so explicitly:
  "Maria covers semis — want me to ping her?" — instead of trying to answer yourself.
- If you don't know something, say so. Don't fabricate."""


def _analyst_system_prompt(owner_key: str) -> str:
    analyst = get_analyst(owner_key)
    if analyst is None:
        return (
            "You are a research analyst at Compass. Inform the PM concisely. "
            "Don't make buy/sell recommendations."
        )
    coverage = ", ".join(analyst.coverage) if analyst.coverage else "(no tickers assigned yet)"
    persona = analyst.persona.strip() or "Clear-eyed analyst. Plain English, no superlatives."
    return f"""You are {analyst.name}, {analyst.title} at Compass.

Sector: {analyst.sector}
Coverage: {coverage}

Persona:
{persona}

Style:
- Respond in your voice. Stay concise — PMs read fast.
- Inform, don't advise. No 'buy', 'sell', 'we like'.
- When a number, date, or claim is uncertain, say so.
- If a question is outside your sector or coverage, say so and suggest
  who on the pod would be better positioned."""


# ---------------------------------------------------------------------------
# Reply generation
# ---------------------------------------------------------------------------


async def generate_reply(
    owner_key: str,
    session: Session,
    *,
    model: str | None = None,
    thinking: str | None = None,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> str:
    """Return Claude's reply to the session's latest PM message.

    Tries the API-key path first (cleaner, fewer moving parts); falls back
    to the Claude Code OAuth CLI when no key is set.

    ``model`` defaults to ``DEFAULT_MODEL`` if not supplied. ``thinking``
    is a hint string ("standard" | "extended"); extended thinking is
    surfaced to the Messages API when the API-key path is in use.
    """
    if not session.messages or session.messages[-1].role != "pm":
        return ""

    chosen_model = (model or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    extended = (thinking or "").lower() == "extended"

    if os.environ.get("ANTHROPIC_API_KEY"):
        return _reply_via_messages_api(
            owner_key, session,
            model=chosen_model, max_tokens=max_tokens, extended_thinking=extended,
        )
    return await _reply_via_agent_sdk(owner_key, session, model=chosen_model)


# --- Path 1: anthropic SDK (API key) ----------------------------------------


@lru_cache(maxsize=1)
def _anthropic_client():
    from anthropic import Anthropic
    return Anthropic()


def _reply_via_messages_api(
    owner_key: str,
    session: Session,
    *,
    model: str,
    max_tokens: int,
    extended_thinking: bool = False,
) -> str:
    history: list[dict[str, str]] = []
    for m in session.messages:
        text = (m.text or "").strip()
        if not text:
            continue
        history.append({
            "role": "user" if m.role == "pm" else "assistant",
            "content": text,
        })
    if not history or history[-1]["role"] != "user":
        return ""
    kwargs: dict = {
        "model": model,
        "system": build_system_prompt(owner_key),
        "messages": history,
        "max_tokens": max_tokens,
    }
    if extended_thinking:
        # Enable extended thinking — budget half the response tokens for
        # the chain-of-thought so the user-visible reply still fits.
        kwargs["max_tokens"] = max(max_tokens, 4096)
        kwargs["thinking"] = {"type": "enabled", "budget_tokens": 2048}
    response = _anthropic_client().messages.create(**kwargs)
    parts: list[str] = []
    for block in response.content:
        t = getattr(block, "text", None)
        if isinstance(t, str):
            parts.append(t)
    return "".join(parts).strip()


# --- Path 2: claude-agent-sdk (OAuth via `claude` CLI) ---------------------


async def _reply_via_agent_sdk(owner_key: str, session: Session, *, model: str) -> str:
    """Used when no API key is set. ``claude-agent-sdk.query()`` is
    single-prompt, so we fold the prior conversation into the user prompt
    as a transcript.

    Resolves the ``claude`` CLI path via ``shutil.which`` and passes it
    explicitly to ``ClaudeAgentOptions(cli_path=...)`` so the SDK doesn't
    fail with "Failed to start Claude Code" when its internal lookup
    misses the binary (a common Windows quirk where PowerShell finds
    ``claude.EXE`` but Python's subprocess doesn't auto-append .EXE).
    """
    import shutil
    from claude_agent_sdk import (
        AssistantMessage,
        ClaudeAgentOptions,
        TextBlock,
        query,
    )

    cli_path = _resolve_claude_cli()
    stderr_buf: list[str] = []

    prompt = _build_prompt_from_history(session)
    options_kwargs: dict = {
        "model": model,
        "system_prompt": build_system_prompt(owner_key),
        "stderr": stderr_buf.append,  # capture SDK errors for diagnostics
    }
    if cli_path:
        options_kwargs["cli_path"] = cli_path

    try:
        options = ClaudeAgentOptions(**options_kwargs)
        text_parts: list[str] = []
        async for message in query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        text_parts.append(block.text)
        return "".join(text_parts).strip()
    except Exception as exc:
        # Re-raise with stderr appended so the user sees what really went wrong.
        if stderr_buf:
            tail = "\n".join(stderr_buf)[-500:]
            raise RuntimeError(f"{exc} — claude stderr:\n{tail}") from exc
        raise


def _resolve_claude_cli() -> str | None:
    """Return an explicit path to the ``claude`` CLI, or None if not found.

    Probes ``shutil.which`` first, then a few well-known Windows install
    locations as fallbacks. Setting this explicitly on the SDK avoids
    the 'Failed to start Claude Code: .' empty-error path.
    """
    import shutil
    import os
    from pathlib import Path

    for name in ("claude", "claude.exe", "claude.cmd"):
        resolved = shutil.which(name)
        if resolved:
            return resolved

    candidates: list[Path] = [
        Path.home() / ".local" / "bin" / "claude.exe",
        Path.home() / ".local" / "bin" / "claude",
    ]
    appdata = os.environ.get("APPDATA")
    if appdata:
        candidates.append(Path(appdata) / "npm" / "claude.cmd")
        candidates.append(Path(appdata) / "npm" / "claude")
    local = os.environ.get("LOCALAPPDATA")
    if local:
        candidates.append(Path(local) / "Programs" / "claude" / "claude.exe")

    for c in candidates:
        if c.exists():
            return str(c)
    return None


def _build_prompt_from_history(session: Session) -> str:
    msgs = [m for m in session.messages if (m.text or "").strip()]
    if not msgs:
        return ""
    if len(msgs) == 1:
        return msgs[0].text.strip()
    history_lines: list[str] = []
    for m in msgs[:-1]:
        speaker = "PM" if m.role == "pm" else "You"
        history_lines.append(f"{speaker}: {m.text.strip()}")
    history = "\n\n".join(history_lines)
    latest = msgs[-1].text.strip()
    return (
        "Previous conversation:\n"
        f"{history}\n\n"
        "Latest message from the PM (respond to this in your voice):\n"
        f"{latest}"
    )
