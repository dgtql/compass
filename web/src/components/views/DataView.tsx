import { useMemo, useState } from 'react';
import { Database, FileText, LineChart, Mic, Newspaper, Globe, Download } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mockDataInventory, mockDataItems } from '@/mocks/data';
import type { DataCategory } from '@/types/domain';

const CATEGORY_LABEL: Record<DataCategory, string> = {
  filings: 'SEC filings',
  snapshots: 'Yahoo snapshots',
  transcripts: 'Earnings transcripts',
  news: 'News',
  'ir-pages': 'IR pages',
};

const CATEGORY_ICON: Record<DataCategory, React.ComponentType<{ className?: string }>> = {
  filings: FileText,
  snapshots: LineChart,
  transcripts: Mic,
  news: Newspaper,
  'ir-pages': Globe,
};

const CATEGORY_DESC: Record<DataCategory, string> = {
  filings: '10-K · 10-Q · 8-K · S-1 from EDGAR, fetched via edgartools.',
  snapshots: 'Daily Yahoo Finance snapshots: price, analyst consensus, headlines.',
  transcripts: 'Earnings call transcripts. Source planned: Motley Fool / Yahoo IR.',
  news: 'Sentiment-light news scan. Source planned: GDELT / RSS.',
  'ir-pages': 'Company IR site scrapes — press releases, annual reports.',
};

export function DataView() {
  const [activeCategory, setActiveCategory] = useState<DataCategory | 'all'>('all');

  const filteredItems = useMemo(() => {
    if (activeCategory === 'all') return mockDataItems;
    return mockDataItems.filter((i) => i.category === activeCategory);
  }, [activeCategory]);

  const totalItems = mockDataInventory.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="overflow-y-auto scrollbar-thin h-full">
      <div className="p-8 max-w-6xl mx-auto space-y-5">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" /> Available data
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {totalItems} item{totalItems === 1 ? '' : 's'} indexed across{' '}
              {mockDataInventory.filter((c) => c.count > 0).length} source
              {mockDataInventory.filter((c) => c.count > 0).length === 1 ? '' : 's'}.
            </p>
          </div>
        </div>

        {/* Source cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {mockDataInventory.map((row) => {
            const Icon = CATEGORY_ICON[row.category];
            const isActive = activeCategory === row.category;
            const isEmpty = row.count === 0;
            return (
              <button
                key={row.category}
                onClick={() => setActiveCategory(isActive ? 'all' : row.category)}
                className={cn(
                  'text-left rounded-lg border bg-card text-card-foreground transition-all',
                  isActive ? 'ring-2 ring-primary border-primary' : 'border-border hover:shadow-sm',
                  isEmpty && 'opacity-60',
                )}
              >
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{CATEGORY_LABEL[row.category]}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                          {row.count} item{row.count === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                    {row.lastUpdated && (
                      <Badge variant="outline" className="text-[10px]">
                        {row.lastUpdated}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {CATEGORY_DESC[row.category]}
                  </p>
                  {row.tickers.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {row.tickers.slice(0, 8).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
                        >
                          {t}
                        </span>
                      ))}
                      {row.tickers.length > 8 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{row.tickers.length - 8}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] italic text-muted-foreground pt-1">
                      No items yet — fetch via an analyst's Quick tasks.
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
              {activeCategory === 'all'
                ? 'All data items'
                : CATEGORY_LABEL[activeCategory]}
            </CardTitle>
            <CardDescription>
              Click a category card above to filter.{' '}
              {filteredItems.length} item{filteredItems.length === 1 ? '' : 's'}.
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            {filteredItems.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                Nothing to show here yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="font-medium pb-2 pr-3">Source</th>
                    <th className="font-medium pb-2 pr-3">Ticker</th>
                    <th className="font-medium pb-2 pr-3">Type</th>
                    <th className="font-medium pb-2 pr-3">Date</th>
                    <th className="font-medium pb-2 pr-3 text-right">Size</th>
                    <th className="font-medium pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, idx) => (
                    <tr
                      key={idx}
                      className="border-t border-border hover:bg-accent/30"
                    >
                      <td className="py-2 pr-3 text-muted-foreground text-xs">
                        {CATEGORY_LABEL[item.category]}
                      </td>
                      <td className="py-2 pr-3 font-mono font-medium">{item.ticker}</td>
                      <td className="py-2 pr-3 text-xs">{item.type}</td>
                      <td className="py-2 pr-3 text-muted-foreground text-xs">{item.date}</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground text-xs">
                        {item.size}
                      </td>
                      <td className="py-2">
                        <Button variant="ghost" size="sm" className="text-xs h-7 px-2">
                          <Download className="w-3 h-3" /> Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
