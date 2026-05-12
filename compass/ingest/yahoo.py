"""Yahoo Finance ingestion source — market context for a covered ticker.

Different shape from EDGAR. Where ``EdgarSource`` fetches static prose
documents (10-Ks, 10-Qs), ``YahooSource`` produces a daily *snapshot*:
current price, 52-week range, market cap, analyst consensus, recent
financials at a glance, and the top news headlines. The same Document
abstraction holds — the snapshot is rendered as a single Markdown
file and chunked into the evidence ledger like any other doc — so
downstream skills (pitch-memo, eventual maintenance-update,
earnings-reaction, morning-brief) can cite Yahoo data alongside
EDGAR filings.

Output layout:

    data/tickers/<TICKER>_<EXCH>/corpus/snapshots/yahoo/<YYYY-MM-DD>.md

One snapshot per day; re-running on the same day overwrites the file
(and re-chunks into the ledger — UNIQUE on the same byte spans makes
the DB side idempotent).
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

import yfinance as yf

from compass.db import chunk_markdown_file, insert_evidence_for_document
from compass.ingest.base import Document, Source
from compass.workspace import ensure_workspace


class YahooSource(Source):
    """Fetches market data + recent news for a ticker via ``yfinance``."""

    name = "yahoo"

    def fetch(
        self,
        ticker: str,
        *,
        history_period: str = "1y",
    ) -> list[Document]:
        """Build today's Yahoo snapshot for ``ticker`` and write it to the workspace.

        Returns a one-element list (one snapshot per call) so the signature
        matches ``EdgarSource.fetch`` and ``Source.fetch``.
        """
        ticker_upper = ticker.upper()
        workspace = ensure_workspace(ticker)
        out_dir = workspace / "corpus" / "snapshots" / "yahoo"
        out_dir.mkdir(parents=True, exist_ok=True)

        today = date.today().isoformat()
        out_path = out_dir / f"{today}.md"

        t = yf.Ticker(ticker_upper)
        info = t.info or {}
        hist = _safe_history(t, history_period)
        financials = _safe_df(t, "financials")
        balance_sheet = _safe_df(t, "balance_sheet")
        news = _safe_news(t)

        markdown = _render_snapshot(
            ticker=ticker_upper,
            as_of=today,
            info=info,
            hist=hist,
            financials=financials,
            balance_sheet=balance_sheet,
            news=news,
        )
        out_path.write_text(markdown, encoding="utf-8")

        retrieved_at = datetime.now(timezone.utc)
        doc = Document(
            source=self.name,
            source_id=today,
            ticker=ticker_upper,
            form_type="snapshot",
            retrieved_at=retrieved_at,
            local_path=out_path,
            source_url=f"https://finance.yahoo.com/quote/{ticker_upper}/",
        )

        chunks = chunk_markdown_file(out_path)
        insert_evidence_for_document(
            doc_id=f"yahoo:{ticker_upper}:{today}",
            ticker=ticker_upper,
            source=self.name,
            source_url=doc.source_url,
            form_type="snapshot",
            retrieved_at=retrieved_at,
            local_path=out_path,
            chunks=chunks,
        )

        return [doc]


# --- yfinance defensive wrappers --------------------------------------------


def _safe_history(t: yf.Ticker, period: str):
    """Return price history or an empty DataFrame on failure."""
    try:
        return t.history(period=period, auto_adjust=True)
    except Exception:
        import pandas as pd

        return pd.DataFrame()


def _safe_df(t: yf.Ticker, attr: str):
    try:
        df = getattr(t, attr)
        return df if df is not None else None
    except Exception:
        return None


def _safe_news(t: yf.Ticker) -> list[dict]:
    try:
        items = t.news or []
        return items[:10]
    except Exception:
        return []


# --- markdown rendering ------------------------------------------------------


def _fmt_money(x: Any) -> str:
    """Format a number as $1.23M / $4.5B / $12.3K; ``-`` if unparseable."""
    try:
        n = float(x)
    except (TypeError, ValueError):
        return "—"
    if n == 0:
        return "0"
    sign = "-" if n < 0 else ""
    n = abs(n)
    for unit, scale in (("T", 1e12), ("B", 1e9), ("M", 1e6), ("K", 1e3)):
        if n >= scale:
            return f"{sign}${n / scale:.2f}{unit}"
    return f"{sign}${n:.2f}"


def _fmt_pct(numerator: float | None, denominator: float | None) -> str:
    if numerator is None or denominator is None or denominator == 0:
        return "—"
    return f"{(numerator - denominator) / denominator * 100:+.1f}%"


def _render_snapshot(
    *,
    ticker: str,
    as_of: str,
    info: dict,
    hist,
    financials,
    balance_sheet,
    news: list[dict],
) -> str:
    lines: list[str] = []
    name = info.get("longName") or info.get("shortName") or ticker
    lines.append(f"# {name} ({ticker}) — Yahoo Finance Snapshot")
    lines.append(f"*Compass · {as_of}*")
    lines.append("")

    # --- Price ---------------------------------------------------------------
    current = info.get("currentPrice") or info.get("regularMarketPrice")
    prev_close = info.get("previousClose")
    low52 = info.get("fiftyTwoWeekLow")
    high52 = info.get("fiftyTwoWeekHigh")
    mcap = info.get("marketCap")
    shares = info.get("sharesOutstanding")

    lines.append("## Price")
    lines.append("")
    if current is not None:
        lines.append(f"- **Current:** ${current:.2f}  ({_fmt_pct(current, prev_close)} vs prior close)")
    if low52 is not None and high52 is not None:
        lines.append(f"- **52-week range:** ${low52:.2f} – ${high52:.2f}")
    if mcap is not None:
        lines.append(f"- **Market cap:** {_fmt_money(mcap)}")
    if shares is not None:
        lines.append(f"- **Shares outstanding:** {_fmt_money(shares).lstrip('$')}")

    # 30-day return from history
    if hist is not None and len(hist) >= 21:
        recent_close = float(hist["Close"].iloc[-1])
        prior_close = float(hist["Close"].iloc[-21])
        lines.append(f"- **30-day return:** {_fmt_pct(recent_close, prior_close)}")
    if hist is not None and len(hist) >= 2:
        first_close = float(hist["Close"].iloc[0])
        last_close = float(hist["Close"].iloc[-1])
        lines.append(f"- **1-year return:** {_fmt_pct(last_close, first_close)}")
    lines.append("")

    # --- Identity ------------------------------------------------------------
    lines.append("## Identity")
    lines.append("")
    for label, key in [
        ("Exchange", "exchange"),
        ("Sector", "sector"),
        ("Industry", "industry"),
        ("Currency", "currency"),
        ("Website", "website"),
    ]:
        v = info.get(key)
        if v:
            lines.append(f"- **{label}:** {v}")
    lines.append("")

    # --- Analyst consensus ---------------------------------------------------
    rec = info.get("recommendationKey")
    tgt_mean = info.get("targetMeanPrice")
    tgt_low = info.get("targetLowPrice")
    tgt_high = info.get("targetHighPrice")
    n_opinions = info.get("numberOfAnalystOpinions")
    if any(x is not None for x in (rec, tgt_mean, tgt_low, tgt_high)):
        lines.append("## Analyst consensus")
        lines.append("")
        if rec:
            lines.append(f"- **Consensus:** {rec}  ({n_opinions or '?'} analysts)")
        if tgt_mean is not None:
            range_str = ""
            if tgt_low is not None and tgt_high is not None:
                range_str = f" (range ${tgt_low:.2f} – ${tgt_high:.2f})"
            lines.append(f"- **Target price mean:** ${tgt_mean:.2f}{range_str}")
            if current is not None and tgt_mean:
                lines.append(f"- **Implied upside:** {_fmt_pct(tgt_mean, current)}")
        lines.append("")

    # --- Income statement summary -------------------------------------------
    if financials is not None and not financials.empty:
        lines.append("## Income statement (last 4 fiscal years)")
        lines.append("")
        cols = list(financials.columns)[:4]
        header = "| Metric | " + " | ".join(_fmt_year(c) for c in cols) + " |"
        sep = "|" + "---|" * (len(cols) + 1)
        lines.append(header)
        lines.append(sep)
        for label, idx in [
            ("Total revenue", "Total Revenue"),
            ("Operating income", "Operating Income"),
            ("Net income", "Net Income"),
            ("Basic EPS", "Basic EPS"),
            ("Diluted EPS", "Diluted EPS"),
        ]:
            row = _pluck_row(financials, idx, cols)
            if row is not None:
                lines.append(f"| {label} | " + " | ".join(row) + " |")
        lines.append("")

    # --- Balance sheet summary ----------------------------------------------
    if balance_sheet is not None and not balance_sheet.empty:
        lines.append("## Balance sheet (last 4 fiscal years)")
        lines.append("")
        cols = list(balance_sheet.columns)[:4]
        header = "| Metric | " + " | ".join(_fmt_year(c) for c in cols) + " |"
        sep = "|" + "---|" * (len(cols) + 1)
        lines.append(header)
        lines.append(sep)
        for label, idx in [
            ("Cash & equivalents", "Cash And Cash Equivalents"),
            ("Total debt", "Total Debt"),
            ("Net debt", "Net Debt"),
            ("Total equity", "Stockholders Equity"),
            ("Total assets", "Total Assets"),
        ]:
            row = _pluck_row(balance_sheet, idx, cols)
            if row is not None:
                lines.append(f"| {label} | " + " | ".join(row) + " |")
        lines.append("")

    # --- News ----------------------------------------------------------------
    if news:
        lines.append("## Recent news")
        lines.append("")
        for item in news[:10]:
            title, link, pub = _news_fields(item)
            lines.append(f"- {pub or '?'}: [{title}]({link})" if title else f"- {item}")
        lines.append("")

    # Strip trailing blank line so the final byte isn't a stray \n
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines) + "\n"


def _fmt_year(col) -> str:
    try:
        return str(col.year)
    except AttributeError:
        return str(col)


def _pluck_row(df, row_label: str, cols: list) -> list[str] | None:
    """Look up a row by exact label; return formatted values for ``cols`` or None."""
    if row_label not in df.index:
        return None
    row = df.loc[row_label]
    return [_fmt_money(row[c]) for c in cols]


def _news_fields(item: dict) -> tuple[str | None, str | None, str | None]:
    """yfinance changed its news shape between versions; handle both."""
    # New (>=0.2.40-ish): item = {"id": ..., "content": {"title": ..., "canonicalUrl": {"url": ...}, "pubDate": ...}}
    content = item.get("content") if isinstance(item, dict) else None
    if isinstance(content, dict):
        title = content.get("title")
        canon = content.get("canonicalUrl") or {}
        link = canon.get("url") if isinstance(canon, dict) else None
        pub = content.get("pubDate")
        if pub and isinstance(pub, str):
            pub = pub.split("T")[0]
        return title, link, pub
    # Older flat shape
    if isinstance(item, dict):
        return item.get("title"), item.get("link"), None
    return None, None, None
