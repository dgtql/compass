"""SEC EDGAR ingestion source.

Wraps ``sec-edgar-downloader`` so the rest of Compass interacts with the
standard ``Source.fetch(...) -> list[Document]`` contract from
``compass.ingest.base``. Files land under
``<workspace>/corpus/sec-edgar-filings/<TICKER>/<FORM>/<ACC>/`` — the
on-disk layout the downloader produces. We don't post-process this layout
because the downloader's "already downloaded?" check is a directory-presence
test; moving files would force re-downloads on every fetch.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from sec_edgar_downloader import Downloader

from compass.ingest.base import Document, Source
from compass.workspace import ensure_workspace


class EdgarConfigError(RuntimeError):
    """SEC-required identification env vars are missing."""


class EdgarSource(Source):
    """Fetches SEC filings via ``sec-edgar-downloader``."""

    name = "edgar"

    def __init__(
        self,
        user_name: str | None = None,
        user_email: str | None = None,
    ) -> None:
        self.user_name = user_name or os.environ.get("COMPASS_SEC_USER_NAME")
        self.user_email = user_email or os.environ.get("COMPASS_SEC_USER_EMAIL")
        if not self.user_name or not self.user_email:
            raise EdgarConfigError(
                "EDGAR requires identification. Set COMPASS_SEC_USER_NAME and "
                "COMPASS_SEC_USER_EMAIL in your environment or .env file. "
                "See https://www.sec.gov/os/accessing-edgar-data"
            )

    def fetch(
        self,
        ticker: str,
        *,
        form_type: str = "10-K",
        limit: int = 1,
    ) -> list[Document]:
        """Download the most recent ``limit`` filings of ``form_type`` for ``ticker``."""
        ticker_upper = ticker.upper()
        workspace = ensure_workspace(ticker)
        corpus = workspace / "corpus"

        downloader = Downloader(self.user_name, self.user_email, str(corpus))
        downloader.get(form_type, ticker_upper, limit=limit)

        form_dir = corpus / "sec-edgar-filings" / ticker_upper / form_type
        if not form_dir.exists():
            return []

        retrieved_at = datetime.now(timezone.utc)
        documents: list[Document] = []
        # Accession numbers sort lexicographically by date for a fixed filer,
        # so reverse-sort gives most-recent-first. Holds because 10-K, 10-Q,
        # 8-K, S-1 etc. are self-filed (filer CIK == issuer CIK).
        for acc_dir in sorted(form_dir.iterdir(), reverse=True):
            if not acc_dir.is_dir():
                continue
            documents.append(
                Document(
                    source=self.name,
                    source_id=acc_dir.name,
                    ticker=ticker_upper,
                    form_type=form_type,
                    retrieved_at=retrieved_at,
                    local_path=acc_dir,
                )
            )
            if len(documents) >= limit:
                break
        return documents
