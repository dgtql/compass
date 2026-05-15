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

from compass.analysts import DATA_ENGINEER_SLUG, get_analyst, list_analysts
from compass.chats import Session

DEFAULT_MODEL = "claude-sonnet-4-6"


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------


def build_system_prompt(owner_key: str) -> str:
    if owner_key == "master":
        return _master_system_prompt()
    if owner_key == DATA_ENGINEER_SLUG:
        return _data_engineer_system_prompt()
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


def _data_engineer_system_prompt() -> str:
    """The auto-injected Data Engineer's chat persona.

    Distinct from a hired analyst: this role's job is to *scope new data
    sources* with the PM over a few rounds of back-and-forth, then
    produce a written spec the team can review.

    The curated source list below is what Compass already knows works
    (free, no auth). It biases the agent toward proposing achievable
    paths instead of hallucinating Bloomberg / FactSet endpoints. The
    "already covered" section names the four producer skills shipped
    today so the DE doesn't propose a duplicate.
    """
    return """You are the Data Engineer on Compass — the pod's pragmatic source-hunter.

Your job is NOT to do investment analysis. Your job is to chat with the PM about a *new data source* they'd like Compass to support, ask the questions needed to scope it well, and produce a written spec at the end.

# How to chat

- Open with one or two sharp clarifying questions, not a wall. Find out:
  - What problem is the PM trying to solve? (What memo / decision will use this data?)
  - What fields specifically — names of columns / values they care about.
  - How fresh does it need to be? (Once, daily, real-time?)
  - Per-ticker? Universe-wide? Sector-scoped?
- Suggest a source from the curated list below when one fits. Be honest when nothing fits — say so and discuss alternatives.
- Push back on scope creep. Better one tight source than three vague ones.
- Two to four rounds of conversation is the target. Don't drag it.

# Sources Compass already knows how to use (free, no auth)

- **Yahoo Finance** (`yfinance`): prices, financial statements summary, analyst targets, recommendations + upgrades/downgrades, holders (institutional + mutual fund + insider via Form-4 aggregation), recent news headlines, earnings history + estimates + EPS trend.
- **SEC EDGAR** (`edgartools`): every filing — 10-K, 10-Q, 8-K, S-1, DEF 14A, Form 4, 13F. Cleaned Markdown + structured XBRL access. US-listed only.
- **Company IR pages** (custom scraper, not yet built): press releases, annual reports, presentations.
- **Earnings transcripts** (custom scraper, not yet built): Motley Fool, Yahoo, company IR.
- **News** (RSS / Google News / GDELT): light sentiment scan, headlines.
- **Oslo Børs NewsWeb** (custom scraper, not yet built): filings for Oslo-listed names.

If a PM ask points at paid sources (Bloomberg, FactSet, S&P, Refinitiv, Morningstar) — say so plainly. Compass is free-OSS positioned; we don't pay for data unless the PM has a specific subscription they want to wire in.

# Already covered (don't propose duplicates)

These data sources already have working fetch skills:

- `filings` (10-K + 10-Q via edgartools) — `fetch-sec-filing`
- `snapshots` (Yahoo daily snapshot: price, target, fundamentals) — `fetch-market-snapshot`
- `news` (recent ticker-tagged headlines) — `fetch-news`
- `insider` (Form 4 transactions) — `fetch-insider-trades`
- `holdings` (13F institutional + mutual fund) — `fetch-institutional-holdings`
- `earnings` (multi-quarter history + estimates + analyst recs) — `fetch-earnings-history`
- `press-releases` (recent 8-Ks) — `fetch-press-releases`

If the PM asks for something already on this list, name the existing skill and ask what's missing about it — maybe they want different fields, a different cadence, or a richer parse.

# Producing the spec

When the PM has answered enough that you can write a spec, end your message with a fenced block in exactly this format:

```
## Data Source Spec

- **slug:** `<lowercase-with-hyphens>`
- **category:** <one of: filings | snapshots | news | insider | holdings | earnings | transcripts | press-releases | ownership | new>
- **what:** <one sentence of what the data is>
- **source:** <name + access path, e.g. "SEC EDGAR via edgartools (Form 4)" or "Motley Fool earnings transcripts via HTTP scrape">
- **refresh:** <once | daily | weekly | quarterly | on-demand>
- **scope:** <per-ticker | universe-wide | sector-scoped>
- **fields:**
  - <field_name>: <short description>
  - …
- **output path:** `<engagement-relative path like corpus/transcripts/{date}.md>`
- **notes:** <any auth / rate-limit / known-gotcha caveats>
```

Important:

- Only emit the spec block when you genuinely have enough to write it. If the PM is still figuring out what they want, keep asking.
- One spec per conversation. If the PM pivots, treat the previous draft as superseded and write a fresh block.
- The slug becomes the future skill folder name (`skills/fetch-<slug>/`). Pick something short, distinct, and conventional. Reuse a category name if it fits; mint a new one only when nothing existing applies.

# Style

- Concrete and short. Bullets beat paragraphs.
- Acknowledge what you don't know. Don't promise sources you can't reach.
- Don't write Python. Don't write SKILL.md content. Just spec.
"""


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
    """Non-streaming: return the full reply text once available.

    Used by the CLI and by callers that don't want to plumb an async
    iterator. The streaming version below is what the UI uses.
    """
    if not session.messages or session.messages[-1].role != "pm":
        return ""

    chosen_model = (model or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    use_extended = (thinking or "").lower() == "extended"

    import asyncio

    return await asyncio.to_thread(
        _generate_reply_sync,
        owner_key, session, chosen_model, use_extended, max_turns,
    )


async def stream_reply(
    owner_key: str,
    session: Session,
    *,
    model: str | None = None,
    thinking: str | None = None,
    max_turns: int = 4,
):
    """Streaming variant — yields text deltas as they arrive from the SDK.

    Internally runs the (sync) SDK iteration in a thread and pipes each
    delta back through a thread-safe queue. The async caller awaits the
    queue and yields deltas to its consumer (e.g. an SSE response).

    Final yield is the empty string when done; exceptions surface to the
    caller via the queue.
    """
    if not session.messages or session.messages[-1].role != "pm":
        return

    chosen_model = (model or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    use_extended = (thinking or "").lower() == "extended"

    import asyncio
    import queue
    import threading

    q: queue.Queue = queue.Queue()
    SENTINEL = object()

    def _on_delta(delta: str) -> None:
        if delta:
            q.put(delta)

    def _runner() -> None:
        try:
            _generate_reply_sync(
                owner_key, session, chosen_model, use_extended, max_turns,
                on_delta=_on_delta,
            )
        except Exception as exc:  # noqa: BLE001 — surface to consumer
            q.put(exc)
        finally:
            q.put(SENTINEL)

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()

    loop = asyncio.get_running_loop()
    while True:
        item = await loop.run_in_executor(None, q.get)
        if item is SENTINEL:
            return
        if isinstance(item, BaseException):
            raise item
        yield item


def _generate_reply_sync(
    owner_key: str,
    session: Session,
    model: str,
    extended_thinking: bool,
    max_turns: int,
    *,
    on_delta=None,
) -> str:
    """Sync wrapper — runs the async SDK call on a fresh asyncio loop in
    the worker thread, so it doesn't share state with uvicorn's loop.

    ``on_delta`` is invoked with each new text chunk as it arrives, in
    addition to being accumulated into the returned string. Pass it from
    ``stream_reply`` to forward chunks to the UI; pass ``None`` for the
    non-streaming case.
    """
    import asyncio

    # Skip the SDK's pre-call version probe (deprecation warning only;
    # on some Windows setups it hangs and contributes to the empty
    # 'Failed to start Claude Code: .' error).
    os.environ.setdefault("CLAUDE_AGENT_SDK_SKIP_VERSION_CHECK", "1")

    options_kwargs: dict = {
        "model": model,
        "system_prompt": build_system_prompt(owner_key),
        "max_turns": max_turns,
        # Hard-disable Claude Code's auto-context loading so the analyst
        # voice isn't polluted with project CLAUDE.md / memory / settings.
        "setting_sources": None,
        "skills": None,
        "agents": None,
        "cwd": str(Path.home()),
        # Stream partial messages so we can forward deltas to the UI.
        "include_partial_messages": True,
    }
    cli_path = _resolve_claude_cli()
    if cli_path:
        options_kwargs["cli_path"] = cli_path
    if extended_thinking:
        options_kwargs["thinking"] = {"type": "adaptive"}

    options = ClaudeAgentOptions(**options_kwargs)
    prompt = _build_prompt_from_history(session)

    async def _run() -> str:
        text_parts: list[str] = []
        last_emitted_len = 0
        async for message in query(prompt=prompt, options=options):
            if not isinstance(message, AssistantMessage):
                continue
            # Reassemble the current message's running text (across all
            # text blocks). Diff against what we've already emitted so
            # each on_delta call carries only the *new* characters.
            running = "".join(
                b.text for b in message.content if isinstance(b, TextBlock)
            )
            if on_delta is not None and len(running) > last_emitted_len:
                delta = running[last_emitted_len:]
                last_emitted_len = len(running)
                try:
                    on_delta(delta)
                except Exception:  # noqa: BLE001 — delta sink shouldn't break the loop
                    pass
            text_parts.append(running)
        # Last value of `running` is the final text.
        return (text_parts[-1] if text_parts else "").strip()

    try:
        return asyncio.run(_run())
    except Exception as exc:  # noqa: BLE001
        msg = str(exc).lower()
        if "claude code" in msg or "cli" in msg or "not found" in msg:
            raise OAuthUnavailable(
                f"Claude Code not reachable ({exc}). Install Claude Code and "
                f"run `claude /login`, then try again."
            ) from exc
        raise


async def suggest_memo_ticker(
    *,
    message: str,
    candidates: list[dict],
) -> str | None:
    """Pick the ticker the PM most likely means for a memo task.

    ``candidates`` is a list of ``{"ticker": ..., "name": ...}`` dicts —
    typically the analyst's coverage (or, for the master agent, the PM's
    watchlist). We give the model only this constrained set so it can't
    invent tickers; returns ``None`` if nothing fits.
    """
    message = (message or "").strip()
    if not message or not candidates:
        return None

    import asyncio

    return await asyncio.to_thread(_suggest_ticker_sync, message, candidates)


_TICKER_SYSTEM_PROMPT = (
    "You resolve a portfolio manager's free-text mention of a stock to one "
    "ticker from a constrained list.\n"
    "\n"
    "The PM may write the ticker in any of these forms — all should match:\n"
    "  - Bare symbol: 'AKSO' → match 'AKSO.OL' if that's the list entry\n"
    "  - Yahoo form: 'AKSO.OL' → 'AKSO.OL'\n"
    "  - Bloomberg form: 'AKSO NO' → 'AKSO.OL' (Norway suffix)\n"
    "  - Bloomberg form: 'AZN LN' → 'AZN.L' (London suffix)\n"
    "  - Bloomberg form: 'NESN SE' → 'NESN.SW' (Swiss suffix)\n"
    "  - Company name: 'Aker Solutions' → 'AKSO.OL'\n"
    "\n"
    "Reply with EXACTLY the ticker as it appears in the list (preserve the\n"
    "'.suffix' if present — match the list entry character-for-character).\n"
    "If no candidate fits, reply with the single word NONE.\n"
    "No quotes, no extra words."
)


def _suggest_ticker_sync(message: str, candidates: list[dict]) -> str | None:
    import asyncio

    os.environ.setdefault("CLAUDE_AGENT_SDK_SKIP_VERSION_CHECK", "1")

    # Surface bloomberg_ticker in the roster so the model can bridge a
    # PM's vocabulary ("AKSO NO") to the Yahoo-form lookup key ("AKSO.OL").
    def _line(c: dict) -> str:
        ticker = c.get("ticker", "").strip()
        if not ticker:
            return ""
        bt = (c.get("bloomberg_ticker") or "").strip()
        name = c.get("name") or "(no name)"
        alias = f" / {bt}" if bt else ""
        return f"  {ticker}{alias} — {name}"

    roster_lines = "\n".join(line for line in (_line(c) for c in candidates) if line)
    user_prompt = (
        f"Tickers available (Yahoo form / Bloomberg form — Company name):\n{roster_lines}\n\n"
        f"PM's message: {message}\n\n"
        f"Reply with the matching ticker from the list (case-sensitive — keep the .suffix), or NONE."
    )

    options_kwargs: dict = {
        "model": "claude-haiku-4-5",
        "system_prompt": _TICKER_SYSTEM_PROMPT,
        "max_turns": 1,
        "setting_sources": None,
        "skills": None,
        "agents": None,
        "cwd": str(Path.home()),
    }
    cli_path = _resolve_claude_cli()
    if cli_path:
        options_kwargs["cli_path"] = cli_path

    options = ClaudeAgentOptions(**options_kwargs)
    valid = {(c.get("ticker") or "").upper() for c in candidates}

    async def _run() -> str:
        parts: list[str] = []
        async for msg in query(prompt=user_prompt, options=options):
            if not isinstance(msg, AssistantMessage):
                continue
            for b in msg.content:
                if isinstance(b, TextBlock):
                    parts.append(b.text)
        return "".join(parts).strip()

    try:
        raw = asyncio.run(_run())
    except Exception:  # noqa: BLE001
        return None

    candidate = raw.strip().strip("`").strip('"').strip("'").upper()
    if not candidate or candidate == "NONE":
        return None
    # Sometimes the model emits "Ticker: NVDA" or "AKSO." — clean up
    # punctuation but preserve mid-dots like "AKSO.OL".
    candidate = candidate.split()[0] if candidate.split() else candidate
    candidate = candidate.strip(",;:").rstrip(".")

    # 1. Exact match — happy path
    if candidate in valid:
        return candidate

    # 2. Bloomberg-form match — PM typed "AKSO NO" → Haiku returned
    # "AKSO" → check if any candidate's Bloomberg first-token matches.
    for c in candidates:
        bt = (c.get("bloomberg_ticker") or "").strip().upper()
        if bt:
            bt_first = bt.split()[0]
            if bt_first == candidate:
                return (c.get("ticker") or "").upper()

    # 3. Yahoo-form prefix match — Haiku returned "AKSO" and the unique
    # candidate is "AKSO.OL". Only accept when there's exactly one match
    # to avoid silent ambiguity (e.g. "A" → many candidates).
    prefix_matches = [v for v in valid if v.startswith(candidate + ".")]
    if len(prefix_matches) == 1:
        return prefix_matches[0]

    return None


async def suggest_workflow(
    *,
    message: str,
    workflows: list[dict],
) -> str | None:
    """Pick the workflow command best fitting ``message``, or None for chat.

    ``workflows`` is a list of ``{"command": ..., "name": ..., "description": ...}``
    dicts — the workflows surfaced to the PM in their current chat
    context (pack chips + generic dropdown). Haiku gets only this
    constrained set so it can't invent commands; returns ``None`` when
    the message clearly belongs to free-form chat (a follow-up question,
    a clarification, idle conversation).
    """
    message = (message or "").strip()
    if not message or not workflows:
        return None
    # Single-word messages are almost always chat — don't spend a Haiku
    # call on "hi" or "what?". But "Pitch AKSO" (2 words) is a real
    # research request, so we keep the threshold low.
    if len(message.split()) < 2:
        return None

    import asyncio

    return await asyncio.to_thread(_suggest_workflow_sync, message, workflows)


_WORKFLOW_SYSTEM_PROMPT = (
    "You route a portfolio manager's free-text message to a workflow "
    "command from a constrained list. Workflows are end-to-end research "
    "pipelines (e.g. a pitch memo, a sell-criteria check).\n"
    "\n"
    "Pick a workflow when the message is a research request — for example:\n"
    "  'Give me a pitch for AKSO'        → buffett-pitch / pitch-memo (whichever fits)\n"
    "  'Write me a memo on NVDA'         → buffett-pitch / pitch-memo\n"
    "  'Run a quick filter on MSFT'      → buffett-quick-filter\n"
    "  'Should we sell AAPL?'            → buffett-sell-check\n"
    "  'Earnings reaction on JPM'        → earnings-reaction\n"
    "  'Quarterly update on TSLA'        → maintenance-refresh\n"
    "  'Deep dive on AMD'                → deep-dive\n"
    "\n"
    "If a persona-specific workflow (e.g. buffett-pitch) is in the list, "
    "PREFER it over the generic equivalent (pitch-memo) — the PM is in that "
    "analyst's chat for a reason.\n"
    "\n"
    "Reply NONE only when the message is clearly NOT a workflow trigger:\n"
    "  'hi', 'thanks', 'what do you think?', 'tell me more', 'why?'\n"
    "  follow-up questions on something already discussed\n"
    "  small talk, clarifications, idle chat\n"
    "\n"
    "Reply with ONLY the workflow command (lowercase, no quotes, no extra words),\n"
    "or the single word NONE."
)


def _suggest_workflow_sync(message: str, workflows: list[dict]) -> str | None:
    import asyncio

    os.environ.setdefault("CLAUDE_AGENT_SDK_SKIP_VERSION_CHECK", "1")

    roster_lines = "\n".join(
        f"  {(w.get('command') or '').strip()} — {(w.get('name') or '').strip()}: "
        f"{(w.get('description') or '').strip()}"
        for w in workflows
        if w.get("command")
    )
    user_prompt = (
        f"Available workflows:\n{roster_lines}\n\n"
        f"PM's message:\n{message}\n\n"
        f"Pick one workflow command from the list, or NONE."
    )

    options_kwargs: dict = {
        "model": "claude-haiku-4-5",
        "system_prompt": _WORKFLOW_SYSTEM_PROMPT,
        "max_turns": 1,
        "setting_sources": None,
        "skills": None,
        "agents": None,
        "cwd": str(Path.home()),
    }
    cli_path = _resolve_claude_cli()
    if cli_path:
        options_kwargs["cli_path"] = cli_path

    options = ClaudeAgentOptions(**options_kwargs)
    valid = {(w.get("command") or "").strip() for w in workflows}

    async def _run() -> str:
        parts: list[str] = []
        async for msg in query(prompt=user_prompt, options=options):
            if not isinstance(msg, AssistantMessage):
                continue
            for b in msg.content:
                if isinstance(b, TextBlock):
                    parts.append(b.text)
        return "".join(parts).strip()

    try:
        raw = asyncio.run(_run())
    except Exception:  # noqa: BLE001
        return None

    candidate = raw.strip().strip(".").strip("`").strip('"').strip("'")
    if not candidate or candidate.upper() == "NONE":
        return None
    candidate = candidate.split()[0] if candidate.split() else candidate
    candidate = candidate.strip(",.;:")
    if candidate in valid:
        return candidate
    return None


async def suggest_task_title(
    *,
    chip: str | None,
    message: str,
) -> str:
    """Generate a short task title from a chip label + the PM's first message.

    The welcome-screen chips ("Memo", "Catalysts", …) only describe the
    *type* of task; they don't say what it's about. This calls Haiku to
    fold the chip + message into something like ``Memo on NVDA Q3`` so
    the task list reads usefully a week later.

    Returns the chip (or a message snippet) on any failure — titling
    should never block the chat flow.
    """
    chip = (chip or "").strip()
    message = (message or "").strip()
    fallback = chip or message[:40]
    if not message:
        return fallback

    import asyncio

    return await asyncio.to_thread(_suggest_title_sync, chip, message, fallback)


_TITLE_SYSTEM_PROMPT = (
    "You write concise task titles for a portfolio manager's research dashboard. "
    "Reply with ONLY the title — no quotes, no trailing punctuation, no preamble. "
    "Aim for 3–7 words. Examples of good titles:\n"
    "  Memo on NVDA Q3\n"
    "  ASML capex history\n"
    "  Energy morning brief\n"
    "  Semis EU reg catalysts\n"
    "Pick a title that names the *subject* of the work, not just the task type."
)


def _suggest_title_sync(chip: str, message: str, fallback: str) -> str:
    import asyncio

    os.environ.setdefault("CLAUDE_AGENT_SDK_SKIP_VERSION_CHECK", "1")

    if chip:
        user_prompt = (
            f"Task type: {chip}\n"
            f"PM's first message: {message}\n\n"
            f"Produce a concise task title (only the title)."
        )
    else:
        user_prompt = (
            f"PM's first message: {message}\n\n"
            f"Produce a concise task title (only the title)."
        )

    options_kwargs: dict = {
        "model": "claude-haiku-4-5",
        "system_prompt": _TITLE_SYSTEM_PROMPT,
        "max_turns": 1,
        "setting_sources": None,
        "skills": None,
        "agents": None,
        "cwd": str(Path.home()),
    }
    cli_path = _resolve_claude_cli()
    if cli_path:
        options_kwargs["cli_path"] = cli_path

    options = ClaudeAgentOptions(**options_kwargs)

    async def _run() -> str:
        parts: list[str] = []
        async for msg in query(prompt=user_prompt, options=options):
            if not isinstance(msg, AssistantMessage):
                continue
            for b in msg.content:
                if isinstance(b, TextBlock):
                    parts.append(b.text)
        return "".join(parts).strip()

    try:
        title = asyncio.run(_run())
    except Exception:  # noqa: BLE001 — titling failure is non-fatal
        return fallback

    # Strip surrounding quotes/whitespace, take first line, cap length.
    title = title.strip().strip('"').strip("'").strip()
    if "\n" in title:
        title = title.split("\n", 1)[0].strip()
    if not title:
        return fallback
    words = title.split()
    if len(words) > 10:
        title = " ".join(words[:10])
    if len(title) > 80:
        title = title[:80].rstrip()
    return title


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
