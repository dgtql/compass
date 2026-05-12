"""SQLite-backed evidence ledger and audit log.

Single file per install at ``<data_root>/compass.db`` (one DB file, all
tables — design doc Section 5). Two tables in Slice 4:

* ``evidence`` — every chunk of every fetched doc. Populated at fetch
  time by ``compass.ingest.edgar.EdgarSource``. Memos cite rows by
  ``id`` (Slice 6); for now we just stand up the index.
* ``audit`` — every tool call the agent makes. Populated at read time
  by the ``PreToolUse`` hook in ``compass.tools``.

Connections are short-lived (open/commit/close per write batch). SQLite
handles this fine at our scale and avoids the long-running-connection
threading concerns once the FastAPI WebSocket layer arrives.
"""

from __future__ import annotations

import hashlib
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from compass.workspace import data_root

# Lines per evidence chunk. Small enough to constitute a specific citation,
# large enough to keep row counts modest (~50 rows per 10-K). Swap for
# section-aware chunking when memo citations exercise this seam.
DEFAULT_CHUNK_LINES = 100

_SCHEMA = """
CREATE TABLE IF NOT EXISTS evidence (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id          TEXT NOT NULL,
    ticker          TEXT NOT NULL,
    source          TEXT NOT NULL,
    source_url      TEXT,
    form_type       TEXT,
    retrieved_at    TEXT NOT NULL,
    local_path      TEXT NOT NULL,
    page            INTEGER,
    char_span_start INTEGER NOT NULL,
    char_span_end   INTEGER NOT NULL,
    line_start      INTEGER NOT NULL,
    line_end        INTEGER NOT NULL,
    text_hash       TEXT NOT NULL,
    content         TEXT NOT NULL,
    UNIQUE(doc_id, char_span_start, char_span_end)
);

CREATE INDEX IF NOT EXISTS idx_evidence_doc_id  ON evidence(doc_id);
CREATE INDEX IF NOT EXISTS idx_evidence_ticker  ON evidence(ticker);
CREATE INDEX IF NOT EXISTS idx_evidence_hash    ON evidence(text_hash);

CREATE TABLE IF NOT EXISTS audit (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT,
    ts              TEXT NOT NULL,
    tool_name       TEXT NOT NULL,
    tool_input_json TEXT NOT NULL,
    file_path       TEXT,
    offset_start    INTEGER,
    offset_end      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_audit_file_path  ON audit(file_path);
CREATE INDEX IF NOT EXISTS idx_audit_ts         ON audit(ts);
"""


def db_path() -> Path:
    """Where compass.db lives on disk. Honors ``COMPASS_DATA_DIR``."""
    return data_root() / "compass.db"


def init_db() -> None:
    """Create the DB file + tables if they don't exist. Idempotent."""
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.executescript(_SCHEMA)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Yield a short-lived connection; auto-commit on success, rollback on error."""
    init_db()
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# --- evidence ledger ---------------------------------------------------------


def chunk_markdown_file(
    path: Path,
    *,
    chunk_lines: int = DEFAULT_CHUNK_LINES,
) -> list[dict]:
    """Split a text/markdown file into fixed-line chunks with byte offsets.

    Each returned dict has: ``line_start``, ``line_end`` (1-indexed,
    inclusive), ``char_span_start``, ``char_span_end`` (byte offsets into
    the file), ``content`` (the chunk text), ``text_hash`` (sha256 hex).
    """
    raw = path.read_bytes()
    text = raw.decode("utf-8", errors="replace")
    lines = text.splitlines(keepends=True)
    chunks: list[dict] = []
    byte_offset = 0
    for start in range(0, len(lines), chunk_lines):
        block_lines = lines[start : start + chunk_lines]
        if not block_lines:
            continue
        content = "".join(block_lines)
        block_bytes = content.encode("utf-8")
        chunks.append(
            {
                "line_start": start + 1,
                "line_end": start + len(block_lines),
                "char_span_start": byte_offset,
                "char_span_end": byte_offset + len(block_bytes),
                "content": content,
                "text_hash": hashlib.sha256(block_bytes).hexdigest(),
            }
        )
        byte_offset += len(block_bytes)
    return chunks


def insert_evidence_for_document(
    *,
    doc_id: str,
    ticker: str,
    source: str,
    source_url: str | None,
    form_type: str | None,
    retrieved_at: datetime,
    local_path: Path,
    chunks: list[dict],
) -> int:
    """Insert chunk rows for a document. Skips chunks already in the table
    (the UNIQUE constraint on ``(doc_id, char_span_start, char_span_end)``
    makes re-fetch idempotent). Returns the number of newly-inserted rows.
    """
    retrieved_iso = retrieved_at.astimezone(timezone.utc).isoformat()
    with connect() as conn:
        cur = conn.executemany(
            """
            INSERT OR IGNORE INTO evidence (
                doc_id, ticker, source, source_url, form_type,
                retrieved_at, local_path, page,
                char_span_start, char_span_end,
                line_start, line_end,
                text_hash, content
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    doc_id,
                    ticker,
                    source,
                    source_url,
                    form_type,
                    retrieved_iso,
                    str(local_path),
                    c["char_span_start"],
                    c["char_span_end"],
                    c["line_start"],
                    c["line_end"],
                    c["text_hash"],
                    c["content"],
                )
                for c in chunks
            ],
        )
        return cur.rowcount


def list_evidence_for_ticker(ticker: str, limit: int = 50) -> list[sqlite3.Row]:
    """Return recent evidence rows for ``ticker`` (most-recent doc first)."""
    with connect() as conn:
        return list(
            conn.execute(
                """
                SELECT id, doc_id, form_type, line_start, line_end,
                       char_span_start, char_span_end, text_hash, retrieved_at
                FROM evidence
                WHERE ticker = ?
                ORDER BY retrieved_at DESC, id ASC
                LIMIT ?
                """,
                (ticker.upper(), limit),
            )
        )


def get_evidence(row_id: int) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM evidence WHERE id = ?", (row_id,)
        ).fetchone()


# --- audit log ---------------------------------------------------------------


def insert_audit(
    *,
    tool_name: str,
    tool_input_json: str,
    file_path: str | None,
    offset_start: int | None,
    offset_end: int | None,
    session_id: str | None = None,
) -> None:
    """Append one tool-call row to the audit log."""
    ts = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO audit (
                session_id, ts, tool_name, tool_input_json,
                file_path, offset_start, offset_end
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, ts, tool_name, tool_input_json, file_path, offset_start, offset_end),
        )


def recent_audit(limit: int = 20) -> list[sqlite3.Row]:
    with connect() as conn:
        return list(
            conn.execute(
                """
                SELECT id, ts, tool_name, file_path, offset_start, offset_end
                FROM audit ORDER BY id DESC LIMIT ?
                """,
                (limit,),
            )
        )
