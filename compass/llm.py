"""Chat LLM wiring — uses claude-agent-sdk so OAuth auth (Claude Code login)
works out of the box. ``ANTHROPIC_API_KEY`` also works if you'd rather use
a direct API key.

Per-owner system prompts shape the voice:

* ``master``    → the master agent: routes work, synthesizes across the pod.
* analyst slug → that analyst's persona + sector + coverage.

No tools yet — pure text chat. Hooking the analyst skills (fetch-filing,
web-research, etc.) into the chat agent comes later; for now the chat
just produces a reasoned reply, and longer-running research flows happen
through the slice-18 dispatcher.

Multi-turn note: claude-agent-sdk's ``query()`` is single-prompt, so we
fold the prior conversation into the user prompt as a transcript. Works
fine for chat; not the same as the Messages API's structured
multi-turn but the model handles it well.
"""

from __future__ import annotations

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
    """Compose the system prompt based on which side of the conversation the
    PM is talking to.
    """
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
    model: str = DEFAULT_MODEL,
) -> str:
    """Send the conversation so far to Claude and return the assistant text.

    The PM's last message must already be appended to ``session.messages``
    (the API endpoint does this before calling us).
    """
    if not session.messages or session.messages[-1].role != "pm":
        return ""

    prompt = _build_prompt_from_history(session)
    options = ClaudeAgentOptions(
        model=model,
        system_prompt=build_system_prompt(owner_key),
    )
    text_parts: list[str] = []
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    text_parts.append(block.text)
    return "".join(text_parts).strip()


def _build_prompt_from_history(session: Session) -> str:
    """Fold prior conversation into a single transcript-style prompt.

    The most recent PM message is the "now respond" turn. Earlier messages
    are framed as the prior exchange. claude-agent-sdk's ``query()`` is
    single-prompt, so we encode multi-turn this way rather than using the
    Messages API directly (which would force the user to set
    ANTHROPIC_API_KEY explicitly).
    """
    msgs = [m for m in session.messages if (m.text or "").strip()]
    if not msgs:
        return ""
    if len(msgs) == 1:
        # First exchange — no history, just the user's message.
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
