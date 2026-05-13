/**
 * TaskProgressRail — right-rail "Progress" view scoped to one chat task.
 *
 * Each chat task can be tied to a ticker via `ChatTask.coverageTicker`.
 * When tied, this rail renders that coverage's pipeline tasks (slice 16)
 * grouped by phase, with status icons and an overall progress meter.
 *
 * When not tied (e.g. the master agent's "Daily PM operations" task),
 * the rail shows an empty state inviting the user to tie it to a ticker.
 */

import { CheckCircle2, Clock, Circle, AlertCircle, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { mockCoverages, STAGES } from '@/mocks/pipeline';
import type { PipelineTask, PipelineTaskStatus } from '@/types/domain';
import type { ApiChatTask } from '@/lib/api';

type Props = {
  task: ApiChatTask | null;
};

const STATUS_ICON: Record<PipelineTaskStatus, React.ReactNode> = {
  done: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />,
  'in-progress': <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 animate-pulse" />,
  pending: <Circle className="w-3.5 h-3.5 text-muted-foreground" />,
  review: <AlertCircle className="w-3.5 h-3.5 text-primary" />,
  deferred: <Circle className="w-3.5 h-3.5 text-muted-foreground/60" />,
  cancelled: <Circle className="w-3.5 h-3.5 text-rose-500/60" />,
};

const STATUS_LABEL: Record<PipelineTaskStatus, string> = {
  done: 'Done',
  'in-progress': 'In progress',
  pending: 'Pending',
  review: 'Review',
  deferred: 'Deferred',
  cancelled: 'Cancelled',
};

export function TaskProgressRail({ task }: Props) {
  if (!task) {
    return (
      <EmptyState
        title="No task selected"
        body="Pick a task on the left to see its pipeline progress here."
      />
    );
  }

  if (!task.coverageTicker) {
    return (
      <EmptyState
        title={task.title}
        body="This task isn't tied to a ticker yet. Tie it to a coverage name to see its pipeline broken down by phase — setup, ingest, analyze, compose, maintain."
      />
    );
  }

  const coverage = mockCoverages.find((c) => c.ticker === task.coverageTicker);
  if (!coverage) {
    return (
      <EmptyState
        title={task.title}
        body={`No coverage pipeline found for ${task.coverageTicker}. (Tied ticker exists, but it isn't in mockCoverages yet.)`}
      />
    );
  }

  const tasks = coverage.tasks;
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const inProgress = tasks.filter((t) => t.status === 'in-progress').length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  // Group tasks by phase, preserving the canonical phase order.
  const byPhase = new Map<string, PipelineTask[]>();
  for (const stage of STAGES) byPhase.set(stage.id, []);
  for (const t of tasks) {
    if (!byPhase.has(t.stage)) byPhase.set(t.stage, []);
    byPhase.get(t.stage)!.push(t);
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header: task + overall progress */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
            {task.coverageTicker}
          </Badge>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Progress
          </span>
        </div>
        <div className="text-sm font-medium leading-snug mb-2">{task.title}</div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
          <span>{done}/{total} done</span>
          {inProgress > 0 && <span>· {inProgress} in progress</span>}
          <span className="ml-auto">{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-emerald-500/80 dark:bg-emerald-400/80 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Phase-grouped task list */}
      <div className="space-y-3">
        {STAGES.map((stage) => {
          const items = byPhase.get(stage.id) ?? [];
          if (items.length === 0) return null;
          const phaseDone = items.filter((i) => i.status === 'done').length;
          return (
            <section key={stage.id}>
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-foreground/80">
                  {stage.label}
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  {phaseDone}/{items.length}
                </div>
              </div>
              <ul className="space-y-0.5">
                {items.map((t) => (
                  <li
                    key={t.id}
                    className={cn(
                      'rounded-md px-2 py-1.5 border border-transparent',
                      t.status === 'in-progress' && 'bg-amber-500/5 border-amber-500/20',
                      t.status === 'review' && 'bg-primary/5 border-primary/20',
                    )}
                    title={STATUS_LABEL[t.status]}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0">{STATUS_ICON[t.status]}</span>
                      <div className="flex-1 min-w-0">
                        <div
                          className={cn(
                            'text-xs leading-snug',
                            t.status === 'done' && 'text-muted-foreground line-through decoration-muted-foreground/40',
                          )}
                        >
                          {t.title}
                        </div>
                        {t.suggestedSkills && t.suggestedSkills.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <Wrench className="w-2.5 h-2.5 text-muted-foreground/70" />
                            <span className="text-[9px] font-mono text-muted-foreground truncate">
                              {t.suggestedSkills[0]}
                              {t.suggestedSkills.length > 1 && ` +${t.suggestedSkills.length - 1}`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Progress
      </div>
      <div className="text-sm font-medium leading-snug">{title}</div>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
