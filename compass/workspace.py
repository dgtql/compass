"""Per-ticker workspace materialization.

A workspace is a directory under ``<data_root>/tickers/<TICKER_KEY>/`` that
holds everything Compass knows about a covered ticker: corpus (filings,
transcripts, press releases, news), memos, dossier/tasks state, and the
per-ticker agent prompt under ``.claude/``. Workspaces are materialized
lazily — the first time a ticker is touched, the directories are created.
"""

from __future__ import annotations

import os
from pathlib import Path

# Ticker the user types → workspace directory name. The suffix disambiguates
# same-symbol tickers across exchanges (SOC on NYSE; AKSO on Oslo). The map
# is intentionally tiny while we're building against the case-study universe;
# Slice 7+ replaces this with a configurable watchlist.
TICKER_TO_WORKSPACE: dict[str, str] = {
    "SOC": "SOC_US",
    "AKSO": "AKSO_NO",
}


def data_root() -> Path:
    """Where workspaces live on disk. Overridable via ``COMPASS_DATA_DIR``."""
    return Path(os.environ.get("COMPASS_DATA_DIR", "data")).resolve()


def workspace_key(ticker: str) -> str:
    """User-supplied ticker → workspace directory name."""
    upper = ticker.upper()
    return TICKER_TO_WORKSPACE.get(upper, upper)


def workspace_dir(ticker: str) -> Path:
    """Workspace path for ``ticker`` (does not create it on disk)."""
    return data_root() / "tickers" / workspace_key(ticker)


def ensure_workspace(ticker: str) -> Path:
    """Create the workspace + corpus directory if missing; return the root."""
    root = workspace_dir(ticker)
    (root / "corpus").mkdir(parents=True, exist_ok=True)
    return root
