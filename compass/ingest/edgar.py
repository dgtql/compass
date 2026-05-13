"""SEC EDGAR ingestion source, built on `edgartools`.

Slice 18: write filings under an explicit engagement root rather than the
legacy ``data/tickers/<TICKER>/`` workspace. The SQLite evidence ledger is
gone — the markdown file on disk is the evidence; citations are relative
paths into the engagement tree.

Output layout (relative to ``engagement_root``)::

    corpus/filings/<FORM>/<ACCESSION>/
        primary.md      # `Filing.markdown()` — agent reads this
        metadata.json   # filing_date, accession, period, source URL
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from edgar import Company, set_identity

from compass.ingest.base import Document, Source


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
        engagement_root: Path,
        form_type: str = "10-K",
        limit: int = 1,
    ) -> list[Document]:
        """Download the most recent ``limit`` filings of ``form_type`` into ``engagement_root``."""
        ticker_upper = ticker.upper()
        form_dir = engagement_root / "corpus" / "filings" / form_type
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
        return documents

    @staticmethod
    def _select_filings(ticker: str, form_type: str, limit: int) -> list:
        """Pull ``limit`` most-recent filings of ``form_type`` for ``ticker``."""
        company = Company(ticker)
        latest_attr = _LATEST_ATTRS.get(form_type)
        if latest_attr is not None and limit == 1:
            latest = getattr(company, latest_attr)
            return [latest] if latest is not None else []
        filings = company.get_filings(form=form_type)
        return list(filings.head(limit))
