"""Knowledge graph — derived view over the engagements tree.

The PM's accumulated research (pitch memos, earnings reactions, maintenance
notes, idea-exploration writeups) is the *evidence* in Compass — there is
no separate notes database. This module walks ``data/engagements/`` on each
call and builds a graph the UI can render.

Node taxonomy
-------------
- ``memo``    — a Markdown file under ``<engagement>/memos/...``.
- ``ticker``  — a tradable engagement key (``NVDA``, ``MSFT``, …).
- ``theme``   — a synthetic ``IDEA-<slug>`` engagement key. Theme runs come
                out of the master agent and are filed under the ``house``
                analyst.
- ``analyst`` — an analyst slug (``warren-buffett``, ``maria-chen``, …).
                The synthetic ``house`` analyst is hidden.

Edge taxonomy
-------------
- ``wrote``    — analyst → memo (always present).
- ``covers``   — memo → ticker  (only for ticker-keyed engagements).
- ``explores`` — memo → theme   (only for ``IDEA-…`` engagements).
- ``cites``    — memo → memo    (best-effort parse of markdown body — we
                                  look for relative ``data/engagements/…``
                                  paths and ``analyst/TICKER`` mentions).

Layout
------
We compute (x, y) coordinates server-side using a clustered radial layout:
each hub (ticker / theme) sits on an outer ring; its memos orbit the hub;
analyst nodes sit on an inner ring connected to the memos they wrote.
That way the frontend can drop the payload straight into reactflow without
running a force simulation.

The whole graph is rebuilt on every request — it's cheap (one stat per memo,
one read for the headline), and there's nothing else for the planner /
dispatcher to invalidate.
"""

from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from compass.engagement import engagements_root

# Theme engagements use ``IDEA-…`` keys filed under the ``house`` analyst —
# see ``compass.chat_skills``. They're rendered as ``theme`` nodes (purple),
# not ticker nodes, and the ``house`` analyst itself is hidden from the
# graph (it's a synthetic owner, not a real persona).
THEME_KEY_PREFIX = "IDEA-"
HOUSE_ANALYST_SLUG = "house"

MEMO_TYPE_RE = re.compile(r"memos/([^/]+)/")

# Match ``data/engagements/<analyst>/<TICKER>/memos/.../<file>.md`` paths
# that appear inside a memo body — that's how the trading-idea memos cite
# prior pod work. Forward slashes only (the inventory step normalizes).
CITE_PATH_RE = re.compile(
    r"data/engagements/(?P<analyst>[^/\s]+)/(?P<ticker>[^/\s]+)/memos/(?P<rest>[^\s)`'\"]+\.md)"
)

# Markdown headline — first H1/H2 in the file. We don't pull arbitrary
# titles out of frontmatter because none of the current skills emit it.
H1_RE = re.compile(r"^#{1,2}\s+(.+?)\s*$", re.MULTILINE)


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class GraphNode:
    id: str                       # stable cross-call identity
    kind: str                     # 'memo' | 'ticker' | 'theme' | 'analyst'
    label: str                    # rendered label (short)
    title: str                    # tooltip / detail title
    x: float = 0.0
    y: float = 0.0
    data: dict[str, Any] = field(default_factory=dict)  # kind-specific extras


@dataclass
class GraphEdge:
    id: str
    source: str
    target: str
    kind: str                     # 'wrote' | 'covers' | 'explores' | 'cites'


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------


def build_graph() -> dict[str, Any]:
    """Walk the engagements tree and return ``{nodes, edges, stats}``.

    Pure function of disk state. Idempotent. Safe to call on every request.
    """
    root = engagements_root()
    nodes: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []

    # First pass: discover every memo and emit memo / ticker / theme /
    # analyst nodes + the structural edges (wrote, covers, explores). We
    # keep a parallel ``memos_by_engagement`` index for layout + citing.
    memos_by_engagement: dict[tuple[str, str], list[str]] = {}
    memo_index: dict[tuple[str, str, str], str] = {}  # (analyst, ticker, rel_path) → node_id

    if root.exists():
        for analyst_dir in sorted(p for p in root.iterdir() if p.is_dir()):
            analyst_slug = analyst_dir.name
            for eng_dir in sorted(p for p in analyst_dir.iterdir() if p.is_dir()):
                eng_key = eng_dir.name
                memos_dir = eng_dir / "memos"
                if not memos_dir.exists():
                    continue
                for memo_path in sorted(memos_dir.rglob("*.md")):
                    if not memo_path.is_file():
                        continue
                    memo_node = _make_memo_node(memo_path, analyst_slug, eng_key, eng_dir)
                    if memo_node is None:
                        continue
                    nodes[memo_node.id] = memo_node
                    memos_by_engagement.setdefault((analyst_slug, eng_key), []).append(memo_node.id)
                    rel_path = memo_path.relative_to(eng_dir).as_posix()
                    memo_index[(analyst_slug, eng_key, rel_path)] = memo_node.id

                    # Hub node — ticker or theme. The hub id is the
                    # engagement key (uppercased); ticker hubs are shared
                    # across analysts (NVDA from buffett and maria-chen
                    # connect to the same NVDA node), themes are unique.
                    hub_id, hub_kind = _hub_for(eng_key)
                    if hub_id not in nodes:
                        nodes[hub_id] = _make_hub_node(eng_key, hub_kind)
                    edge_kind = "explores" if hub_kind == "theme" else "covers"
                    edges.append(GraphEdge(
                        id=f"{memo_node.id}::{hub_id}",
                        source=memo_node.id,
                        target=hub_id,
                        kind=edge_kind,
                    ))

                    # Analyst node — skipped for the synthetic ``house``
                    # owner of idea-exploration runs (the master agent
                    # isn't a real analyst).
                    if analyst_slug != HOUSE_ANALYST_SLUG:
                        analyst_id = f"analyst:{analyst_slug}"
                        if analyst_id not in nodes:
                            nodes[analyst_id] = GraphNode(
                                id=analyst_id,
                                kind="analyst",
                                label=_humanize_slug(analyst_slug),
                                title=_humanize_slug(analyst_slug),
                                data={"slug": analyst_slug},
                            )
                        edges.append(GraphEdge(
                            id=f"{analyst_id}::{memo_node.id}",
                            source=analyst_id,
                            target=memo_node.id,
                            kind="wrote",
                        ))

    # Second pass: cite edges — re-read each memo body to find references
    # to other memos. Cheap because we've already enumerated the files.
    for memo_node in list(nodes.values()):
        if memo_node.kind != "memo":
            continue
        body = memo_node.data.get("_body", "")
        if not body:
            continue
        for match in CITE_PATH_RE.finditer(body):
            target_id = _resolve_cite(memo_index, match.group("analyst"), match.group("ticker"), match.group("rest"))
            if target_id and target_id != memo_node.id:
                eid = f"{memo_node.id}::cite::{target_id}"
                edges.append(GraphEdge(
                    id=eid, source=memo_node.id, target=target_id, kind="cites",
                ))

    # De-dup edges (cite paths can repeat inside a single memo).
    seen: set[str] = set()
    unique_edges: list[GraphEdge] = []
    for e in edges:
        if e.id in seen:
            continue
        seen.add(e.id)
        unique_edges.append(e)

    # Drop the body cache before serializing.
    for n in nodes.values():
        n.data.pop("_body", None)

    _layout(nodes, memos_by_engagement)

    return {
        "nodes": [asdict(n) for n in nodes.values()],
        "edges": [asdict(e) for e in unique_edges],
        "stats": {
            "memo_count": sum(1 for n in nodes.values() if n.kind == "memo"),
            "ticker_count": sum(1 for n in nodes.values() if n.kind == "ticker"),
            "theme_count": sum(1 for n in nodes.values() if n.kind == "theme"),
            "analyst_count": sum(1 for n in nodes.values() if n.kind == "analyst"),
            "edge_count": len(unique_edges),
            "cite_count": sum(1 for e in unique_edges if e.kind == "cites"),
        },
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _hub_for(eng_key: str) -> tuple[str, str]:
    """Return ``(node_id, kind)`` for the engagement-key hub."""
    if eng_key.upper().startswith(THEME_KEY_PREFIX):
        return (f"theme:{eng_key}", "theme")
    return (f"ticker:{eng_key.upper()}", "ticker")


def _make_hub_node(eng_key: str, kind: str) -> GraphNode:
    if kind == "theme":
        # Render themes with the prefix stripped + spacing — ``IDEA-FIND-ME-…``
        # → ``Find me …``. Keep the full slug accessible for click-through.
        label = _humanize_theme_slug(eng_key)
        title = label
        return GraphNode(
            id=f"theme:{eng_key}",
            kind="theme",
            label=label,
            title=title,
            data={"theme_key": eng_key},
        )
    return GraphNode(
        id=f"ticker:{eng_key.upper()}",
        kind="ticker",
        label=eng_key.upper(),
        title=eng_key.upper(),
        data={"ticker": eng_key.upper()},
    )


def _make_memo_node(memo_path: Path, analyst_slug: str, eng_key: str, eng_dir: Path) -> GraphNode | None:
    try:
        text = memo_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    rel_path = memo_path.relative_to(eng_dir).as_posix()
    posix = memo_path.as_posix()
    memo_type_match = MEMO_TYPE_RE.search(posix)
    memo_type = memo_type_match.group(1) if memo_type_match else "unknown"
    headline = _first_headline(text) or memo_path.stem
    node_id = f"memo:{analyst_slug}/{eng_key}/{rel_path}"
    return GraphNode(
        id=node_id,
        kind="memo",
        label=_short_label(headline, 60),
        title=headline,
        data={
            "analyst": analyst_slug,
            "engagement_key": eng_key,
            "memo_type": memo_type,
            "rel_path": rel_path,
            "filename": memo_path.name,
            "modified_at": memo_path.stat().st_mtime,
            "first_paragraph": _first_paragraph(text),
            "_body": text,  # stripped before serialization
        },
    )


def _resolve_cite(index: dict[tuple[str, str, str], str], analyst: str, ticker: str, rest: str) -> str | None:
    """Try to find a memo node whose key matches a cited path.

    The cite pattern captures the rest of the path after ``memos/``. The
    memo index is keyed on the engagement-relative path (``memos/...``),
    so prepend that segment before lookup.
    """
    rel = f"memos/{rest}".rstrip("/")
    key = (analyst, ticker, rel)
    if key in index:
        return index[key]
    # Tolerate trailing punctuation that the regex may have eaten.
    rel_clean = rel.rstrip(".,);]\"'")
    return index.get((analyst, ticker, rel_clean))


def _first_headline(text: str) -> str:
    m = H1_RE.search(text)
    return m.group(1).strip()[:160] if m else ""


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
        if stripped.startswith("*Compass"):  # generated metadata line
            continue
        buf.append(stripped)
        if sum(len(p) for p in buf) > 280:
            break
    return " ".join(buf)[:280]


def _short_label(s: str, max_len: int) -> str:
    s = s.strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1].rstrip() + "…"


def _humanize_slug(slug: str) -> str:
    return slug.replace("-", " ").replace("_", " ").title()


def _humanize_theme_slug(eng_key: str) -> str:
    raw = eng_key[len(THEME_KEY_PREFIX):] if eng_key.upper().startswith(THEME_KEY_PREFIX) else eng_key
    words = raw.replace("_", " ").replace("-", " ").strip().split()
    if not words:
        return eng_key
    pretty = " ".join(w.capitalize() if w.isupper() else w.lower() for w in words)
    return _short_label(pretty, 64)


# ---------------------------------------------------------------------------
# Layout — clustered radial
# ---------------------------------------------------------------------------


def _layout(nodes: dict[str, GraphNode], memos_by_engagement: dict[tuple[str, str], list[str]]) -> None:
    """Assign (x, y) coords to every node in place.

    Strategy:
      * Hubs (tickers + themes) sit on an outer ring, sorted with tickers
        first (alphabetical) then themes (alphabetical) so layout is stable
        across refreshes.
      * Each hub's memos orbit it on a smaller circle.
      * Analyst nodes sit on a small inner ring at the center, positioned
        roughly toward the hub-segment they author most often.
    """
    hubs = [n for n in nodes.values() if n.kind in ("ticker", "theme")]
    if not hubs:
        return

    # Stable sort: tickers first, then themes — readable and deterministic.
    hubs.sort(key=lambda n: (0 if n.kind == "ticker" else 1, n.label.lower()))

    # Outer ring sized so hubs don't overlap. ~220px between hubs is a
    # comfortable default given the memo orbit radius (~140) below.
    n_hubs = len(hubs)
    hub_radius = max(420.0, n_hubs * 130.0 / (2 * math.pi))
    memo_orbit = 160.0

    # Track angle per hub so we can place each analyst at the angular
    # centroid of its work (rough but readable).
    hub_angle: dict[str, float] = {}

    for i, hub in enumerate(hubs):
        theta = 2 * math.pi * i / n_hubs
        hub.x = hub_radius * math.cos(theta)
        hub.y = hub_radius * math.sin(theta)
        hub_angle[hub.id] = theta

        # Place memos for this hub on a small orbit around it.
        memo_ids: list[str] = []
        for (analyst_slug, eng_key), ids in memos_by_engagement.items():
            this_hub_id, _ = _hub_for(eng_key)
            if this_hub_id == hub.id:
                memo_ids.extend(ids)
        memo_ids.sort()  # stable order
        m_count = len(memo_ids)
        # Memos fan out across a 200-deg arc on the *outside* of the hub
        # (so they don't crowd the inner area where analysts/cites live).
        # If a hub has only 1-2 memos, place them straight outward.
        arc = math.radians(200) if m_count > 2 else math.radians(40 * max(m_count - 1, 0))
        for j, mid in enumerate(memo_ids):
            if m_count == 1:
                offset = 0.0
            else:
                offset = (j / (m_count - 1) - 0.5) * arc
            phi = theta + offset
            r = memo_orbit
            mx = hub.x + r * math.cos(theta) * 0.0 + r * math.cos(phi - theta + theta) * 1.0
            # Simpler: place memos on a circle outside the hub, centered on
            # the hub's radial direction. The math above collapses to:
            mx = hub.x + r * math.cos(phi)
            my = hub.y + r * math.sin(phi)
            # Push slightly outward so the cluster sits outside the hub ring.
            push = 1.0 + 0.18 * (m_count > 1)
            nodes[mid].x = (hub.x + (mx - hub.x) * push)
            nodes[mid].y = (hub.y + (my - hub.y) * push)

    # Analysts on an inner ring. Each analyst lands at the average angle
    # of the hubs they wrote memos for.
    analysts = [n for n in nodes.values() if n.kind == "analyst"]
    for analyst in analysts:
        slug = analyst.data.get("slug", "")
        # Hubs this analyst touched
        touched: list[float] = []
        for (a_slug, eng_key), _ids in memos_by_engagement.items():
            if a_slug != slug:
                continue
            hub_id, _ = _hub_for(eng_key)
            if hub_id in hub_angle:
                touched.append(hub_angle[hub_id])
        if touched:
            # Mean of angles via vector sum (handles wrap-around).
            sx = sum(math.cos(a) for a in touched)
            sy = sum(math.sin(a) for a in touched)
            angle = math.atan2(sy, sx)
        else:
            angle = 0.0
        inner_r = hub_radius * 0.35
        analyst.x = inner_r * math.cos(angle)
        analyst.y = inner_r * math.sin(angle)
