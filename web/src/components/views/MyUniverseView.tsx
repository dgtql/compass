/**
 * MyUniverseView — the PM's personal watchlist.
 *
 * Subset of the read-only `/api/universe` catalog. The PM curates this
 * list (add / remove) and engagements / analyst-hire flows draw from it.
 * Storage is `data/my-universe.json` (per-user, gitignored).
 */

import { useEffect, useState, useCallback } from 'react';
import { Bookmark, X, AlertTriangle, RefreshCcw, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getMyUniverse,
  removeFromMyUniverse,
  type ApiWatchlistEntry,
} from '@/lib/api';

type Props = {
  onOpenUniverse?: () => void;
};

export function MyUniverseView({ onOpenUniverse }: Props) {
  const [tickers, setTickers] = useState<ApiWatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getMyUniverse()
      .then((wl) => setTickers(wl.tickers))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function handleRemove(ticker: string) {
    // Optimistic update — the API is idempotent so a failed call can be
    // recovered by reloading.
    setTickers((prev) => prev.filter((t) => t.ticker !== ticker));
    try {
      await removeFromMyUniverse(ticker);
    } catch (err) {
      load();
    }
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="p-8 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-primary" />
              My universe
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {loading
                ? 'Loading…'
                : error
                  ? 'Backend unreachable.'
                  : `${tickers.length} ticker${tickers.length === 1 ? '' : 's'} in your book.`}
            </p>
          </div>
          {onOpenUniverse && (
            <Button variant="default" size="sm" onClick={onOpenUniverse}>
              Browse universe
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {error && <ErrorPanel error={error} onReload={load} />}

        {!error && !loading && tickers.length === 0 && (
          <EmptyState onOpenUniverse={onOpenUniverse} />
        )}

        {!error && tickers.length > 0 && (
          <Card>
            <div className="px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="font-medium pb-2 pr-3">Ticker</th>
                    <th className="font-medium pb-2 pr-3">Name</th>
                    <th className="font-medium pb-2 pr-3">Exchange</th>
                    <th className="font-medium pb-2 pr-3">Sector</th>
                    <th className="font-medium pb-2 pr-3 text-right">Mkt cap</th>
                    <th className="font-medium pb-2 pr-3">Added</th>
                    <th className="font-medium pb-2 pr-3 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {tickers.map((t) => (
                    <tr key={t.ticker} className="border-t border-border hover:bg-accent/30">
                      <td className="py-2 pr-3 font-mono font-medium">{t.ticker}</td>
                      <td className="py-2 pr-3">{t.name ?? '—'}</td>
                      <td className="py-2 pr-3 text-xs">
                        {t.exchange ? (
                          <Badge variant="outline" className="text-[10px]">{t.exchange}</Badge>
                        ) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground text-xs">{t.sector ?? '—'}</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground text-xs">
                        {t.market_cap ? fmtCap(t.market_cap) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtAddedAt(t.added_at)}</td>
                      <td className="py-2 pr-3 text-right">
                        <button
                          onClick={() => handleRemove(t.ticker)}
                          className="text-muted-foreground hover:text-rose-500 transition-colors"
                          title={`Remove ${t.ticker} from My universe`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onOpenUniverse }: { onOpenUniverse?: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nothing in your book yet</CardTitle>
        <CardDescription>
          Your universe is the working set of names you cover. Go to the full ticker universe and pick the ones you care about.
        </CardDescription>
      </CardHeader>
      <div className="px-6 pb-6">
        <Button onClick={onOpenUniverse} size="sm">
          Browse the universe
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </Card>
  );
}

function ErrorPanel({ error, onReload }: { error: string; onReload: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Could not load your universe
        </CardTitle>
        <CardDescription>
          Start the API with <code className="text-primary">python -m compass.cli serve</code> and reload. Detail: <span className="font-mono text-xs">{error}</span>
        </CardDescription>
      </CardHeader>
      <div className="px-6 pb-4">
        <button
          onClick={onReload}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <RefreshCcw className="w-3 h-3" />
          Try again
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

function fmtAddedAt(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    const now = Date.now();
    const diffMin = (now - t) / 60000;
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${Math.floor(diffMin)}m ago`;
    if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}h ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
