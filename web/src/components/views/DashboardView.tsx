import { useEffect, useMemo, useState } from 'react';
import { Sparkles, FileText, Clock, ListChecks, BookOpen, Lightbulb, Brain } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { fmtElapsed } from '@/lib/utils';
import {
  getDashboardActiveTasks,
  getDashboardRecentMemos,
  lookupTickers,
  type ApiAnalyst,
  type ApiDashboardMemo,
  type ApiDashboardTask,
  type ApiTicker,
} from '@/lib/api';

type Props = {
  analysts: ApiAnalyst[];
  onOpenAnalyst: (slug: string) => void;
  onOpenMasterAgent: () => void;
  onOpenHire: () => void;
  onOpenUniverse: () => void;
  onOpenKnowledge: () => void;
};

function statusColor(s: ApiAnalyst['status']) {
  if (s === 'working') return 'warning' as const;
  if (s === 'review') return 'default' as const;
  if (s === 'offline') return 'secondary' as const;
  return 'secondary' as const;
}

export function DashboardView({
  analysts,
  onOpenAnalyst,
  onOpenMasterAgent,
  onOpenHire,
  onOpenUniverse,
  onOpenKnowledge,
}: Props) {
  const [activeTasks, setActiveTasks] = useState<ApiDashboardTask[]>([]);
  const [recentMemos, setRecentMemos] = useState<ApiDashboardMemo[]>([]);
  const [coverageRows, setCoverageRows] = useState<ApiTicker[]>([]);

  // Live fetches on mount + whenever the analyst roster changes (a new
  // hire / fire / coverage edit). Cheap — backend just walks the
  // engagement tree.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getDashboardActiveTasks(20).catch(() => ({ count: 0, tasks: [] as ApiDashboardTask[] })),
      getDashboardRecentMemos(4).catch(() => ({ count: 0, memos: [] as ApiDashboardMemo[] })),
    ]).then(([t, m]) => {
      if (cancelled) return;
      setActiveTasks(t.tasks);
      setRecentMemos(m.memos);
    });
    return () => { cancelled = true; };
  }, [analysts.length]);

  // Hydrate every covered ticker against the universe so we can group by
  // GICS sector for the Coverage map. One round trip per dashboard load.
  useEffect(() => {
    const allCoverage = Array.from(
      new Set(analysts.flatMap((a) => a.coverage)),
    );
    if (allCoverage.length === 0) {
      setCoverageRows([]);
      return;
    }
    let cancelled = false;
    lookupTickers(allCoverage)
      .then((r) => { if (!cancelled) setCoverageRows(r.tickers); })
      .catch(() => { if (!cancelled) setCoverageRows([]); });
    return () => { cancelled = true; };
  }, [analysts]);

  const runningCount = activeTasks.filter((t) => t.status === 'in-progress').length;
  const pendingCount = activeTasks.filter((t) => t.status === 'pending').length;

  /** GICS sector → distinct ticker count (deduped across analysts).
   *  An analyst's stated ``sector`` is a label, not authoritative — what
   *  matters here is the sector of each ticker they actually cover. */
  const coverageBySector = useMemo(() => {
    const counts = new Map<string, Set<string>>();
    for (const t of coverageRows) {
      const s = t.sector ?? 'Unclassified';
      if (!counts.has(s)) counts.set(s, new Set());
      counts.get(s)!.add(t.ticker);
    }
    return Array.from(counts.entries())
      .map(([sector, tickers]) => ({ sector, count: tickers.size }))
      .sort((a, b) => b.count - a.count);
  }, [coverageRows]);

  return (
    <div className="overflow-y-auto scrollbar-thin h-full">
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Good morning</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your pod has {analysts.length} {analysts.length === 1 ? 'analyst' : 'analysts'} covering {' '}
              {coverageRows.length} {coverageRows.length === 1 ? 'name' : 'names'}. {' '}
              {runningCount} task{runningCount === 1 ? '' : 's'} running
              {pendingCount > 0 && <>, {pendingCount} pending</>}.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onOpenKnowledge}>
              <BookOpen className="w-3.5 h-3.5" />
              Knowledge base
            </Button>
            <Button variant="default" size="sm" onClick={onOpenMasterAgent}>
              <Sparkles className="w-3.5 h-3.5" />
              Ask master agent
            </Button>
          </div>
        </div>

        {/* Idea capture */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="w-4 h-4 text-primary" />
              Research an idea
            </CardTitle>
            <CardDescription>
              Drop a question or thesis. The master agent will route it — to a covering analyst, to
              your knowledge base, or to fresh research.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="e.g. What's the bear case on $NVDA if hyperscaler capex slows?  ·  Anything in the corpus about going-concern qualifications in offshore E&P?"
              className="min-h-[64px] resize-none"
            />
            <div className="flex justify-between items-center mt-3">
              <div className="text-xs text-muted-foreground">
                <Brain className="inline-block w-3 h-3 mr-1 -translate-y-px" />
                Auto-saves answers to your knowledge base.
              </div>
              <Button size="sm">
                <Sparkles className="w-3.5 h-3.5" />
                Ask
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* The pod */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Your pod</h2>
          <Button variant="ghost" size="sm" onClick={onOpenHire}>
            + Hire analyst
          </Button>
        </div>
        {analysts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center bg-background/40">
            <div className="text-sm font-medium mb-1">No analysts in your pod yet</div>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
              Hire your first analyst — pick a sector, optionally a coverage list, and they'll start producing work as soon as you assign a task.
            </p>
            <Button onClick={onOpenHire} size="sm">
              <Sparkles className="w-3.5 h-3.5" />
              Hire your first analyst
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {analysts.map((a) => (
              <button
                key={a.id}
                onClick={() => onOpenAnalyst(a.slug)}
                className="text-left rounded-lg border border-border bg-card hover:shadow-md transition-all p-4 space-y-2"
              >
                <div className="flex items-start gap-3">
                  <Avatar initials={a.avatar_initials} color={a.avatar_color} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{a.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.title}</div>
                  </div>
                  <Badge variant={statusColor(a.status)} className="text-[10px] uppercase">
                    {a.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {a.coverage.slice(0, 5).map((t) => (
                    <span
                      key={t}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
                    >
                      {t}
                    </span>
                  ))}
                  {a.coverage.length > 5 && (
                    <span className="text-[10px] text-muted-foreground">+{a.coverage.length - 5}</span>
                  )}
                </div>
                {a.current_focus && (
                  <div className="text-xs text-muted-foreground italic">
                    <Clock className="inline-block w-3 h-3 mr-1 -translate-y-px" />
                    {a.current_focus}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Two columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Active tasks */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="w-4 h-4 text-primary" />
                Active tasks
              </CardTitle>
              <CardDescription>What the pod is working on right now.</CardDescription>
            </CardHeader>
            <CardContent>
              {activeTasks.length === 0 ? (
                <div className="text-sm text-muted-foreground italic">Nothing running.</div>
              ) : (
                <ul className="space-y-2">
                  {activeTasks.map((t) => {
                    const analyst = analysts.find((a) => a.slug === t.analyst);
                    const isRunning = t.status === 'in-progress';
                    return (
                      <li
                        key={t.id}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 cursor-pointer"
                        onClick={() => analyst && onOpenAnalyst(analyst.slug)}
                      >
                        {isRunning ? (
                          <span className="spinner shrink-0" />
                        ) : (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-muted-foreground/50" title="pending" />
                        )}
                        {analyst && (
                          <Avatar
                            initials={analyst.avatar_initials}
                            color={analyst.avatar_color}
                            size="sm"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{t.title}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {analyst?.name ?? t.analyst} · {t.ticker}
                            {isRunning && t.elapsed_sec > 0 && (
                              <> · {fmtElapsed(t.elapsed_sec)}</>
                            )}
                            {!isRunning && <> · pending</>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Recent memos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4 text-primary" />
                Recent memos
              </CardTitle>
              <CardDescription>Latest deliverables across your pod.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentMemos.length === 0 ? (
                <div className="text-sm text-muted-foreground italic">
                  No memos yet. Hire an analyst and run a workflow.
                </div>
              ) : (
                <ul className="space-y-3">
                  {recentMemos.map((m) => {
                    const analyst = analysts.find((a) => a.slug === m.analyst);
                    return (
                      <li
                        key={m.id}
                        className="space-y-1 rounded-md p-2 -mx-2 hover:bg-accent/40 cursor-pointer"
                        onClick={() => analyst && onOpenAnalyst(analyst.slug)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {analyst && (
                              <Avatar
                                initials={analyst.avatar_initials}
                                color={analyst.avatar_color}
                                size="sm"
                              />
                            )}
                            <span className="text-sm font-medium truncate">{m.title}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {m.date}
                          </Badge>
                        </div>
                        {m.excerpt && (
                          <p className="text-xs text-muted-foreground line-clamp-2 pl-9">
                            {m.excerpt}
                          </p>
                        )}
                        <div className="pl-9 text-[10px] text-muted-foreground">
                          {analyst?.name ?? m.analyst}
                          {m.citation_count > 0 && <> · {m.citation_count} citations</>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Knowledge stream + Universe summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="w-4 h-4 text-primary" />
                Knowledge base
              </CardTitle>
              <CardDescription>
                Distilled ideas from memos and chats, backlinked by <code className="text-primary">[[ticker]]</code> and <code className="text-primary">[[concept]]</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground italic border border-dashed border-border rounded-md p-4 text-center">
                Knowledge base hasn't shipped yet. Memos and chat transcripts
                land on disk under <code className="font-mono text-[11px]">data/engagements/</code>;
                distilling them into a searchable notes index is a later slice.
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-4"
                onClick={onOpenKnowledge}
              >
                Open knowledge view →
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Coverage map</CardTitle>
              <CardDescription>
                Names covered by the pod, grouped by GICS sector.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {coverageBySector.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">
                  No coverage yet. Assign tickers to an analyst.
                </div>
              ) : (
                <div className="space-y-2">
                  {coverageBySector.map(({ sector, count }) => (
                    <div key={sector} className="flex items-center justify-between text-sm">
                      <span className="truncate pr-2">{sector}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {count} name{count === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-4"
                onClick={onOpenUniverse}
              >
                Browse ticker universe →
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
