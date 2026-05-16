"""inventory-existing-ideas — scan the engagements tree and emit a JSON
index of every memo on disk.

This is the cheap deterministic step in the idea-exploration template.
The agent-driven ideation skill that runs after consumes the JSON to
quote/build on the pod's prior work alongside any new ideas it proposes.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from compass.engagement import Engagement, Task, engagements_root


MEMO_TYPE_RE = re.compile(r"memos/([^/]+)/")


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    root = engagements_root()
    out_path = engagement.root / "analysis" / "existing-memos.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    memos: list[dict[str, Any]] = []
    engagement_count = 0
    # Skip the current (idea-exploration) engagement itself — we don't
    # want the inventory to recursively include the file we're about to
    # write, and the agent's own draft isn't an "existing idea" yet.
    self_root = engagement.root.resolve()

    if root.exists():
        for analyst_dir in sorted(p for p in root.iterdir() if p.is_dir()):
            for ticker_dir in sorted(p for p in analyst_dir.iterdir() if p.is_dir()):
                if ticker_dir.resolve() == self_root:
                    continue
                engagement_count += 1
                memos_dir = ticker_dir / "memos"
                if not memos_dir.exists():
                    continue
                for memo_path in sorted(memos_dir.rglob("*.md")):
                    if not memo_path.is_file():
                        continue
                    try:
                        text = memo_path.read_text(encoding="utf-8", errors="replace")
                    except OSError:
                        continue
                    rel = memo_path.relative_to(root.parent.parent) if root.parent.parent in memo_path.parents else memo_path
                    rel_str = str(rel).replace("\\", "/")
                    posix_path = str(memo_path).replace("\\", "/")
                    m = MEMO_TYPE_RE.search(posix_path)
                    memo_type = m.group(1) if m else "unknown"
                    memos.append({
                        "analyst": analyst_dir.name,
                        "ticker": ticker_dir.name,
                        "memo_type": memo_type,
                        "path": rel_str,
                        "name": memo_path.name,
                        "modified_at": memo_path.stat().st_mtime,
                        "headline": _first_headline(text),
                        "first_paragraph": _first_paragraph(text),
                    })

    # Newest-first — the ideation agent should weight recent work more.
    memos.sort(key=lambda m: m["modified_at"], reverse=True)

    payload = {
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "engagements_root": str(root).replace("\\", "/"),
        "engagements_scanned": engagement_count,
        "memo_count": len(memos),
        "memos": memos,
    }
    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    return {
        "memo_count": len(memos),
        "engagements_scanned": engagement_count,
        "artifacts": [engagement.relative(out_path)],
    }


def _first_headline(text: str) -> str:
    """Extract the first markdown H1/H2 as the headline. Falls back to the
    first non-empty line. Trimmed to 160 chars."""
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            return line.lstrip("# ").strip()[:160]
        return line[:160]
    return ""


def _first_paragraph(text: str) -> str:
    """Return the first non-headline, non-frontmatter paragraph (≤280 chars)."""
    in_frontmatter = False
    seen_headline = False
    buf: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("---") and not buf and not seen_headline:
            in_frontmatter = not in_frontmatter
            continue
        if in_frontmatter:
            continue
        if not stripped:
            if buf:
                break
            continue
        if stripped.startswith("#"):
            seen_headline = True
            if buf:
                break
            continue
        buf.append(stripped)
        if sum(len(p) for p in buf) > 280:
            break
    paragraph = " ".join(buf)
    return paragraph[:280]
