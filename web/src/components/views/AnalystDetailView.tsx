import { useMemo, useState } from 'react';
import { Sparkles, Download, LineChart, FileText, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { cn, fmtElapsed } from '@/lib/utils';
import { mockAnalysts, mockMemos, mockTasks, mockUniverse } from '@/mocks/data';

type Props = {
  slug: string;
};

type Tab = 'overview' | 'coverage' | 'memos' | 'tasks' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'memos', label: 'Memos' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'profile', label: 'Profile' },
];

export function AnalystDetailView({ slug }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const analyst = useMemo(() => mockAnalysts.find((a) => a.slug === slug), [slug]);
  const memos = useMemo(() => mockMemos.filter((m) => m.analystSlug === slug), [slug]);
  const tasks = useMemo(() => mockTasks.filter((t) => t.analystSlug === slug), [slug]);
  const coverage = useMemo(
    () => mockUniverse.filter((t) => analyst?.coverage.includes(t.symbol)),
    [analyst]
  );

  if (!analyst) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Analyst not found.</div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 pt-6 pb-4 border-b border-border bg-background/60">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar initials={analyst.avatarInitials} color={analyst.avatarColor} size="lg" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{analyst.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {analyst.title} · hired {analyst.hiredAt}
              </p>
              {analyst.currentFocus && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                  <span className="spinner" /> {analyst.currentFocus}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Plus className="w-3.5 h-3.5" />
              Assign task
            </Button>
            <Button variant="default" size="sm">
              <Sparkles className="w-3.5 h-3.5" />
              Generate pitch memo
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mt-5 max-w-xl">
          <Stat label="Coverage" value={analyst.coverage.length.toString()} />
          <Stat label="Memos" value={analyst.stats.memos.toString()} />
          <Stat label="Active tasks" value={analyst.stats.activeTasks.toString()} />
          <Stat label="Done" value={analyst.stats.tasksDone.toString()} />
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-5 -mb-4">
          {TABS.map((t) => {
            const isActive = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-2 rounded-t-md text-sm font-medium transition-colors -mb-px border-b-2',
                  isActive
                    ? 'text-foreground border-primary bg-background'
                    : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-accent/50'
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 max-w-5xl mx-auto w-full">
        {tab === 'overview' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Persona</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground/90 leading-relaxed">{analyst.persona}</p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Quick task
                  </CardTitle>
                  <CardDescription>Run a standard task on a covered name.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start">
                    <Download className="w-3.5 h-3.5" />
                    Fetch latest 10-K
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <LineChart className="w-3.5 h-3.5" />
                    Yahoo snapshot
                  </Button>
                  <Button variant="default" className="w-full justify-start">
                    <FileText className="w-3.5 h-3.5" />
                    Generate pitch memo
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Recent activity</CardTitle>
                  <CardDescription>
                    {tasks.length} task{tasks.length === 1 ? '' : 's'} ·{' '}
                    {memos.length} memo{memos.length === 1 ? '' : 's'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {tasks.slice(0, 4).map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between text-sm py-1"
                      >
                        <span className="truncate">{t.description}</span>
                        <Badge
                          variant={t.status === 'done' ? 'success' : 'warning'}
                          className="text-[10px] shrink-0"
                        >
                          {t.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {tab === 'coverage' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coverage universe</CardTitle>
              <CardDescription>{coverage.length} names</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {coverage.map((t) => (
                  <div
                    key={t.symbol}
                    className="flex items-center justify-between border border-border rounded-md p-3 hover:bg-accent/30"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {t.symbol} <span className="text-muted-foreground font-normal">· {t.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{t.industry}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">${t.price.toFixed(2)}</div>
                      <div
                        className={cn(
                          'text-xs',
                          t.dayChangePct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        )}
                      >
                        {t.dayChangePct >= 0 ? '+' : ''}
                        {t.dayChangePct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {tab === 'memos' && (
          <ul className="space-y-3">
            {memos.length === 0 && (
              <li className="text-sm text-muted-foreground italic">No memos yet.</li>
            )}
            {memos.map((m) => (
              <li
                key={m.id}
                className="rounded-md border border-border bg-card p-4 hover:shadow-sm cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{m.title}</span>
                  <Badge variant="outline" className="text-[10px]">{m.date}</Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{m.excerpt}</p>
                <div className="text-[10px] text-muted-foreground mt-2">
                  {m.citationCount} citations · <span className="capitalize">{m.type.replace('-', ' ')}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {tab === 'tasks' && (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtElapsed(t.durationSec)} · {t.createdAt}
                  </div>
                </div>
                <Badge
                  variant={t.status === 'done' ? 'success' : t.status === 'running' ? 'warning' : 'destructive'}
                  className="text-[10px]"
                >
                  {t.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {tab === 'profile' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Persona</CardTitle>
              <CardDescription>How this analyst writes and reasons.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Sector</span>
                <div className="font-medium">{analyst.sector}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Hired</span>
                <div className="font-medium">{analyst.hiredAt}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Coverage</span>
                <div className="font-medium font-mono">{analyst.coverage.join(', ')}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Persona</span>
                <p className="text-foreground/90 leading-relaxed mt-1">{analyst.persona}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}
