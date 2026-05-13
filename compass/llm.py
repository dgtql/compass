"""Chat LLM wiring — claude-agent-sdk only.

We route every chat reply through ``claude-agent-sdk.query()`` so the
request inherits the SDK's full Claude Code-style headers, user-agent,
and auth handling. Hitting the Messages API directly with a plain
``Authorization: Bearer …`` OAuth token (even with the
``oauth-2025-04-20`` beta flag) gets rate-limited far more aggressively
than calls routed through the SDK — the API treats anonymous-shaped
OAuth traffic differently from CLI-shaped OAuth traffic.

Auth: still OAuth-only. The SDK reads
``~/.claude/.credentials.json`` itself (or spawns/embeds the ``claude``
binary which does). No ``ANTHROPIC_API_KEY`` path.

Multi-turn: ``query()`` is single-prompt, so we fold prior turns into
the user prompt as a transcript. The system prompt carries the
master-agent / per-analyst voice.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    TextBlock,
    query,
)

from compass.analysts import get_analyst, list_analysts
from compass.chats import Session

DEFAULT_MODEL = "claude-sonnet-4-6"


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


class OAuthUnavailable(RuntimeError):
    """Raised when ``claude-agent-sdk`` reports the Claude Code CLI is not
    reachable. The chat endpoint surfaces this verbatim so the user knows
    to run ``claude /login``."""


async def generate_reply(
    owner_key: str,
    session: Session,
    *,
    model: str | None = None,
    thinking: str | None = None,
    max_turns: int = 4,
) -> str:
    """Return Claude's reply to the session's latest PM message.

    Goes through ``claude-agent-sdk.query()``, which handles auth + headers
    the way the CLI does. ``model`` defaults to Sonnet 4.6; ``thinking``
    (``"standard"`` / ``"extended"``) maps to the SDK's thinking option.
    """
    if not session.messages or session.messages[-1].role != "pm":
        return ""

    chosen_model = (model or DEFAULT_MODEL).strip() or DEFAULT_MODEL

    # Skip the SDK's pre-call version probe — on some Windows setups it
    # hangs or fails during the FastAPI uvicorn worker startup, giving
    # the same empty 'Failed to start Claude Code: .' error we used to
    # hit. The probe is just a deprecation warning anyway.
    os.environ.setdefault("CLAUDE_AGENT_SDK_SKIP_VERSION_CHECK", "1")

    options_kwargs: dict = {
        "model": chosen_model,
        "system_prompt": build_system_prompt(owner_key),
        "max_turns": max_turns,
    }
    # When the SDK's own lookup misses the `claude` binary, hand it the
    # resolved path explicitly. The CLI inherits the user's shell PATH,
    # but the uvicorn worker sometimes doesn't — pre-resolving here
    # bridges the gap.
    cli_path = _resolve_claude_cli()
    if cli_path:
        options_kwargs["cli_path"] = cli_path
    if (thinking or "").lower() == "extended":
        # Adaptive thinking — the SDK picks the depth; cheaper than a
        # fixed-budget enable block and behaves sensibly across models.
        options_kwargs["thinking"] = {"type": "adaptive"}

    options = ClaudeAgentOptions(**options_kwargs)
    prompt = _build_prompt_from_history(session)

    text_parts: list[str] = []
    try:
        async for message in query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        text_parts.append(block.text)
    except Exception as exc:  # noqa: BLE001
        msg = str(exc).lower()
        if "claude code" in msg or "cli" in msg or "not found" in msg:
            raise OAuthUnavailable(
                f"Claude Code not reachable ({exc}). Install Claude Code and "
                f"run `claude /login`, then try again."
            ) from exc
        raise
    return "".join(text_parts).strip()


def _resolve_claude_cli() -> str | None:
    """Return an explicit path to the ``claude`` CLI, or None if absent.

    Probes ``shutil.which`` first (covers both PowerShell-style PATH and
    PATHEXT-resolved names), then a few well-known Windows install
    locations as fallbacks. Setting this explicitly on
    ``ClaudeAgentOptions(cli_path=...)`` bypasses the SDK's internal
    lookup, which is where the 'Failed to start Claude Code' empty
    errors come from when the worker process's PATH differs from the
    parent shell's.
    """
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
    """Fold the conversation transcript into a single ``query()`` prompt.

    The most recent PM message is the "now respond" turn; prior messages
    are framed as the prior exchange. ``query()`` is single-prompt — this
    is the canonical pattern for multi-turn behaviour.
    """
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
