"""SEC EDGAR ingestion source, built on `edgartools`.

Replaced the original ``sec-edgar-downloader`` + hand-rolled BeautifulSoup
pipeline (Slice 2 + 3.5) with ``edgartools`` (Slice 2.5). The library
fetches filings, parses HTML and XBRL, and emits clean Markdown directly
— no separate cleanup step, no XBRL hidden preamble, and structured
section accessors (``business``, ``risk_factors``, ``management_discussion``,
``financials``) for later slices that need section-aware retrieval.

Output layout in the workspace:

    data/tickers/<TICKER>_<EXCH>/
      corpus/
        filings/
          <FORM>/
            <ACCESSION>/
              primary.md        # `Filing.markdown()` — agent reads this
              metadata.json     # filing_date, accession, period, source URL
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from edgar import Company, set_identity

from compass.db import chunk_markdown_file, insert_evidence_for_document
from compass.ingest.base import Document, Source
from compass.workspace import ensure_workspace


class EdgarConfigError(RuntimeError):
    """SEC-required identification env vars are missing."""


_IDENTITY_INITIALIZED = False


def _ensure_identity(user_name: str | None, user_email: str | None) -> None:
    """Configure edgartools' SEC user-agent identity. Idempotent."""
    global _IDENTITY_INITIALIZED
    name = user_name or os.environ.get("COMPASS_SEC_USER_NAME")
    email = user_email or os.environ.get("COMPASS_SEC_USER_EMAIL")
    if not name or not email:
        raise EdgarConfigError(
            "EDGAR requires identification. Set COMPASS_SEC_USER_NAME and "
            "COMPASS_SEC_USER_EMAIL in your environment or .env file. "
            "See https://www.sec.gov/os/accessing-edgar-data"
        )
    # SEC convention: "Name email@host" in one string.
    set_identity(f"{name} {email}")
    _IDENTITY_INITIALIZED = True


# Map our short-form form codes onto edgartools' Company helpers when the
# library has a dedicated "latest" accessor. Falls through to a generic
# ``get_filings(form=...)`` query for everything else.
_LATEST_ATTRS: dict[str, str] = {
    "10-K": "latest_tenk",
    "10-Q": "latest_tenq",
}


class EdgarSource(Source):
    """Fetches SEC filings via ``edgartools``."""

    name = "edgar"

    def __init__(
        self,
        user_name: str | None = None,
        user_email: str | None = None,
    ) -> None:
        _ensure_identity(user_name, user_email)

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
        form_dir = workspace / "corpus" / "filings" / form_type
        form_dir.mkdir(parents=True, exist_ok=True)

        filings_objs = self._select_filings(ticker_upper, form_type, limit)
        if not filings_objs:
            return []

        retrieved_at = datetime.now(timezone.utc)
        documents: list[Document] = []
        for obj in filings_objs:
            # ``obj`` may be a Filing or a typed report (TenK / TenQ / etc.);
            # both expose the underlying Filing in a predictable spot.
            filing = getattr(obj, "_filing", obj)
            accession = filing.accession_number
            acc_dir = form_dir / accession
            acc_dir.mkdir(exist_ok=True)

            primary_md = acc_dir / "primary.md"
            primary_md.write_text(filing.markdown(), encoding="utf-8")

            (acc_dir / "metadata.json").write_text(
                json.dumps(
                    {
                        "ticker": ticker_upper,
                        "form": form_type,
                        "accession": accession,
                        "filing_date": str(getattr(filing, "filing_date", "")),
                        "period_of_report": str(
                            getattr(filing, "period_of_report", "")
                        ),
                        "source_url": filing.filing_url,
                        "retrieved_at": retrieved_at.isoformat(),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

            documents.append(
                Document(
                    source=self.name,
                    source_id=accession,
                    ticker=ticker_upper,
                    form_type=form_type,
                    retrieved_at=retrieved_at,
                    local_path=primary_md,
                    source_url=filing.filing_url,
                )
            )

            # Slice 4: chunk the new doc and write rows into the evidence
            # ledger. UNIQUE(doc_id, char_span_start, char_span_end) makes
            # this idempotent — re-fetching the same accession is a no-op
            # on the table.
            chunks = chunk_markdown_file(primary_md)
            insert_evidence_for_document(
                doc_id=accession,
                ticker=ticker_upper,
                source=self.name,
                source_url=filing.filing_url,
                form_type=form_type,
                retrieved_at=retrieved_at,
                local_path=primary_md,
                chunks=chunks,
            )
        return documents

    @staticmethod
    def _select_filings(ticker: str, form_type: str, limit: int) -> list:
        """Pull ``limit`` most-recent filings of ``form_type`` for ``ticker``."""
        company = Company(ticker)
        latest_attr = _LATEST_ATTRS.get(form_type)
        if latest_attr is not None and limit == 1:
            latest = getattr(company, latest_attr)
            return [latest] if latest is not None else []
        # Generic path. ``head(limit)`` returns the first ``limit`` results
        # (edgartools sorts most-recent-first).
        filings = company.get_filings(form=form_type)
        return list(filings.head(limit))
