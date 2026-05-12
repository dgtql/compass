"""Base types for Compass ingestion sources.

A ``Source`` knows how to pull primary documents for a ticker; a ``Document``
is the standardized record of a single fetched item, regardless of which
source it came from. Each ingestion module (``edgar.py``, future
``yahoo.py``, ``oslo_newsweb.py``, ...) implements ``Source`` and returns
a list of ``Document``s.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass(frozen=True)
class Document:
    """A single fetched primary document.

    Schema is deliberately minimal in Slice 2. Fields like ``filed_at``,
    ``content_hash``, and page counts will be added in later slices when
    a real consumer (evidence ledger, skill, memo writer) forces them.
    """

    source: str
    source_id: str
    ticker: str
    form_type: str
    retrieved_at: datetime
    local_path: Path
    source_url: str | None = None


class Source(ABC):
    """Contract every ingestion module implements."""

    name: str  # short identifier written into Document.source

    @abstractmethod
    def fetch(self, ticker: str, **kwargs) -> list[Document]:
        """Fetch one or more documents for ``ticker``.

        Implementations may define their own kwargs (e.g. ``form_type``,
        ``limit``, ``after``). Callers should pass them by keyword.
        """
        ...
