import { Badge } from '@/components/ui/badge';
import { cn, fmtElapsed } from '@/lib/utils';
import type { Task, TaskEvent } from '@/types/api';

type Props = {
  tasks: Task[];
  expandedId: string | null;
  onToggle: (id: string) => void;
};

function taskLabel(t: Task): string {
  if (t.type === 'fetch_filing') return `Fetch ${(t.params.form as string) || '10-K'} · ${t.ticker}`;
  if (t.type === 'snapshot') return `Snapshot · ${t.ticker}`;
  if (t.type === 'research') {
    const memoType = (t.params.memo_type as string) || 'pitch';
    return `${memoType.charAt(0).toUpperCase() + memoType.slice(1)} memo · ${t.ticker}`;
  }
  return `${t.type} · ${t.ticker}`;
}

function statusBadge(status: Task['status']) {
  const variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' =
    status === 'done'
      ? 'success'
      : status === 'error'
        ? 'destructive'
        : status === 'running'
          ? 'warning'
          : 'secondary';
  return (
    <Badge variant={variant} className="text-[10px] uppercase tracking-wider">
      {status}
    </Badge>
  );
}

function eventLine(e: TaskEvent, idx: number) {
  const elapsed = e.elapsed != null ? `[${e.elapsed.toFixed(1)}s] ` : '';
  const msg = e.preview || e.message || e.tool_name || '';
  const colorClass =
    e.type === 'tool'
      ? 'text-primary'
      : e.type === 'say'
        ? 'text-purple-600 dark:text-purple-300'
        : e.type === 'error'
          ? 'text-destructive'
          : e.type === 'done'
            ? 'text-emerald-700 dark:text-emerald-400 font-medium'
            : 'text-muted-foreground';
  return (
    <div key={idx} className={cn('font-mono text-[10px] leading-relaxed py-0.5', colorClass)}>
      {elapsed}
      {msg}
    </div>
  );
}

export function TasksPanel({ tasks, expandedId, onToggle }: Props) {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="px-4 pt-3 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
        Tasks
      </div>
      <ul className="px-2 py-1 space-y-1">
        {tasks.length === 0 && (
          <li className="px-3 py-2 text-xs text-muted-foreground italic">No tasks yet.</li>
        )}
        {tasks.map((t) => {
          const expanded = expandedId === t.id;
          const start = t.started_at ?? t.created_at;
          const end = t.finished_at ?? Date.now() / 1000;
          const dur = start ? end - start : null;
          const isRunning = t.status === 'running';
          return (
            <li key={t.id} className="rounded-md border border-border bg-card">
              <button
                onClick={() => onToggle(t.id)}
                className="w-full text-left px-3 py-2 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium truncate">
                    {isRunning && <span className="spinner" />}
                    {taskLabel(t)}
                  </span>
                  {statusBadge(t.status)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {dur != null ? fmtElapsed(dur) : 'queued…'}
                </div>
              </button>
              {expanded && (
                <div className="px-3 pb-2">
                  <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 max-h-44 overflow-y-auto scrollbar-thin">
                    {t.events.length === 0 ? (
                      <div className="text-[10px] italic text-muted-foreground">No events yet…</div>
                    ) : (
                      t.events.slice(-50).map(eventLine)
                    )}
                  </div>
                  {t.error && (
                    <div className="mt-2 text-[11px] text-destructive">{t.error}</div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
