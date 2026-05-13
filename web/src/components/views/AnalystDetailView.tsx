import { useMemo, useState } from 'react';
import { Sparkles, Download, LineChart, FileText, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { cn, fmtElapsed } from '@/lib/utils';
import { ChatPane } from '@/components/ChatPane';
import { SessionTasksRail } from '@/components/chat/SessionTasksRail';
import {
  mockAnalysts,
  mockAnalystSubtasks,
  mockMemos,
  mockTasks,
  mockUniverse,
} from '@/mocks/data';

type Props = {
  slug: string;
};

type Tab = 'chat' | 'coverage' | 'memos' | 'tasks' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'memos', label: 'Memos' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'profile', label: 'Profile' },
];

export function AnalystDetailView({ slug }: Props) {
  const [tab, setTab] = useState<Tab>('chat');
  const analyst = useMemo(() => mockAnalysts.find((a) => a.slug === slug), [slug]);
  const memos = useMemo(() => mockMemos.filter((m) => m.analystSlug === slug), [slug]);
  const tasks = useMemo(() => mockTasks.filter((t) => t.analystSlug === slug), [slug]);
  const coverage = useMemo(
    () => mockUniverse.filter((t) => analyst?.coverage.includes(t.symbol)),
    [analyst]
  );
  if (!analyst) {
    return <div className="p-8 text-sm text-muted-foreground">Analyst not found.</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header (compact when in Chat tab) */}
      <div className="px-8 pt-5 pb-3 border-b border-border bg-background/60">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Avatar initials={analyst.avatarInitials} color={analyst.avatarColor} size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">{analyst.name}</h1>
                <Badge
                  variant={
                    analyst.status === 'working'
                      ? 'warning'
                      : analyst.status === 'review'
                        ? 'default'
                        : 'secondary'
                  }
                  className="text-[10px] uppercase"
                >
                  {analyst.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {analyst.title} · {analyst.coverage.length} names · hired {analyst.hiredAt}
              </p>
              {analyst.currentFocus && tab !== 'chat' && (
                <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                  <span className="spinner" /> {analyst.currentFocus}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-3 -mb-3">
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
      <div className="flex-1 min-h-0">
        {tab === 'chat' && (() => {
          const subtasks = mockAnalystSubtasks[analyst.slug] ?? [];
          const nextSubtask =
            subtasks.find((t) => t.status === 'in-progress') ??
            subtasks.find((t) => t.status === 'pending') ??
            null;
          const openTaskCount = subtasks.filter(
            (t) => t.status === 'pending' || t.status === 'in-progress',
          ).length;
          return (
            <ChatPane
              ownerKey={analyst.slug}
              counterparty={{
                initials: analyst.avatarInitials,
                color: analyst.avatarColor,
              }}
              placeholder={`Ask ${analyst.name.split(' ')[0]} anything — about ${analyst.sector.toLowerCase()}, a specific name, the thesis…`}
              rightRailTabs={[
                {
                  id: 'current',
                  label: 'Current',
                  content: (
                    <AnalystRightRail analyst={analyst} memos={memos} tasks={tasks} />
                  ),
                },
                {
                  id: 'tasks',
                  label: 'Tasks',
                  badge: openTaskCount > 0 ? openTaskCount : undefined,
                  content: (
                    <SessionTasksRail
                      tasks={subtasks}
                      nextTask={nextSubtask}
                      onUsePrompt={() => {
                        /* injection into composer is wired via ChatPane state; for now this is a no-op until we expose setInput */
                      }}
                    />
                  ),
                },
              ]}
            />
          );
        })()}

        {tab === 'coverage' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-5xl mx-auto">
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
                          {t.symbol}{' '}
                          <span className="text-muted-foreground font-normal">· {t.name}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{t.industry}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">${t.price.toFixed(2)}</div>
                        <div
                          className={cn(
                            'text-xs',
                            t.dayChangePct >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
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
          </div>
        )}

        {tab === 'memos' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-5xl mx-auto">
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
                    <Badge variant="outline" className="text-[10px]">
                      {m.date}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{m.excerpt}</p>
                  <div className="text-[10px] text-muted-foreground mt-2">
                    {m.citationCount} citations ·{' '}
                    <span className="capitalize">{m.type.replace('-', ' ')}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'tasks' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-5xl mx-auto">
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
                    variant={
                      t.status === 'done'
                        ? 'success'
                        : t.status === 'running'
                          ? 'warning'
                          : 'destructive'
                    }
                    className="text-[10px]"
                  >
                    {t.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'profile' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-3xl mx-auto">
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
                  <div className="font-medium font-mono text-xs">
                    {analyst.coverage.join(', ')}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Persona</span>
                  <p className="text-foreground/90 leading-relaxed mt-1">{analyst.persona}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalystRightRail({
  analyst,
  memos,
  tasks,
}: {
  analyst: ReturnType<typeof mockAnalysts.find> extends infer T ? Exclude<T, undefined> : never;
  memos: typeof mockMemos;
  tasks: typeof mockTasks;
}) {
  return (
    <div className="p-4 space-y-4">
      {analyst.currentFocus && (
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Working on
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="spinner shrink-0" />
              <span className="font-medium">{analyst.currentFocus}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Quick tasks
          </CardTitle>
          <CardDescription className="text-xs">
            Fire-and-forget; output flows into your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-1.5">
          <Button variant="outline" size="sm" className="w-full justify-start text-xs">
            <Download className="w-3 h-3" />
            Fetch latest 10-K
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start text-xs">
            <Download className="w-3 h-3" />
            Fetch latest 10-Q
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start text-xs">
            <LineChart className="w-3 h-3" />
            Yahoo snapshot
          </Button>
          <Button variant="default" size="sm" className="w-full justify-start text-xs">
            <FileText className="w-3 h-3" />
            Generate pitch memo
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
            <Plus className="w-3 h-3" />
            New task…
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Persona</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-5">
            {analyst.persona}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Recent work</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {memos.slice(0, 3).map((m) => (
            <div key={m.id} className="text-xs">
              <div className="font-medium truncate">{m.title}</div>
              <div className="text-muted-foreground">{m.date}</div>
            </div>
          ))}
          {tasks.slice(0, 2).map((t) => (
            <div
              key={t.id}
              className="text-xs flex items-center justify-between"
            >
              <span className="truncate">{t.description}</span>
              <Badge
                variant={
                  t.status === 'done'
                    ? 'success'
                    : t.status === 'running'
                      ? 'warning'
                      : 'secondary'
                }
                className="text-[9px] uppercase shrink-0"
              >
                {t.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
