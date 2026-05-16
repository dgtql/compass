"""Tests for compass.graph_mem — the knowledge-graph derivation."""

from __future__ import annotations

from pathlib import Path

from compass.graph_mem import build_graph


def _write_memo(root: Path, analyst: str, eng_key: str, memo_type: str, name: str, body: str) -> Path:
    """Stamp out a memo under data/engagements/<analyst>/<eng_key>/memos/<type>/<name>."""
    memos_dir = root / "engagements" / analyst / eng_key / "memos" / memo_type
    memos_dir.mkdir(parents=True, exist_ok=True)
    path = memos_dir / name
    path.write_text(body, encoding="utf-8")
    return path


def test_empty_tree_returns_empty_graph(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    g = build_graph()
    assert g["stats"]["memo_count"] == 0
    assert g["nodes"] == []
    assert g["edges"] == []


def test_ticker_memo_emits_three_nodes_two_edges(tmp_path, monkeypatch) -> None:
    """A single ticker memo → memo + ticker + analyst nodes, wrote + covers edges."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    _write_memo(tmp_path, "warren-buffett", "NVDA", "pitch", "2026-01-01.md", "# NVDA Pitch\n\nGreat business.")

    g = build_graph()
    kinds = sorted(n["kind"] for n in g["nodes"])
    assert kinds == ["analyst", "memo", "ticker"]
    edge_kinds = sorted(e["kind"] for e in g["edges"])
    assert edge_kinds == ["covers", "wrote"]

    # Ticker hub uses the uppercased engagement key.
    ticker_node = next(n for n in g["nodes"] if n["kind"] == "ticker")
    assert ticker_node["id"] == "ticker:NVDA"
    # Memo headline is the H1.
    memo_node = next(n for n in g["nodes"] if n["kind"] == "memo")
    assert "NVDA Pitch" in memo_node["title"]


def test_theme_memo_becomes_theme_node_under_house_owner_hidden(tmp_path, monkeypatch) -> None:
    """IDEA-* keys → theme node (not ticker); the synthetic ``house``
    analyst is hidden from the graph."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    _write_memo(tmp_path, "house", "IDEA-CAPEX-SLOWDOWN", "ideas", "2026-01-01.md", "# Capex slowdown ideas")

    g = build_graph()
    kinds = sorted(n["kind"] for n in g["nodes"])
    # No analyst node for ``house``.
    assert kinds == ["memo", "theme"]
    theme_node = next(n for n in g["nodes"] if n["kind"] == "theme")
    assert theme_node["id"] == "theme:IDEA-CAPEX-SLOWDOWN"
    edge_kinds = sorted(e["kind"] for e in g["edges"])
    assert edge_kinds == ["explores"]


def test_cite_edge_parsed_from_memo_body(tmp_path, monkeypatch) -> None:
    """A memo that mentions ``data/engagements/<analyst>/<TICKER>/memos/.../foo.md``
    gets a ``cites`` edge to that memo node."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    _write_memo(
        tmp_path, "warren-buffett", "NVDA", "pitch", "2026-01-01.md",
        "# NVDA pitch\n\nLong NVDA.",
    )
    _write_memo(
        tmp_path, "house", "IDEA-AI-CAPEX", "ideas", "2026-01-02.md",
        "# AI capex ideas\n\n"
        "See prior pitch: `data/engagements/warren-buffett/NVDA/memos/pitch/2026-01-01.md` for context.",
    )

    g = build_graph()
    cite_edges = [e for e in g["edges"] if e["kind"] == "cites"]
    assert len(cite_edges) == 1
    e = cite_edges[0]
    assert e["source"].startswith("memo:house/IDEA-AI-CAPEX/")
    assert e["target"].startswith("memo:warren-buffett/NVDA/")


def test_shared_ticker_collapses_to_single_hub(tmp_path, monkeypatch) -> None:
    """Two analysts writing on the same ticker share the ticker node."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    _write_memo(tmp_path, "warren-buffett", "NVDA", "pitch", "a.md", "# A")
    _write_memo(tmp_path, "maria-chen", "NVDA", "pitch", "b.md", "# B")

    g = build_graph()
    tickers = [n for n in g["nodes"] if n["kind"] == "ticker"]
    assert len(tickers) == 1  # NVDA hub is shared
    memos = [n for n in g["nodes"] if n["kind"] == "memo"]
    assert len(memos) == 2
    analysts = [n for n in g["nodes"] if n["kind"] == "analyst"]
    assert len(analysts) == 2
    # Each memo has a ``covers`` edge to NVDA.
    covers = [e for e in g["edges"] if e["kind"] == "covers"]
    assert len(covers) == 2
    assert all(e["target"] == "ticker:NVDA" for e in covers)


def test_layout_assigns_coordinates(tmp_path, monkeypatch) -> None:
    """Layout assigns non-zero coords (deterministic radial). Spot-check
    that hubs land on the outer ring and memos are nearby."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    _write_memo(tmp_path, "warren-buffett", "NVDA", "pitch", "a.md", "# A")
    _write_memo(tmp_path, "maria-chen", "MSFT", "pitch", "b.md", "# B")

    g = build_graph()
    for n in g["nodes"]:
        # Every node should have an x/y; only the lone-hub edge case
        # would put one at the origin.
        assert "x" in n and "y" in n
    # Hubs are non-degenerate (not all at origin).
    hubs = [n for n in g["nodes"] if n["kind"] in ("ticker", "theme")]
    assert any(abs(n["x"]) + abs(n["y"]) > 1.0 for n in hubs)
