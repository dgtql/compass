/**
 * UniverseView — live US ticker universe served from `/api/universe`.
 *
 * Filters route to the backend (region, exchange, cap bucket, ranked
 * search), so the table only ever holds one page of rows (≤500).
 * Pagination is server-side: the API returns `matched` (filtered total)
 * and we step through it with `offset`.
 *
 * Region selector lists US (active) and EU (placeholder / coming soon).
 * Cap-bucket selector is categorical: Blue chip / Large / Mid / Small /
 * Micro — computed once from yfinance and frozen, so it never goes
 * stale.
 */

import { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCcw, AlertTriangle, Plus, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  addToMyUniverse,
  getCapBucketLabels,
  getCapBuckets,
  getExchanges,
  getMyUniverse,
  getRegions,
  getUniverse,
  type ApiCapBucket,
  type ApiRegion,
  type ApiTicker,
} from '@/lib/api';

const PAGE_SIZE = 500;
const ALL = '__all__';

// Search input is debounced this many ms before the API call fires.
const SEARCH_DEBOUNCE_MS = 200;

export function UniverseView() {
  const [page, setPage] = useState<ApiTicker[]>([]);
  const [matched, setMatched] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [asOf, setAsOf] = useState<string>('');
  const [pageIndex, setPageIndex] = useState<number>(0);

  const [regions, setRegions] = useState<ApiRegion[]>([]);
  const [exchanges, setExchanges] = useState<string[]>([]);
  const [capBuckets, setCapBuckets] = useState<ApiCapBucket[]>([]);
  // Full label map covering non-equity buckets too (etf, preferred, …).
  // Used to render the Cap column for rows that aren't in the filter pills.
  const [capLabels, setCapLabels] = useState<Record<string, string>>({});

  const [region, setRegion] = useState<string>('US');
  const [exchange, setExchange] = useState<string>(ALL);
  const [capBucket, setCapBucket] = useState<string>(ALL);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [watchlistSet, setWatchlistSet] = useState<Set<string>>(new Set());

  // Static lookups (regions / exchanges / cap buckets / watchlist) load
  // once on mount.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getRegions().catch(() => [{ id: 'US', label: 'United States', active: true }] as ApiRegion[]),
      getExchanges().catch(() => []),
      getCapBuckets().catch(() => []),
      getCapBucketLabels().catch(() => ({}) as Record<string, string>),
      getMyUniverse().catch(() => ({ tickers: [] as { ticker: string }[] })),
    ]).then(([r, e, c, labels, wl]) => {
      if (cancelled) return;
      setRegions(r);
      setExchanges(e);
      setCapBuckets(c);
      setCapLabels(labels);
      setWatchlistSet(new Set(wl.tickers.map((t) => t.ticker)));
    });
    return () => { cancelled = true; };
  }, []);

  // Debounce search input so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to first page whenever a filter or search changes.
  useEffect(() => {
    setPageIndex(0);
  }, [region, exchange, capBucket, qDebounced]);

  // Main fetch — re-runs when any filter / page changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getUniverse({
      region,
      exchange: exchange === ALL ? undefined : exchange,
      cap_bucket: capBucket === ALL ? undefined : capBucket,
      query: qDebounced || undefined,
      offset: pageIndex * PAGE_SIZE,
      limit: PAGE_SIZE,
    })
      .then((u) => {
        if (cancelled) return;
        setPage(u.tickers);
        setMatched(u.matched);
        setTotal(u.total);
        setAsOf(u.as_of);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [region, exchange, capBucket, qDebounced, pageIndex]);

  async function handleAdd(ticker: string) {
    setWatchlistSet((prev) => new Set([...prev, ticker]));
    try {
      await addToMyUniverse(ticker);
    } catch {
      setWatchlistSet((prev) => {
        const next = new Set(prev);
        next.delete(ticker);
        return next;
      });
    }
  }

  const pageCount = Math.max(1, Math.ceil(matched / PAGE_SIZE));
  const activeRegion = regions.find((r) => r.id === region);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="p-8 max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Universe</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {error
              ? 'The backend is not reachable.'
              : region === 'EU'
                ? 'European coverage is on the roadmap — no data yet.'
                : loading
                  ? 'Loading…'
                  : `${total.toLocaleString()} US-listed names indexed${asOf ? ` · as of ${asOf}` : ''}.`}
          </p>
        </div>

        {/* Region selector */}
        {regions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Region</span>
            <div className="flex gap-1">
              {regions.map((r) => (
                <button
                  key={r.id}
                  onClick={() => r.active && setRegion(r.id)}
                  disabled={!r.active}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    r.id === region
                      ? 'bg-primary text-primary-foreground'
                      : r.active
                        ? 'bg-secondary text-secondary-foreground hover:bg-accent'
                        : 'bg-secondary/40 text-muted-foreground cursor-not-allowed',
                  )}
                  title={r.active ? r.label : `${r.label} — not yet`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <ErrorPanel error={error} />}

        {!error && region === 'EU' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No European seed yet</CardTitle>
              <CardDescription>
                Compass starts with US-listed names. European coverage will plug into the same shape (sector, cap bucket, exchange filters) when the seed lands. Switch back to <span className="text-primary cursor-pointer" onClick={() => setRegion('US')}>United States</span> for now.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {!error && region !== 'EU' && (
          <>
            {/* Search + exchange */}
            <Card>
              <CardHeader className="pb-3 flex-row items-center gap-3 space-y-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder='Type "C" for Citigroup, "TSLA" for Tesla… ranked search.'
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-1">
                  <PillButton label="All" value={ALL} active={exchange === ALL} onClick={setExchange} />
                  {exchanges.map((e) => (
                    <PillButton key={e} label={e} value={e} active={exchange === e} onClick={setExchange} />
                  ))}
                </div>
              </CardHeader>
            </Card>

            {/* Cap bucket filter */}
            {capBuckets.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0">Cap</span>
                <div className="flex gap-1 flex-wrap">
                  <PillButton label="All" value={ALL} active={capBucket === ALL} onClick={setCapBucket} />
                  {capBuckets.map((b) => (
                    <PillButton key={b.id} label={b.label} value={b.id} active={capBucket === b.id} onClick={setCapBucket} />
                  ))}
                </div>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {loading ? '…' : `${matched.toLocaleString()} matches`}
                </CardTitle>
                <CardDescription>
                  {qDebounced
                    ? 'Ranked: exact ticker → ticker prefix → name word-start → substring.'
                    : 'Showing tickers in coverage-priority order (blue chips first).'}
                </CardDescription>
              </CardHeader>
              <div className="px-6 pb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="font-medium pb-2 pr-3">Ticker</th>
                      <th className="font-medium pb-2 pr-3">Name</th>
                      <th className="font-medium pb-2 pr-3">Exchange</th>
                      <th className="font-medium pb-2 pr-3">Sector</th>
                      <th className="font-medium pb-2 pr-3">Industry</th>
                      <th className="font-medium pb-2 pr-3">Cap</th>
                      <th className="font-medium pb-2 pr-3 text-right">Add</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr><td colSpan={7} className="py-6 text-center text-muted-foreground italic">Loading…</td></tr>
                    )}
                    {!loading && page.map((t) => {
                      const inWatchlist = watchlistSet.has(t.ticker);
                      return (
                        <tr key={t.cik} className="border-t border-border hover:bg-accent/30">
                          <td className="py-2 pr-3 font-mono font-medium">{t.ticker}</td>
                          <td className="py-2 pr-3">{t.name}</td>
                          <td className="py-2 pr-3 text-xs">
                            <Badge variant="outline" className="text-[10px]">{t.exchange}</Badge>
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground text-xs">{t.sector ?? '—'}</td>
                          <td className="py-2 pr-3 text-muted-foreground text-xs">{t.industry ?? '—'}</td>
                          <td className="py-2 pr-3 text-xs">{capLabel(t.cap_bucket, capLabels, capBuckets)}</td>
                          <td className="py-2 pr-3 text-right">
                            <AddButton inWatchlist={inWatchlist} ticker={t.ticker} onAdd={handleAdd} />
                          </td>
                        </tr>
                      );
                    })}
                    {!loading && page.length === 0 && (
                      <tr><td colSpan={7} className="py-8 text-center text-muted-foreground italic">No tickers match these filters.</td></tr>
                    )}
                  </tbody>
                </table>

                {/* Pagination */}
                {!loading && matched > PAGE_SIZE && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                    <button
                      onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                      disabled={pageIndex === 0}
                      className={cn(
                        'inline-flex items-center gap-1 text-xs transition-colors',
                        pageIndex === 0 ? 'text-muted-foreground/50 cursor-not-allowed' : 'text-foreground hover:text-primary',
                      )}
                    >
                      <ChevronLeft className="w-3 h-3" />
                      Prev
                    </button>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Page {pageIndex + 1} of {pageCount.toLocaleString()}
                      <span className="ml-2 text-muted-foreground/70">
                        ({(pageIndex * PAGE_SIZE + 1).toLocaleString()}–{(pageIndex * PAGE_SIZE + page.length).toLocaleString()} of {matched.toLocaleString()})
                      </span>
                    </span>
                    <button
                      onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                      disabled={pageIndex >= pageCount - 1}
                      className={cn(
                        'inline-flex items-center gap-1 text-xs transition-colors',
                        pageIndex >= pageCount - 1 ? 'text-muted-foreground/50 cursor-not-allowed' : 'text-foreground hover:text-primary',
                      )}
                    >
                      Next
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function capLabel(
  value: string | null,
  labels: Record<string, string>,
  buckets: ApiCapBucket[],
): string {
  if (!value) return '—';
  // Prefer the full label map (covers non-equity); fall back to the filter
  // list, then to the raw id.
  return labels[value] ?? buckets.find((b) => b.id === value)?.label ?? value;
}

function PillButton({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  onClick: (v: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(value)}
      className={cn(
        'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-secondary-foreground hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}

function AddButton({
  inWatchlist,
  ticker,
  onAdd,
}: {
  inWatchlist: boolean;
  ticker: string;
  onAdd: (t: string) => void;
}) {
  if (inWatchlist) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400"
        title="Already in My universe"
      >
        <Check className="w-3 h-3" />
        Added
      </span>
    );
  }
  return (
    <button
      onClick={() => onAdd(ticker)}
      className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
      title={`Add ${ticker} to My universe`}
    >
      <Plus className="w-3 h-3" />
      Add
    </button>
  );
}

function ErrorPanel({ error }: { error: string }) {
  const isMissingSeed = /503|run.*refresh-universe|seed missing/i.test(error);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          {isMissingSeed ? 'Universe not yet seeded' : 'Could not reach backend'}
        </CardTitle>
        <CardDescription>
          {isMissingSeed ? (
            <>Run <code className="text-primary">python -m compass.cli refresh-universe</code> and reload.</>
          ) : (
            <>Start the API with <code className="text-primary">python -m compass.cli serve</code> (default port 8001). Detail: <span className="font-mono text-xs">{error}</span></>
          )}
        </CardDescription>
      </CardHeader>
      <div className="px-6 pb-4">
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <RefreshCcw className="w-3 h-3" />
          Reload
        </button>
      </div>
    </Card>
  );
}
