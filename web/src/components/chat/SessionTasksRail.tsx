import { CheckCircle2, Clock, Circle, Play, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { AnalystSubtask } from '@/types/domain';

const statusIcon = (s: AnalystSubtask['status']) => {
  if (s === 'done')
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />;
  if (s === 'in-progress')
    return <Clock className="w-3.5 h-3.5 text-primary" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
};

const statusLabel: Record<AnalystSubtask['status'], string> = {
  done: 'Done',
  'in-progress': 'In progress',
  pending: 'Pending',
  review: 'Review',
  deferred: 'Deferred',
  cancelled: 'Cancelled',
};

const statusBadgeCls: Record<AnalystSubtask['status'], string> = {
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'in-progress': 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  pending: 'bg-muted text-muted-foreground',
  review: 'bg-primary/15 text-primary',
  deferred: 'bg-muted text-muted-foreground',
  cancelled: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

type Props = {
  tasks: AnalystSubtask[];
  nextTask: AnalystSubtask | null;
  onUsePrompt: (prompt: string) => void;
};

export function SessionTasksRail({ tasks, nextTask, onUsePrompt }: Props) {
  if (tasks.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground italic">
        This session has no tasks attached yet.
      </div>
    );
  }

  const done = tasks.filter((t) => t.status === 'done').length;
  const inProgress = tasks.filter((t) => t.status === 'in-progress').length;
  const pending = tasks.filter((t) => t.status === 'pending').length;
  const progress = Math.round((done / tasks.length) * 100);

  return (
    <div className="p-4 space-y-4">
      {/* Summary */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Target className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {done}/{tasks.length} done · {pending} pending
            </div>
            <div className="text-sm font-medium text-foreground truncate">
              {nextTask?.title ?? 'All done 🎉'}
            </div>
          </div>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>Done: {done}</span>
          <span>In progress: {inProgress}</span>
          <span>Pending: {pending}</span>
        </div>
      </div>

      {/* Subtask list */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">
          Steps
        </div>
        <ul className="space-y-1.5">
          {tasks.map((t) => (
            <li
              key={t.id}
              className={cn(
                'rounded-md border border-border bg-card p-2.5 transition-colors',
                t.status === 'in-progress' && 'ring-1 ring-primary/30',
              )}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5">{statusIcon(t.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        'text-xs font-medium leading-snug',
                        t.status === 'done'
                          ? 'line-through text-muted-foreground'
                          : 'text-foreground',
                      )}
                    >
                      {t.title}
                    </span>
                    <span
                      className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wider shrink-0',
                        statusBadgeCls[t.status],
                      )}
                    >
                      {statusLabel[t.status]}
                    </span>
                  </div>
                  {t.whyNext && (
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                      {t.whyNext}
                    </p>
                  )}
                  {t.status !== 'done' && t.nextActionPrompt && (
                    <Button
                      onClick={() => onUsePrompt(t.nextActionPrompt!)}
                      variant="ghost"
                      size="sm"
                      className="text-[11px] h-7 px-2 mt-1.5"
                    >
                      <Play className="w-3 h-3" />
                      Use in chat
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
