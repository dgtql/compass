import { Sparkles, FileText, Clock, ListChecks, BookOpen, Lightbulb, Brain } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { fmtElapsed } from '@/lib/utils';
import { mockAnalysts, mockMemos, mockTasks, mockNotes } from '@/mocks/data';
import type { Analyst } from '@/types/domain';

type Props = {
  onOpenAnalyst: (slug: string) => void;
  onOpenMasterAgent: () => void;
  onOpenHire: () => void;
  onOpenUniverse: () => void;
  onOpenKnowledge: () => void;
};

function statusColor(s: Analyst['status']) {
  if (s === 'working') return 'warning' as const;
  if (s === 'review') return 'default' as const;
  if (s === 'offline') return 'secondary' as const;
  return 'secondary' as const;
}

export function DashboardView({
  onOpenAnalyst,
  onOpenMasterAgent,
  onOpenHire,
  onOpenUniverse,
  onOpenKnowledge,
}: Props) {
  const activeTasks = mockTasks.filter((t) => t.status === 'running' || t.status === 'queued');
  const recentMemos = mockMemos.slice(0, 4);
  const recentNotes = mockNotes.slice(0, 3);

  return (
    <div className="overflow-y-auto scrollbar-thin h-full">
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Good morning</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your pod has {mockAnalysts.length} analysts covering {' '}
              {mockAnalysts.reduce((sum, a) => sum + a.coverage.length, 0)} names. {' '}
              {activeTasks.length} task{activeTasks.length === 1 ? '' : 's'} running.
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {mockAnalysts.map((a) => (
            <button
              key={a.id}
              onClick={() => onOpenAnalyst(a.slug)}
              className="text-left rounded-lg border border-border bg-card hover:shadow-md transition-all p-4 space-y-2"
            >
              <div className="flex items-start gap-3">
                <Avatar initials={a.avatarInitials} color={a.avatarColor} />
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
              {a.currentFocus && (
                <div className="text-xs text-muted-foreground italic">
                  <Clock className="inline-block w-3 h-3 mr-1 -translate-y-px" />
                  {a.currentFocus}
                </div>
              )}
            </button>
          ))}
        </div>

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
                    const analyst = mockAnalysts.find((a) => a.slug === t.analystSlug);
                    return (
                      <li
                        key={t.id}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 cursor-pointer"
                        onClick={() => analyst && onOpenAnalyst(analyst.slug)}
                      >
                        <span className="spinner shrink-0" />
                        {analyst && (
                          <Avatar
                            initials={analyst.avatarInitials}
                            color={analyst.avatarColor}
                            size="sm"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{t.description}</div>
                          <div className="text-xs text-muted-foreground">
                            {analyst?.name} · {fmtElapsed(t.durationSec)}
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
              <ul className="space-y-3">
                {recentMemos.map((m) => {
                  const analyst = mockAnalysts.find((a) => a.slug === m.analystSlug);
                  return (
                    <li key={m.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {analyst && (
                            <Avatar
                              initials={analyst.avatarInitials}
                              color={analyst.avatarColor}
                              size="sm"
                            />
                          )}
                          <span className="text-sm font-medium truncate">{m.title}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {m.date}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 pl-9">
                        {m.excerpt}
                      </p>
                      <div className="pl-9 text-[10px] text-muted-foreground">
                        {m.citationCount} citations · <span className="capitalize">{m.type.replace('-', ' ')}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Knowledge stream + Universe summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="w-4 h-4 text-primary" />
                Knowledge base · recent notes
              </CardTitle>
              <CardDescription>
                Distilled ideas from memos and chats. Backlinked by <code className="text-primary">[[ticker]]</code> and <code className="text-primary">[[concept]]</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {recentNotes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-md border border-border p-3 hover:bg-accent/30 cursor-pointer"
                    onClick={onOpenKnowledge}
                  >
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{n.createdAt}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {n.body.replace(/\[\[([^\]]+)\]\]/g, '$1')}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {n.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Coverage map</CardTitle>
              <CardDescription>Names in your ticker universe.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {['Technology', 'Energy', 'Financials', 'Consumer'].map((sector) => {
                  const count = mockAnalysts
                    .filter((a) => a.sector === sector)
                    .reduce((sum, a) => sum + a.coverage.length, 0);
                  return (
                    <div key={sector} className="flex items-center justify-between text-sm">
                      <span>{sector}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {count} name{count === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
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
