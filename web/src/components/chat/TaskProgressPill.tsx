import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, ListChecks, Play, Target } from 'lucide-react';
import type { AnalystSubtask } from '@/types/domain';

type Props = {
  tasks: AnalystSubtask[];
  nextTask: AnalystSubtask | null;
  onStartTask?: (prompt?: string, task?: AnalystSubtask | null) => void;
  onShowAllTasks?: () => void;
};

export function TaskProgressPill({ tasks, nextTask, onStartTask, onShowAllTasks }: Props) {
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const inProgress = tasks.filter((t) => t.status === 'in-progress').length;
    const pending = tasks.filter((t) => t.status === 'pending').length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, pending, progress };
  }, [tasks]);

  const actionPrompt = nextTask?.nextActionPrompt ?? '';
  const whyNext = nextTask?.whyNext ?? '';
  const hasTasks = summary.total > 0;
  const allDone = hasTasks && summary.done === summary.total;
  if (!hasTasks) return null;

  return (
    <div className="relative w-full">
      {expanded && (
        <div className="absolute bottom-full left-0 right-0 z-20 mb-2 space-y-2 rounded-xl border border-border bg-card/95 px-3 py-2.5 shadow-xl backdrop-blur">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-300"
              style={{ width: `${summary.progress}%` }}
            />
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>Done: {summary.done}</span>
            <span>In progress: {summary.inProgress}</span>
            <span>Pending: {summary.pending}</span>
          </div>
          {whyNext && (
            <p className="line-clamp-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Why next: </span>
              {whyNext}
            </p>
          )}
          {onShowAllTasks && (
            <button
              onClick={onShowAllTasks}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-[11px] text-foreground transition-colors hover:bg-accent"
            >
              <ListChecks className="h-3 w-3" />
              All tasks
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-sm">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          {allDone ? <CheckCircle2 className="h-4 w-4" /> : <Target className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
            {summary.done}/{summary.total} done · {summary.pending} pending
          </p>
          <p className="truncate text-sm font-medium text-foreground">
            {nextTask?.title ?? 'All done 🎉'}
          </p>
        </div>
        {nextTask && (
          <button
            onClick={() => onStartTask?.(actionPrompt, nextTask)}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Play className="h-3 w-3" />
            Use in chat
          </button>
        )}
        <button
          onClick={() => setExpanded((p) => !p)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
