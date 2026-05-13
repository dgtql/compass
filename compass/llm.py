"""Chat LLM wiring — OAuth-only, dr-claw style.

Per docs 12 / 13 / 14 in ``background/code_analysis_want_to_use/``:

* Compass authenticates **only** via the Claude Code OAuth token written
  by the CLI at ``~/.claude/.credentials.json``. We never send an API
  key. The token's ``sk-ant-oat01-…`` prefix tells Anthropic's router
  to bill the call against the user's Claude.ai subscription quota
  (Pro / Max / Team) — which is engineered for interactive use and is
  generally hard to exhaust at human pace. Sending an API key would
  silently switch the call onto the pay-per-token tier-1 quota
  (~50 RPM, ~40K ITPM), which is what causes the constant 429s you
  see in other projects.
* The system prompt is marked ``cache_control: {type: 'ephemeral'}``
  so subsequent turns hit the cache and cost ~10 % of the input-token
  rate-limit headroom they would otherwise.
* Sonnet is the default model (~4× the OAuth-tier TPM of Opus).

If the credentials file is missing or expired, we surface a clean
"run `claude /login`" message — no silent fallback to API keys.
"""

from __future__ import annotations

import json
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


class OAuthUnavailable(RuntimeError):
    """Raised when the Claude Code OAuth credentials file is missing or
    expired. The chat endpoint surfaces this verbatim so the user knows
    to run ``claude /login`` instead of debugging deeper."""


async def generate_reply(
    owner_key: str,
    session: Session,
    *,
    model: str | None = None,
    thinking: str | None = None,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> str:
    """Return Claude's reply to the session's latest PM message.

    Auth: Claude Code OAuth credentials file only. No API key fallback.
    """
    if not session.messages or session.messages[-1].role != "pm":
        return ""

    token = _read_claude_code_oauth_token()
    if not token:
        raise OAuthUnavailable(
            "No valid Claude Code OAuth credentials. Run `claude /login` "
            "to authenticate, then try again."
        )

    chosen_model = (model or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    extended = (thinking or "").lower() == "extended"
    return _call_messages_api(
        owner_key, session,
        oauth_token=token,
        model=chosen_model,
        max_tokens=max_tokens,
        extended_thinking=extended,
    )


# ---------------------------------------------------------------------------
# OAuth credential read
# ---------------------------------------------------------------------------


def _read_claude_code_oauth_token() -> str | None:
    """Return the OAuth access token (``sk-ant-oat01-…``) written by
    ``claude /login``, or None if missing / malformed / expired.

    File location: ``~/.claude/.credentials.json`` (cross-platform —
    ``Path.home()`` resolves to ``%USERPROFILE%`` on Windows).
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
    # expiresAt is unix-milliseconds. Refuse a token already past expiry —
    # the user needs to re-login (or wait for the CLI's auto-refresh on
    # its next invocation) to mint a fresh one.
    expires_at = oauth.get("expiresAt")
    if isinstance(expires_at, (int, float)) and expires_at <= time.time() * 1000:
        return None
    return token


# ---------------------------------------------------------------------------
# Messages API call (OAuth Bearer + prompt caching)
# ---------------------------------------------------------------------------


def _call_messages_api(
    owner_key: str,
    session: Session,
    *,
    oauth_token: str,
    model: str,
    max_tokens: int,
    extended_thinking: bool = False,
) -> str:
    """Direct Messages-API call with the OAuth token + cache_control on
    the system prompt.

    Using ``credentials=StaticToken(token)`` wires the request through the
    SDK's ``AccessTokenAuth`` flow, which sets both
    ``Authorization: Bearer ...`` and the required
    ``anthropic-beta: oauth-2025-04-20`` header. A plain ``auth_token=``
    sets the Bearer header but skips the beta flag, which results in a
    generic 429 even on healthy tokens.
    """
    from anthropic import Anthropic
    from anthropic.lib.credentials import StaticToken

    client = Anthropic(credentials=StaticToken(oauth_token))

    history: list[dict] = []
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

    # Mark the system prompt as cacheable. First call writes the cache
    # (~1.25× normal cost); subsequent calls in the next ~5 minutes hit
    # the cache (~0.1× normal cost) and barely touch ITPM headroom.
    system_blocks = [{
        "type": "text",
        "text": build_system_prompt(owner_key),
        "cache_control": {"type": "ephemeral"},
    }]

    kwargs: dict = {
        "model": model,
        "system": system_blocks,
        "messages": history,
        "max_tokens": max_tokens,
    }
    if extended_thinking:
        kwargs["max_tokens"] = max(max_tokens, 4096)
        kwargs["thinking"] = {"type": "enabled", "budget_tokens": 2048}

    response = client.messages.create(**kwargs)
    parts: list[str] = []
    for block in response.content:
        text = getattr(block, "text", None)
        if isinstance(text, str):
            parts.append(text)
    return "".join(parts).strip()
