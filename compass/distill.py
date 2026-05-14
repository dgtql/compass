"""Distill a Compass skill from a famous person's name.

Pipeline:

1. Fetch the person's Wikipedia plain-text extract (no extra dependency —
   plain ``requests`` against the Wikipedia action API).
2. Load the bundled ``buffett`` skill as the shape template — its
   ``SKILL.md`` body is the canonical example of "investment-thinking
   skill" structure (Quick Filter / Deep Analysis Framework / Standard
   Output Format).
3. Run a one-shot Claude call (via ``claude-agent-sdk`` for the same
   OAuth path the chat surface uses) with the wiki content + the shape
   template as references. The model returns a complete SKILL.md.
4. Return that content to the caller — the API endpoint surfaces it for
   user review; nothing is written to disk until the user confirms via
   the upload endpoint.

Quality caveat: Wikipedia pages are biographical. Munger's article
summarises "advocates of a latticework of mental models" but doesn't
contain the actual models in depth. The distilled SKILL.md will be
shape-correct and capture the investor's named principles, but won't
match the depth of a hand-curated skill whose reference files draw on
letters, interviews, and books. Treat the output as a starting template.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any, Callable

import requests


_WIKI_API = "https://en.wikipedia.org/w/api.php"


# ---------------------------------------------------------------------------
# Wikipedia fetch
# ---------------------------------------------------------------------------


def fetch_wikipedia_extract(name: str, *, timeout: float = 15.0) -> str | None:
    """Return the plain-text extract of an English Wikipedia article, or None.

    Uses ``action=query&prop=extracts&explaintext`` so the response is
    plain text (no HTML, no wiki markup). Follows redirects so common
    name aliases ("Munger" → "Charlie Munger") still resolve.
    """
    name = (name or "").strip()
    if not name:
        return None
    params = {
        "action": "query",
        "format": "json",
        "prop": "extracts",
        "explaintext": "true",
        "redirects": "1",
        "exlimit": "1",
        "titles": name,
    }
    try:
        r = requests.get(
            _WIKI_API,
            params=params,
            timeout=timeout,
            headers={
                # Wikipedia asks API consumers to identify themselves so
                # they can contact us if our usage pattern misbehaves.
                "User-Agent": "Compass/0.1 (compass-research; zhudi2825@gmail.com)",
            },
        )
        r.raise_for_status()
        data = r.json()
    except (requests.RequestException, ValueError):
        return None

    pages = (data.get("query") or {}).get("pages") or {}
    if not pages:
        return None
    page = next(iter(pages.values()))
    # Missing pages have ``missing`` key set and no extract.
    if page.get("missing") is not None:
        return None
    extract = page.get("extract") or ""
    return extract.strip() or None


# ---------------------------------------------------------------------------
# Claude one-shot authoring call
# ---------------------------------------------------------------------------


_AUTHOR_SYSTEM_PROMPT = """You author 'investment-thinking' skills for the Compass platform.

You will be given:
- A target investor's name and target slug.
- The plain-text Wikipedia extract for that investor.
- An example skill (Warren Buffett's) showing the exact shape Compass expects.

Your output is ONE complete SKILL.md file (frontmatter + body) for the new investor.

# Frontmatter requirements (YAML between `---` delimiters)

* `name:` the slug.
* `description: |` followed by an indented block (1–3 paragraphs) describing
  when the skill should activate. Same activation style as Buffett's.
* `phase: compose`
* `runner: agent`
* `allowed-tools: Read Write`
* `model: claude-sonnet-4-6`
* `max_turns: 40`
* `needs:` followed by indented `- brief`, `- filings`, `- snapshots`, `- news`,
  `- segments`, `- kpis` (one per line).
* `output: memos/<slug>-pitch/{date}.md`

# Body requirements (Markdown after the closing `---`)

Mirror Buffett's section layout, adapted to the investor's actual doctrine
as captured in the wiki extract:

1. A short opening paragraph: what the skill embodies.
2. "Quick Filter" — 5–8 yes/no questions specific to this investor's discipline.
3. "Reference File Reading Protocol" — even though we won't ship references in v1,
   list the topic areas a user might add later (3–6 bullet points).
4. "Deep Analysis Framework" — 3–5 numbered sections capturing this investor's
   key concepts (e.g. for Lynch: GARP, story stocks, ten-baggers, scuttlebutt;
   for Klarman: margin-of-safety hunting, distressed debt, illiquidity premium).
5. "Standard Output Format" — a fenced markdown block showing the required
   memo structure for this investor's pitch. Vary section headings from
   Buffett's where the investor's methodology differs.

# Hard rules

- Do NOT fabricate. If the wiki extract does not support a doctrine, do not
  attribute it to the investor. A shorter, more honest skill beats a long,
  invented one.
- Investor's *recorded principles* and *named frameworks* are fair game.
- No "buy/sell" recommendations in the skill; this is for grounded analysis only.
- Output ONLY the SKILL.md content. No prose preamble. No code fences around it.
  Start with `---` and end at the close of the body."""


def _build_distill_user_prompt(name: str, slug: str, wiki: str, buffett_body: str) -> str:
    # Truncate aggressively if the wiki extract is huge — most of the
    # signal is in the lead and "Investing approach" sections.
    if len(wiki) > 20000:
        wiki = wiki[:20000] + "\n\n[...wiki extract truncated...]"
    return f"""# Target

Name: {name}
Slug: {slug}

# Wikipedia extract (plain text)

{wiki}

# Example skill shape (Buffett, do not copy verbatim — use only as the structural template)

{buffett_body}

Now produce the complete SKILL.md for {name} (slug {slug})."""


def _distill_sync(
    name: str,
    slug: str,
    wiki: str,
    buffett_body: str,
    on_event: Callable[[dict[str, Any]], None] | None = None,
) -> str:
    """Worker-thread entry — runs the SDK loop on a fresh asyncio loop.

    Mirrors :func:`compass.llm._generate_reply_sync`'s shape (Windows
    proactor + uvicorn loop interaction means the SDK has to run on its
    own loop in a thread).

    If ``on_event`` is provided, partial-message streaming is enabled
    and each new chunk of authored text is forwarded as a ``say`` event
    with the running character count — so the frontend can show real
    progress instead of an opaque spinner. The callback runs on the
    worker thread and must be thread-safe (the SSE bridge uses a
    :class:`queue.Queue`, which already is).
    """
    import asyncio
    from claude_agent_sdk import (
        AssistantMessage,
        ClaudeAgentOptions,
        TextBlock,
        query,
    )

    os.environ.setdefault("CLAUDE_AGENT_SDK_SKIP_VERSION_CHECK", "1")

    options_kwargs: dict[str, Any] = {
        "model": "claude-sonnet-4-6",
        "system_prompt": _AUTHOR_SYSTEM_PROMPT,
        "max_turns": 2,           # one-shot — no tool use, no loops
        "setting_sources": None,  # don't pull project/user/memory context
        "skills": None,
        "agents": None,
        "cwd": str(Path.home()),
        # Stream partial messages so we can forward authored-chars to the
        # client. Without this, the SDK only yields one big message at
        # the end and the user sees no progress for 30+ seconds.
        "include_partial_messages": True,
    }
    cli_path = _resolve_claude_cli()
    if cli_path:
        options_kwargs["cli_path"] = cli_path

    options = ClaudeAgentOptions(**options_kwargs)
    user_prompt = _build_distill_user_prompt(name, slug, wiki, buffett_body)

    def _emit(event: dict[str, Any]) -> None:
        if on_event is None:
            return
        try:
            on_event(event)
        except Exception:  # noqa: BLE001 — sink must never break the loop
            pass

    async def _run() -> str:
        text_parts: list[str] = []
        last_emitted_len = 0
        async for msg in query(prompt=user_prompt, options=options):
            if not isinstance(msg, AssistantMessage):
                continue
            running = "".join(
                b.text for b in msg.content if isinstance(b, TextBlock)
            )
            if len(running) > last_emitted_len:
                delta = running[last_emitted_len:]
                last_emitted_len = len(running)
                _emit({
                    "type": "say",
                    "delta": delta,
                    "total_chars": len(running),
                })
            text_parts.append(running)
        # Last value of `running` is the final text.
        return (text_parts[-1] if text_parts else "").strip()

    return asyncio.run(_run())


def _resolve_claude_cli() -> str | None:
    """Resolve the ``claude`` CLI path so the SDK doesn't lose it under
    uvicorn's worker PATH. Same probe order as :mod:`compass.llm`."""
    for nm in ("claude", "claude.exe", "claude.cmd"):
        p = shutil.which(nm)
        if p:
            return p
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


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def distill_skill_from_name(
    name: str,
    slug: str,
    *,
    on_event: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Author a SKILL.md for ``name`` modeled on the bundled Buffett skill.

    Does not write anything to disk. Returns
    ``{"slug", "name", "wiki_chars", "skill_md"}`` so the API endpoint can
    surface the proposed content for user review + edit; the user then
    confirms via ``POST /api/skills`` (the upload path).

    If ``on_event`` is provided, the function emits staged progress events
    so the UI can show what's happening through the 30–60s SDK call:

    - ``wiki_start``    — about to fetch
    - ``wiki_done``     — ``{chars}`` extract retrieved
    - ``author_start``  — Claude SDK call beginning
    - ``say`` (many)    — ``{delta, total_chars}`` as the model streams
    - ``author_done``   — ``{chars}`` final length
    """
    import asyncio

    def _emit(event: dict[str, Any]) -> None:
        if on_event is None:
            return
        try:
            on_event(event)
        except Exception:  # noqa: BLE001
            pass

    _emit({"type": "wiki_start", "name": name})
    wiki = fetch_wikipedia_extract(name)
    if wiki is None:
        raise ValueError(f"Wikipedia page not found for {name!r}")
    _emit({"type": "wiki_done", "chars": len(wiki)})

    # Load the Buffett SKILL.md body as the shape template.
    from compass.skills import load_skill
    buffett = load_skill("buffett")

    _emit({"type": "author_start", "model": "claude-sonnet-4-6"})
    skill_md = await asyncio.to_thread(
        _distill_sync, name, slug, wiki, buffett.body, on_event,
    )
    if not skill_md.strip():
        raise RuntimeError(
            "distill: Claude returned no content. Check OAuth (run `claude /login`) "
            "and that the SDK is reachable."
        )
    _emit({"type": "author_done", "chars": len(skill_md)})

    return {
        "slug": slug,
        "name": name,
        "wiki_chars": len(wiki),
        "skill_md": skill_md,
    }
