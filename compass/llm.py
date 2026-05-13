"""Chat LLM wiring.

Three auth paths, tried in order (cheapest / least flaky first):

1. **Claude Code OAuth** via the credentials file at
   ``~/.claude/.credentials.json``. The Claude Code CLI wrote this when
   you logged in (`claude /login`). We read it ourselves and pass the
   access token to the ``anthropic`` SDK as a Bearer token — no
   subprocess spawn, no PATH lookup, no version-shape mismatch between
   the SDK and a native vs. npm-installed ``claude`` binary. This is
   what dr-claw does, and is the same approach the JS
   ``@anthropic-ai/claude-agent-sdk`` uses internally.
2. **API key** (``ANTHROPIC_API_KEY``) — direct call to the Messages
   API. Standard headless path.
3. **claude-agent-sdk subprocess fallback** — spawns the ``claude``
   CLI as a child process. Last-resort; on Windows it often hits
   subprocess/path issues the OAuth-file path doesn't.

If none works the error bubbles up and is surfaced inline in the chat.

Per-owner system prompts shape the voice:

* ``master``    → the master agent: routes work, synthesizes across the pod.
* analyst slug → that analyst's persona + sector + coverage.

No tools yet — pure text chat. Hooking the analyst skills (fetch-filing,
web-research, etc.) into the chat agent comes later; for now the chat
just produces a reasoned reply, and longer-running research flows happen
through the slice-18 dispatcher.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

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

    Auth resolution order: Claude Code credentials file → API key →
    subprocess fallback via claude-agent-sdk. See the module docstring
    for why the file path is preferred.
    """
    if not session.messages or session.messages[-1].role != "pm":
        return ""

    chosen_model = (model or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    extended = (thinking or "").lower() == "extended"

    oauth_token = _read_claude_code_oauth_token()
    if oauth_token:
        return _reply_via_messages_api(
            owner_key, session,
            model=chosen_model, max_tokens=max_tokens, extended_thinking=extended,
            auth_token=oauth_token,
        )
    if os.environ.get("ANTHROPIC_API_KEY"):
        return _reply_via_messages_api(
            owner_key, session,
            model=chosen_model, max_tokens=max_tokens, extended_thinking=extended,
        )
    return await _reply_via_agent_sdk(owner_key, session, model=chosen_model)


# --- Path 0: read OAuth token from Claude Code's credentials file ---------


def _read_claude_code_oauth_token() -> str | None:
    """Return the OAuth access token written by ``claude /login``, or
    None if missing / malformed / expired.

    File location: ``~/.claude/.credentials.json``. Schema (per
    docs/12-claude-auth-and-oauth.md)::

        {
          "claudeAiOauth": {
            "accessToken":  "...",
            "refreshToken": "...",
            "expiresAt":    <unix ms>,
            "scopes":       ["user:inference", ...]
          },
          "email": "..."
        }
    """
    creds_path = Path.home() / ".claude" / ".credentials.json"
    if not creds_path.exists():
        return None
    try:
        data = json.loads(creds_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    oauth = (data or {}).get("claudeAiOauth") or {}
    token = oauth.get("accessToken")
    if not isinstance(token, str) or not token:
        return None
    expires_at = oauth.get("expiresAt")
    # expiresAt is unix-milliseconds. Refuse a token that's already past
    # its expiry — the user needs to re-login via `claude` to refresh.
    if isinstance(expires_at, (int, float)) and expires_at <= time.time() * 1000:
        return None
    return token


# --- Path 1 & 2: anthropic SDK (OAuth bearer token OR API key) ------------


def _reply_via_messages_api(
    owner_key: str,
    session: Session,
    *,
    model: str,
    max_tokens: int,
    extended_thinking: bool = False,
    auth_token: str | None = None,
) -> str:
    """Direct Messages-API call.

    When ``auth_token`` is a Claude Code OAuth token, we pass it via the
    SDK's ``credentials=StaticToken(...)`` mechanism rather than
    ``auth_token=`` — that path auto-injects the
    ``anthropic-beta: oauth-2025-04-20`` header that "unlocks Bearer
    auth on the API." Without that header the API responds with a
    generic 429 even when the token is otherwise valid.
    """
    from anthropic import Anthropic

    client_kwargs: dict = {}
    if auth_token:
        from anthropic.lib.credentials import StaticToken
        client_kwargs["credentials"] = StaticToken(auth_token)
    client = Anthropic(**client_kwargs)

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
        # Enable extended thinking — budget some tokens for the chain-of-
        # thought so the user-visible reply still fits.
        kwargs["max_tokens"] = max(max_tokens, 4096)
        kwargs["thinking"] = {"type": "enabled", "budget_tokens": 2048}
    response = client.messages.create(**kwargs)
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
    import os
    from claude_agent_sdk import (
        AssistantMessage,
        ClaudeAgentOptions,
        TextBlock,
        query,
    )

    # Skip the SDK's pre-call version probe — on Windows this can hang and
    # contribute to the empty-error path we saw in the wild. The probe is
    # purely a deprecation warning; the actual call doesn't depend on it.
    os.environ.setdefault("CLAUDE_AGENT_SDK_SKIP_VERSION_CHECK", "1")

    cli_path = _resolve_claude_cli()
    stderr_buf: list[str] = []
    if not cli_path:
        raise RuntimeError(
            "Couldn't find the `claude` CLI on PATH. Install Claude Code "
            "(https://docs.claude.com/en/docs/claude-code/quickstart) or add "
            "ANTHROPIC_API_KEY to .env to use the direct-API path instead."
        )

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
