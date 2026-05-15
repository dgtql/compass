"""fetch-wikipedia-overview — Wikipedia plain-text extract for the engagement ticker.

Resolves the ticker against ``compass.universe`` to get the canonical
company name, then reuses the Wikipedia fetcher from
:mod:`compass.distill` (which has the right User-Agent + redirect
handling already). Writes Markdown with a small YAML-ish header.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from compass.distill import fetch_wikipedia_extract
from compass.engagement import Engagement, Task
from compass.universe import load_universe


def _resolve_company_name(ticker: str) -> tuple[str, str | None]:
    """Map ``ticker`` → (display_name, bloomberg_ticker).

    Looks up the universe seed. Falls back to the bare ticker if the
    universe doesn't have a row (shouldn't happen if the PM added the
    ticker via the Universe page; possible if they typed a free-form
    symbol straight into chat).
    """
    universe = load_universe()
    if universe is None:
        return ticker, None
    for t in universe.tickers:
        if t.ticker == ticker:
            return t.name or ticker, t.bloomberg_ticker
    return ticker, None


def _wiki_query_from_name(name: str) -> str:
    """Trim entity suffixes that confuse Wikipedia's title resolver.

    Wikipedia article titles for European companies are typically just
    the company name without "ASA" / "PLC" / "SE" / "AG" / "SA"
    suffixes (e.g. "Aker Solutions" not "Aker Solutions ASA"). Strip
    a small set of well-known suffixes so the redirect-follower lands
    on the right page.
    """
    cleaned = name.strip()
    # Tail tokens to strip — case-insensitive, only when they're the
    # final token. Order-independent.
    suffixes = (
        "ASA", "PLC", "SE", "AG", "SA", "NV", "Ltd", "Limited", "Corp",
        "Corporation", "Inc", "Inc.", "Co", "Co.", "Group", "Holding",
        "Holdings", "S/A", "S.A.", "S.A", "AB", "Oyj", "p.l.c.",
    )
    # Strip a trailing punctuation . if present
    while cleaned.endswith("."):
        cleaned = cleaned[:-1].rstrip()
    parts = cleaned.split()
    while parts and parts[-1] in suffixes:
        parts.pop()
    cleaned = " ".join(parts) or name
    # Collapse double-spaces, strip control chars
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    company_name, bloomberg = _resolve_company_name(engagement.ticker)
    query = _wiki_query_from_name(company_name)

    extract = fetch_wikipedia_extract(query)
    # If the cleaned form misses, try the raw name as a fallback.
    if extract is None and query != company_name:
        extract = fetch_wikipedia_extract(company_name)

    today = date.today().isoformat()
    out_dir = engagement.root / "corpus" / "overview"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"wikipedia-{today}.md"

    if extract is None:
        # Soft-fail: write a marker file so the dispatcher records the
        # attempt and the agent sees "we tried but couldn't find it."
        out_path.write_text(
            f"# Wikipedia overview — not found\n\n"
            f"- ticker: `{engagement.ticker}`\n"
            f"- company_name: `{company_name}`\n"
            f"- query: `{query}`\n"
            f"- fetched_at: {today}\n\n"
            f"No English Wikipedia page resolved for this company. "
            f"Compose tasks should rely on the brief / snapshot / news instead.\n",
            encoding="utf-8",
        )
        return {
            "count": 0,
            "company_name": company_name,
            "query": query,
            "artifacts": [engagement.relative(out_path)],
        }

    source_url = f"https://en.wikipedia.org/wiki/{query.replace(' ', '_')}"
    header_lines = [
        f"# Wikipedia overview — {company_name}",
        "",
        f"- ticker: `{engagement.ticker}`",
        f"- company_name: `{company_name}`",
    ]
    if bloomberg:
        header_lines.append(f"- bloomberg_ticker: `{bloomberg}`")
    header_lines.extend([
        f"- source_url: {source_url}",
        f"- fetched_at: {today}",
        f"- wiki_chars: {len(extract)}",
        "",
        "---",
        "",
    ])
    out_path.write_text(
        "\n".join(header_lines) + extract + "\n",
        encoding="utf-8",
    )
    return {
        "count": 1,
        "company_name": company_name,
        "query": query,
        "wiki_chars": len(extract),
        "artifacts": [engagement.relative(out_path)],
    }
