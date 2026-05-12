"""Compass agent — thin wrapper around claude-agent-sdk.

Slice 1: minimal ``ask(prompt) -> str`` to validate the SDK + auth path.
Slice 3: ``summarize(path, ticker)`` runs the agent with the Read tool
enabled and a ``PreToolUse`` hook that logs every tool call. The hook
is the seam Slice 4 swaps for the SQLite evidence-ledger writer.
Slice 6: ``research(ticker, memo_type)`` runs the agent with Read +
Write tools, lets it consult the corresponding skill's SKILL.md, and
produces a memo file at ``memos/<type>/<YYYY-MM-DD>.md``.

Slice 2.5 (architectural pivot, 2026-05-12): SEC filings now arrive as
clean Markdown directly from ``edgartools`` (see ``compass.ingest.edgar``),
so this module no longer needs an HTML-pre-processing stage.
"""

from __future__ import annotations

import sys
import time
from datetime import date
from pathlib import Path

import compass
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    HookMatcher,
    TextBlock,
    query,
)

from compass.db import list_evidence_for_ticker
from compass.tools import make_tool_logger
from compass.workspace import ensure_workspace, workspace_dir

DEFAULT_MODEL = "claude-sonnet-4-6"

# Repo root → ``skills/<skill-name>/SKILL.md``. Works in editable installs;
# wheel-install packaging gets revisited when we ship via PyPI.
_REPO_ROOT = Path(compass.__file__).resolve().parent.parent
_SKILLS_DIR = _REPO_ROOT / "skills"


async def ask(
    prompt: str,
    *,
    model: str = DEFAULT_MODEL,
    system_prompt: str | None = None,
) -> str:
    """Send a single prompt to Claude and return the final assistant text.

    Auth resolution is automatic:
    - If ``ANTHROPIC_API_KEY`` is set in the environment, the SDK uses it.
    - Otherwise the SDK falls back to Claude Code OAuth credentials
      (set up by running ``claude`` once and completing ``/login``).
    """
    options = ClaudeAgentOptions(model=model, system_prompt=system_prompt)

    text_parts: list[str] = []
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    text_parts.append(block.text)

    return "".join(text_parts).strip()


async def summarize(
    path: Path,
    *,
    ticker: str | None = None,
    model: str = DEFAULT_MODEL,
) -> str:
    """Have the agent read ``path`` and return a one-paragraph summary.

    Inputs are expected to be reading-friendly (plain text or Markdown);
    EDGAR filings arrive in that shape via ``EdgarSource`` (edgartools'
    ``Filing.markdown()``), so we point the agent straight at the file.
    The PreToolUse hook in ``compass.tools.make_tool_logger`` observes
    every tool call and will write SQLite evidence-ledger rows in Slice 4.
    """
    abs_path = path.resolve()
    if not abs_path.exists():
        raise FileNotFoundError(f"document not found: {abs_path}")

    context_hint = f" for {ticker.upper()}" if ticker else ""
    prompt = (
        f"Read the document at {abs_path}{context_hint}. "
        "Then write a single paragraph (max ~150 words) summarizing the key "
        "facts a portfolio manager would care about: the business, recent "
        "financial results, material risks, and forward outlook. Ground every "
        "specific claim in the document — quote or cite phrasing where useful."
    )

    started_at = time.monotonic()
    print(
        f"[   0.0s] Reading {abs_path.name} ({abs_path.stat().st_size / 1024:.0f} KB) "
        f"with model {model}; expect ~30–60s on a 10-K.",
        flush=True,
        file=sys.stderr,
    )

    options = ClaudeAgentOptions(
        model=model,
        tools=["Read"],
        allowed_tools=["Read"],
        add_dirs=[str(abs_path.parent)],
        hooks={
            "PreToolUse": [HookMatcher(hooks=[make_tool_logger(started_at)])],
        },
        # Bound the loop so a misbehaving agent can't read a large document
        # forever. ~20 turns is room for one initial read, several paged
        # follow-ups on a 10-K, and the final response.
        max_turns=20,
    )

    text_parts: list[str] = []
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    text_parts.append(block.text)

    elapsed = time.monotonic() - started_at
    print(f"[{elapsed:6.1f}s] done.", flush=True, file=sys.stderr)
    return "".join(text_parts).strip()


async def research(
    ticker: str,
    *,
    memo_type: str = "pitch",
    model: str = DEFAULT_MODEL,
) -> Path:
    """Produce an analyst memo for ``ticker`` using the ``<memo_type>-memo`` skill.

    Reads every ``primary.md`` already under the workspace's ``corpus/filings/``,
    consults ``skills/<memo_type>-memo/SKILL.md``, and writes the final memo
    to ``data/tickers/<TICKER>/memos/<memo_type>/<YYYY-MM-DD>.md``. Citations
    are by evidence-row id (`[ev#N]`); a compact line-range → evidence-id
    map is included in the prompt so the agent can convert Read offsets
    into citations without an extra tool call.

    Returns the path of the written memo. ``FileNotFoundError`` if the
    ticker has no fetched filings, or if the skill doesn't exist.
    """
    workspace = ensure_workspace(ticker)
    skill_md = _SKILLS_DIR / f"{memo_type}-memo" / "SKILL.md"
    if not skill_md.exists():
        raise FileNotFoundError(
            f"skill not found: {skill_md} — run `compass fetch` first or "
            f"check available skills under {_SKILLS_DIR}/."
        )
    skill_text = skill_md.read_text(encoding="utf-8")

    filings_dir = workspace / "corpus" / "filings"
    primary_paths: list[Path] = sorted(filings_dir.glob("*/*/primary.md"))
    # Pull in the most recent snapshot per source (Yahoo, future Bloomberg, etc.)
    # so memos cite market context — price, analyst consensus, recent news —
    # alongside the EDGAR filings. Older snapshots stay on disk in the ledger;
    # only the latest reaches the prompt to keep context manageable.
    snapshots_root = workspace / "corpus" / "snapshots"
    if snapshots_root.exists():
        for source_dir in sorted(snapshots_root.iterdir()):
            if not source_dir.is_dir():
                continue
            snapshots = sorted(source_dir.glob("*.md"), reverse=True)
            if snapshots:
                primary_paths.append(snapshots[0])
    if not primary_paths:
        raise FileNotFoundError(
            f"no filings ingested for {ticker.upper()} — run `compass fetch "
            f"{ticker.upper()} 10-K` and/or `compass snapshot {ticker.upper()}` first."
        )

    today = date.today().isoformat()
    memo_dir = workspace / "memos" / memo_type
    memo_dir.mkdir(parents=True, exist_ok=True)
    memo_path = memo_dir / f"{today}.md"

    citation_map = _build_citation_map(ticker)

    prompt = _build_research_prompt(
        ticker=ticker.upper(),
        memo_type=memo_type,
        skill_text=skill_text,
        primary_paths=primary_paths,
        citation_map=citation_map,
        memo_path=memo_path,
        today=today,
    )

    started_at = time.monotonic()
    print(
        f"[   0.0s] Researching {ticker.upper()} ({memo_type}-memo) with model "
        f"{model}; {len(primary_paths)} filing(s) in corpus; expect ~60–180s.",
        flush=True,
        file=sys.stderr,
    )

    # Filing dirs + memo dir + skills dir all need to be reachable.
    add_dirs = [str(workspace), str(_SKILLS_DIR)]

    options = ClaudeAgentOptions(
        model=model,
        tools=["Read", "Write"],
        allowed_tools=["Read", "Write"],
        add_dirs=add_dirs,
        hooks={
            "PreToolUse": [HookMatcher(hooks=[make_tool_logger(started_at)])],
        },
        # Bigger budget than summarize() — research wants to page through
        # multiple filings + write the memo, all of which are turns.
        max_turns=40,
    )

    async for message in query(prompt=prompt, options=options):
        # We don't accumulate text here — the artifact is the memo file
        # written via the Write tool, not the assistant's chatter.
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock) and block.text.strip():
                    # Stream agent commentary to stderr so we can see what
                    # it's thinking between tool calls.
                    elapsed_now = time.monotonic() - started_at
                    print(
                        f"[{elapsed_now:6.1f}s] [say] {block.text.strip()[:120]}",
                        flush=True,
                        file=sys.stderr,
                    )

    elapsed = time.monotonic() - started_at
    print(f"[{elapsed:6.1f}s] done.", flush=True, file=sys.stderr)

    if not memo_path.exists():
        raise RuntimeError(
            f"agent did not write the memo file at {memo_path}. Check the "
            f"audit log (`compass evidence audit`) for clues."
        )
    return memo_path


def _build_citation_map(ticker: str) -> str:
    """A compact `ev#N → line range` table for the agent's citation lookup."""
    rows = list_evidence_for_ticker(ticker, limit=500)
    if not rows:
        return "(no evidence rows yet for this ticker)"
    lines = ["| ev_id | doc                  | form  | lines       |",
             "|-------|----------------------|-------|-------------|"]
    for r in rows:
        lines.append(
            f"| {r['id']:<5} | {r['doc_id']:<20} | {r['form_type'] or '?':<5} | "
            f"{r['line_start']}-{r['line_end']:<7} |"
        )
    return "\n".join(lines)


def _build_research_prompt(
    *,
    ticker: str,
    memo_type: str,
    skill_text: str,
    primary_paths: list[Path],
    citation_map: str,
    memo_path: Path,
    today: str,
) -> str:
    paths_block = "\n".join(f"  - {p}" for p in primary_paths)
    return f"""You are Compass — an AI analyst producing a {memo_type} memo on {ticker} for a portfolio manager.

Follow the skill instructions below to the letter. They define the memo shape,
the citation rules, and the non-negotiables.

# Skill: {memo_type}-memo

{skill_text}

# Today's date

{today}

# Source filings on disk

{paths_block}

Read each file with the Read tool (use offset/limit to page through large
documents).

# Citation map: evidence-row id → file line range

When you reference a specific fact in the memo, locate the line range you
read it from in the table below and cite the matching ev_id as `[ev#N]`.
Pick the row whose line range *contains* the line you read the fact from.

{citation_map}

# Output

Write the final memo to this exact path using the Write tool:

    {memo_path}

After writing, respond in one short paragraph with: the output path you
wrote to, the count of `[ev#N]` citations you used, and any sections you
had difficulty grounding (if any).
"""
