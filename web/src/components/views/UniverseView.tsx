import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { mockAnalysts, mockUniverse } from '@/mocks/data';

const SECTORS = ['All', 'Technology', 'Energy', 'Financials', 'Consumer'];

export function UniverseView() {
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('All');

  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return mockUniverse.filter((t) => {
      if (sector !== 'All' && t.sector !== sector) return false;
      if (!needle) return true;
      return (
        t.symbol.includes(needle) ||
        t.name.toUpperCase().includes(needle) ||
        t.industry.toUpperCase().includes(needle)
      );
    });
  }, [q, sector]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="p-8 max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ticker universe</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The pool your analysts cover from. {mockUniverse.length} names indexed.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3 flex-row items-center gap-3 space-y-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by ticker, name, industry…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1">
              {SECTORS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSector(s)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    s === sector
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-accent'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{filtered.length} names</CardTitle>
            <CardDescription>Click a row to see who covers it and its recent activity.</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="font-medium pb-2 pr-3">Symbol</th>
                  <th className="font-medium pb-2 pr-3">Name</th>
                  <th className="font-medium pb-2 pr-3">Industry</th>
                  <th className="font-medium pb-2 pr-3 text-right">Price</th>
                  <th className="font-medium pb-2 pr-3 text-right">Day</th>
                  <th className="font-medium pb-2 pr-3 text-right">Mkt cap</th>
                  <th className="font-medium pb-2">Covered by</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const coverers = mockAnalysts.filter((a) => t.coveredBy.includes(a.slug));
                  return (
                    <tr key={t.symbol} className="border-t border-border hover:bg-accent/30">
                      <td className="py-2 pr-3 font-mono font-medium">{t.symbol}</td>
                      <td className="py-2 pr-3">{t.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{t.industry}</td>
                      <td className="py-2 pr-3 text-right font-medium">${t.price.toFixed(2)}</td>
                      <td
                        className={cn(
                          'py-2 pr-3 text-right text-xs',
                          t.dayChangePct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        )}
                      >
                        {t.dayChangePct >= 0 ? '+' : ''}
                        {t.dayChangePct.toFixed(1)}%
                      </td>
                      <td className="py-2 pr-3 text-right text-muted-foreground text-xs">
                        ${t.marketCapB < 10 ? t.marketCapB.toFixed(1) : t.marketCapB.toFixed(0)}B
                      </td>
                      <td className="py-2">
                        {coverers.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">unassigned</span>
                        ) : (
                          <div className="flex gap-1">
                            {coverers.map((a) => (
                              <Badge key={a.slug} variant="outline" className="text-[10px]">
                                {a.name.split(' ')[0]}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
