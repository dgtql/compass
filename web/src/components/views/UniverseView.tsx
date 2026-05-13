/**
 * UniverseView — live US ticker universe served from `/api/universe`.
 *
 * Backend source is `compass/data/universe/us-tickers.json` (seeded from
 * SEC's company_tickers_exchange.json — ~7.6k US filers). When the JSON
 * isn't present yet, the API returns 503 and we surface a clear "run
 * refresh-universe" hint rather than a generic error.
 */

import { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCcw, AlertTriangle, Plus, Check } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  addToMyUniverse,
  getExchanges,
  getMyUniverse,
  getUniverse,
  type ApiTicker,
} from '@/lib/api';

const ALL = '__all__';

export function UniverseView() {
  const [tickers, setTickers] = useState<ApiTicker[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [asOf, setAsOf] = useState<string>('');
  const [exchanges, setExchanges] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [exchange, setExchange] = useState<string>(ALL);
  // Tickers already in My universe — tracked separately so we can render
  // the "Add" / "Added" affordance without a second fetch per row.
  const [watchlistSet, setWatchlistSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getUniverse({ limit: 2000 }),
      getExchanges(),
      getMyUniverse().catch(() => ({ tickers: [] as { ticker: string }[] })),
    ])
      .then(([u, e, wl]) => {
        if (cancelled) return;
        setTickers(u.tickers);
        setTotal(u.total);
        setAsOf(u.as_of);
        setExchanges(e);
        setWatchlistSet(new Set(wl.tickers.map((t) => t.ticker)));
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function handleAdd(ticker: string) {
    // Optimistic — the API is idempotent so a duplicate add is harmless.
    setWatchlistSet((prev) => new Set([...prev, ticker]));
    try {
      await addToMyUniverse(ticker);
    } catch (err) {
      // Roll back the optimistic mark if the call failed.
      setWatchlistSet((prev) => {
        const next = new Set(prev);
        next.delete(ticker);
        return next;
      });
    }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tickers.filter((t) => {
      if (exchange !== ALL && t.exchange !== exchange) return false;
      if (!needle) return true;
      return (
        t.ticker.toLowerCase().includes(needle) ||
        t.name.toLowerCase().includes(needle) ||
        (t.sector ?? '').toLowerCase().includes(needle) ||
        (t.industry ?? '').toLowerCase().includes(needle)
      );
    });
  }, [q, exchange, tickers]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="p-8 max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ticker universe</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading
              ? 'Loading…'
              : error
                ? 'The backend is not reachable.'
                : `${total.toLocaleString()} US-listed names indexed${asOf ? ` · as of ${asOf}` : ''}.`}
          </p>
        </div>

        {error && <ErrorPanel error={error} />}

        {!error && (
          <>
            <Card>
              <CardHeader className="pb-3 flex-row items-center gap-3 space-y-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by ticker, name, sector, industry…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-1">
                  <ExchangeButton label="All" value={ALL} active={exchange === ALL} onClick={setExchange} />
                  {exchanges.map((e) => (
                    <ExchangeButton key={e} label={e} value={e} active={exchange === e} onClick={setExchange} />
                  ))}
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {loading ? '…' : `${filtered.length.toLocaleString()} names`}
                </CardTitle>
                <CardDescription>
                  Click a row to see who covers it and its recent activity. Sector / market-cap fields fill in when you run <code className="text-primary">compass refresh-universe --enrich-top N</code>.
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
                      <th className="font-medium pb-2 pr-3 text-right">Mkt cap</th>
                      <th className="font-medium pb-2 pr-3 text-right">Add</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr><td colSpan={7} className="py-6 text-center text-muted-foreground italic">Loading universe…</td></tr>
                    )}
                    {!loading && filtered.slice(0, 500).map((t) => {
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
                          <td className="py-2 pr-3 text-right text-muted-foreground text-xs">
                            {t.market_cap ? fmtCap(t.market_cap) : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <AddButton
                              inWatchlist={inWatchlist}
                              ticker={t.ticker}
                              onAdd={handleAdd}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!loading && filtered.length > 500 && (
                  <div className="mt-3 text-xs text-muted-foreground italic">
                    Showing first 500 of {filtered.length.toLocaleString()} matches — narrow the search to see more.
                  </div>
                )}
                {!loading && filtered.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground italic">
                    No tickers match your filters.
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

function ExchangeButton({
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
            <>
              Run <code className="text-primary">python -m compass.cli refresh-universe</code> (and optionally <code className="text-primary">--enrich-top 500</code> for sector / cap data) and reload this page.
            </>
          ) : (
            <>
              Start the API with <code className="text-primary">python -m compass.cli serve</code> on port 8000, then reload. Detail: <span className="font-mono text-xs">{error}</span>
            </>
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

function fmtCap(usd: number): string {
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(2)}T`;
  if (usd >= 1e9)  return `$${(usd / 1e9).toFixed(usd / 1e9 < 10 ? 1 : 0)}B`;
  if (usd >= 1e6)  return `$${(usd / 1e6).toFixed(0)}M`;
  return `$${usd.toLocaleString()}`;
}
