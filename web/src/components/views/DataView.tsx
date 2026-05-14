import { useEffect, useMemo, useState } from 'react';
import {
  Database, FileText, LineChart, Mic, Newspaper, Globe, Users, Receipt,
  Loader2, RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getDataInventory,
  type ApiDataCategory,
  type ApiDataInventoryRow,
  type ApiDataItem,
} from '@/lib/api';

const CATEGORY_LABEL: Record<ApiDataCategory, string> = {
  filings:     'SEC filings',
  snapshots:   'Yahoo snapshots',
  transcripts: 'Earnings transcripts',
  news:        'News',
  ownership:   'Ownership',
  earnings:    'Earnings history',
  research:    'Web research',
};

const CATEGORY_DESC: Record<ApiDataCategory, string> = {
  filings:     '10-K · 10-Q · 8-K · S-1 from EDGAR, fetched via edgartools.',
  snapshots:   'Daily Yahoo snapshots: price, consensus, financial-statement summary.',
  transcripts: 'Earnings call transcripts. Source planned: Motley Fool / Yahoo IR.',
  news:        'Recent ticker-tagged news headlines via Yahoo.',
  ownership:   'Insider Form-4 transactions + top 13F institutional holders.',
  earnings:    'Multi-year EPS / revenue history + forward estimates.',
  research:    'Free-form web search summaries via the SDK\'s WebSearch tool.',
};

const CATEGORY_ICON: Record<ApiDataCategory, React.ComponentType<{ className?: string }>> = {
  filings:     FileText,
  snapshots:   LineChart,
  transcripts: Mic,
  news:        Newspaper,
  ownership:   Users,
  earnings:    Receipt,
  research:    Globe,
};

/** Show every category — even ones with zero items — so the PM sees what
 *  the system is *capable of* gathering, not just what's been fetched. */
const ALL_CATEGORIES: ApiDataCategory[] = [
  'filings', 'snapshots', 'news', 'ownership', 'earnings', 'transcripts', 'research',
];

export function DataView() {
  const [inventory, setInventory] = useState<ApiDataInventoryRow[]>([]);
  const [items, setItems] = useState<ApiDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ApiDataCategory | 'all'>('all');

  const refresh = () => {
    setLoading(true);
    setError(null);
    getDataInventory()
      .then((r) => { setInventory(r.inventory); setItems(r.items); })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); }, []);

  // Merge real inventory with all-categories template so empty ones render too.
  const inventoryMap = useMemo(() => {
    const m = new Map<ApiDataCategory, ApiDataInventoryRow>();
    inventory.forEach((row) => m.set(row.category, row));
    return m;
  }, [inventory]);

  const filteredItems = useMemo(() => {
    if (activeCategory === 'all') return items;
    return items.filter((i) => i.category === activeCategory);
  }, [items, activeCategory]);

  const totalItems = inventory.reduce((sum, c) => sum + c.count, 0);
  const liveSources = inventory.filter((c) => c.count > 0).length;

  return (
    <div className="overflow-y-auto scrollbar-thin h-full">
      <div className="p-8 max-w-6xl mx-auto space-y-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" /> Available data
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {loading
                ? 'Loading…'
                : `${totalItems} item${totalItems === 1 ? '' : 's'} indexed across `
                  + `${liveSources} live source${liveSources === 1 ? '' : 's'} `
                  + `(${ALL_CATEGORIES.length} total wired).`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-2">
            Couldn't load data inventory: {error}
          </div>
        )}

        {/* Source cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ALL_CATEGORIES.map((cat) => {
            const row = inventoryMap.get(cat);
            const count = row?.count ?? 0;
            const tickers = row?.tickers ?? [];
            const lastUpdated = row?.last_updated ?? null;
            const isActive = activeCategory === cat;
            const isEmpty = count === 0;
            const Icon = CATEGORY_ICON[cat];
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(isActive ? 'all' : cat)}
                disabled={isEmpty}
                className={cn(
                  'text-left rounded-lg border bg-card text-card-foreground transition-all',
                  isActive ? 'ring-2 ring-primary border-primary' : 'border-border hover:shadow-sm',
                  isEmpty && 'opacity-60 cursor-default',
                )}
              >
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{CATEGORY_LABEL[cat]}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                          {count} item{count === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                    {lastUpdated && (
                      <Badge variant="outline" className="text-[10px]">
                        {lastUpdated}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {CATEGORY_DESC[cat]}
                  </p>
                  {tickers.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {tickers.slice(0, 8).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
                        >
                          {t}
                        </span>
                      ))}
                      {tickers.length > 8 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{tickers.length - 8}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] italic text-muted-foreground pt-1">
                      Nothing fetched yet. Run a memo to pull data into this category.
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Items table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {activeCategory === 'all' ? 'All data items' : CATEGORY_LABEL[activeCategory]}
            </CardTitle>
            <CardDescription>
              {loading
                ? 'Loading…'
                : `Click a source card to filter. ${filteredItems.length} item${filteredItems.length === 1 ? '' : 's'} (newest first).`}
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading inventory…
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                Nothing to show here yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="font-medium pb-2 pr-3">Source</th>
                    <th className="font-medium pb-2 pr-3">Ticker</th>
                    <th className="font-medium pb-2 pr-3">Analyst</th>
                    <th className="font-medium pb-2 pr-3">Type</th>
                    <th className="font-medium pb-2 pr-3">Date</th>
                    <th className="font-medium pb-2 pr-3 text-right">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.slice(0, 200).map((item) => (
                    <tr
                      key={`${item.analyst}|${item.ticker}|${item.path}`}
                      className="border-t border-border hover:bg-accent/30"
                    >
                      <td className="py-2 pr-3 text-muted-foreground text-xs">
                        {CATEGORY_LABEL[item.category]}
                      </td>
                      <td className="py-2 pr-3 font-mono font-medium">{item.ticker}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{item.analyst}</td>
                      <td className="py-2 pr-3 text-xs">{item.type}</td>
                      <td className="py-2 pr-3 text-muted-foreground text-xs">{item.date}</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground text-xs">
                        {item.size}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {filteredItems.length > 200 && (
              <div className="text-[11px] text-muted-foreground italic pt-2">
                Showing 200 of {filteredItems.length} items. Filter to a source to narrow.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
