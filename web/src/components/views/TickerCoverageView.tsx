import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Circle,
  ChevronRight,
  Play,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  FileText,
  Folder,
  ArrowUpRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { mockAnalysts } from '@/mocks/data';
import { STAGES, getCoverage } from '@/mocks/pipeline';
import type {
  Artifact,
  CoverageBriefKPI,
  PipelineTask,
  PipelineTaskStatus,
  StageId,
} from '@/types/domain';

type Props = {
  ticker: string;
};

const statusIcon = (s: PipelineTaskStatus) => {
  if (s === 'done') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />;
  if (s === 'in-progress') return <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />;
  if (s === 'review') return <AlertCircle className="w-3.5 h-3.5 text-primary" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
};

const statusBadgeVariant = (
  s: PipelineTaskStatus,
): 'success' | 'warning' | 'default' | 'secondary' | 'destructive' => {
  if (s === 'done') return 'success';
  if (s === 'in-progress') return 'warning';
  if (s === 'review') return 'default';
  if (s === 'cancelled') return 'destructive';
  return 'secondary';
};

const trendIcon = (t: CoverageBriefKPI['trend']) => {
  if (t === 'up') return <TrendingUp className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />;
  if (t === 'down') return <TrendingDown className="w-3 h-3 text-rose-500 dark:text-rose-400" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
};

const severityBadge = (s: 'high' | 'medium' | 'low') => {
  if (s === 'high') return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
  if (s === 'medium') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  return 'bg-muted text-muted-foreground';
};

export function TickerCoverageView({ ticker }: Props) {
  const coverage = useMemo(() => getCoverage(ticker), [ticker]);
  const analyst = useMemo(
    () => coverage && mockAnalysts.find((a) => a.slug === coverage.analystSlug),
    [coverage],
  );
  const [selectedStage, setSelectedStage] = useState<StageId>(
    coverage?.brief.startStage ?? 'setup',
  );

  if (!coverage || !analyst) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>No coverage</CardTitle>
            <CardDescription>
              {ticker} doesn't have a pipeline yet. Run the coverage-planner skill to create one.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const tasksByStage: Record<StageId, PipelineTask[]> = {
    setup: [], ingest: [], analyze: [], compose: [], maintain: [],
  };
  coverage.tasks.forEach((t) => tasksByStage[t.stage].push(t));

  const artifactsByStage: Record<StageId, Artifact[]> = {
    setup: [], ingest: [], analyze: [], compose: [], maintain: [],
  };
  coverage.artifacts.forEach((a) => artifactsByStage[a.stage].push(a));

  const stageProgress = (id: StageId) => {
    const tasks = tasksByStage[id];
    if (tasks.length === 0) return { done: 0, total: 0, pct: 0, inProgress: 0 };
    const done = tasks.filter((t) => t.status === 'done').length;
    const inProgress = tasks.filter((t) => t.status === 'in-progress').length;
    return { done, total: tasks.length, pct: Math.round((done / tasks.length) * 100), inProgress };
  };

  const activeTasks = tasksByStage[selectedStage];
  const activeArtifacts = artifactsByStage[selectedStage];

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="px-8 pt-6 pb-4 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Avatar initials={analyst.avatarInitials} color={analyst.avatarColor} size="md" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {coverage.ticker}{' '}
                <span className="text-base font-normal text-muted-foreground">· Research pipeline</span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Covered by <span className="font-medium text-foreground">{analyst.name}</span> · mode{' '}
                <span className="font-mono">{coverage.brief.mode}</span> · started at{' '}
                <span className="font-mono">{coverage.brief.startStage}</span>
              </p>
            </div>
          </div>
          <Button variant="default" size="sm">
            <Sparkles className="w-3.5 h-3.5" />
            Use in chat
          </Button>
        </div>

        {/* Thesis card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Thesis of record
            </CardTitle>
            <CardDescription className="text-xs">
              {coverage.brief.thesisOneLiner}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-foreground/90 leading-relaxed">{coverage.brief.thesisBody}</p>
          </CardContent>
        </Card>

        {/* Stages strip */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Pipeline
          </div>
          <div className="grid grid-cols-5 gap-2">
            {STAGES.map((s) => {
              const p = stageProgress(s.id);
              const isActive = s.id === selectedStage;
              const isDone = p.total > 0 && p.done === p.total;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedStage(s.id)}
                  className={cn(
                    'text-left rounded-lg border bg-card p-3 transition-all',
                    isActive
                      ? 'ring-2 ring-primary border-primary'
                      : 'border-border hover:shadow-sm hover:-translate-y-0.5',
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{s.label}</span>
                    {isDone ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : p.inProgress > 0 ? (
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                    ) : null}
                  </div>
                  <div className="text-[10px] text-muted-foreground mb-2">{s.description}</div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500"
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 font-medium">
                    {p.done}/{p.total}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Two-column body: stage tasks + stage artifacts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {STAGES.find((s) => s.id === selectedStage)?.label} tasks
              </CardTitle>
              <CardDescription className="text-xs">
                {activeTasks.length} task{activeTasks.length === 1 ? '' : 's'} in this stage
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeTasks.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No tasks here yet.</div>
              ) : (
                <ul className="space-y-2">
                  {activeTasks.map((t) => (
                    <li
                      key={t.id}
                      className={cn(
                        'rounded-md border border-border p-3 hover:bg-accent/30 transition-colors',
                        t.status === 'in-progress' && 'ring-1 ring-amber-500/30',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5">{statusIcon(t.status)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={cn(
                                'text-sm font-medium',
                                t.status === 'done' && 'line-through text-muted-foreground',
                              )}
                            >
                              {t.title}
                            </span>
                            <Badge
                              variant={statusBadgeVariant(t.status)}
                              className="text-[9px] uppercase shrink-0"
                            >
                              {t.status}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {t.suggestedSkills.map((s) => (
                              <span
                                key={s}
                                className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                              >
                                {s}
                              </span>
                            ))}
                            {t.requiresHumanApproval && (
                              <span className="text-[9px] uppercase font-semibold tracking-wider text-amber-700 dark:text-amber-300">
                                · review required
                              </span>
                            )}
                          </div>
                          {t.artifactPath && (
                            <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                              → {t.artifactPath}
                            </div>
                          )}
                          {t.nextActionPrompt && t.status !== 'done' && (
                            <Button variant="ghost" size="sm" className="text-[11px] h-7 px-2 mt-2">
                              <Play className="w-3 h-3" /> Use in chat
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Folder className="w-4 h-4 text-primary" />
                {STAGES.find((s) => s.id === selectedStage)?.label} artifacts
              </CardTitle>
              <CardDescription className="text-xs">
                Files produced by tasks in this stage.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeArtifacts.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">
                  No artifacts yet — tasks in this stage haven't produced files.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {activeArtifacts.map((a) => (
                    <li key={a.path} className="flex items-start gap-2 p-2 rounded hover:bg-accent/30">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{a.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate">
                          {a.path}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {a.type} · {a.size} · {a.updatedAt}
                        </div>
                      </div>
                      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* KPIs + Risks + Catalysts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">KPIs</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {coverage.brief.kpis.map((k) => (
                  <li key={k.name} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{k.name}</span>
                      <span className="font-mono">{k.current}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span>target {k.target}</span>
                      <span className="flex items-center gap-1">{trendIcon(k.trend)} {k.trend}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Risks (ranked)</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {coverage.brief.risks.map((r) => (
                  <li key={r.rank} className="text-xs flex items-start gap-2">
                    <span className="font-mono text-muted-foreground w-3 shrink-0">{r.rank}.</span>
                    <span className="flex-1">{r.risk}</span>
                    <span className={cn('text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded', severityBadge(r.severity))}>
                      {r.severity}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Catalysts</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {coverage.brief.catalysts.map((c, i) => (
                  <li key={i} className="text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] font-mono">
                        {c.date}
                      </Badge>
                      <span className={cn('text-[9px] uppercase font-semibold', c.impact === 'high' ? 'text-rose-600 dark:text-rose-300' : 'text-muted-foreground')}>
                        {c.impact}
                      </span>
                    </div>
                    <div className="mt-0.5 leading-snug">{c.description}</div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Key questions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Key questions</CardTitle>
            <CardDescription className="text-xs">
              The PM-facing questions the pipeline is built to answer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1.5 text-sm">
              {coverage.brief.keyQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>{q}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
