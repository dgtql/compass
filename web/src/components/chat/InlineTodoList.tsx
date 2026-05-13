import { CheckCircle2, Clock, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RichTodo } from '@/types/domain';

const statusIcon = (s: RichTodo['status']) =>
  ({
    completed: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />,
    in_progress: <Clock className="w-3.5 h-3.5 text-primary" />,
    pending: <Circle className="w-3.5 h-3.5 text-muted-foreground" />,
  })[s];

const statusBadgeCls = (s: RichTodo['status']) =>
  ({
    completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    in_progress: 'bg-primary/15 text-primary border-primary/30',
    pending: 'bg-muted text-muted-foreground border-border',
  })[s];

const priorityCls = (p: RichTodo['priority']) =>
  ({
    high: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    low: 'bg-muted text-muted-foreground border-border',
  })[p ?? 'low'];

export function InlineTodoList({
  todos,
  showTitle = true,
}: {
  todos: RichTodo[];
  showTitle?: boolean;
}) {
  if (!todos?.length) return null;
  return (
    <div className="space-y-1.5 mt-2">
      {showTitle && (
        <div className="text-[11px] font-medium text-muted-foreground mb-1.5">
          Todo list ({todos.length} {todos.length === 1 ? 'item' : 'items'})
        </div>
      )}
      {todos.map((t, i) => (
        <div
          key={t.id ?? i}
          className="flex items-start gap-2 p-2 bg-background/60 border border-border rounded"
        >
          <div className="flex-shrink-0 mt-0.5">{statusIcon(t.status)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p
                className={`text-xs font-medium ${
                  t.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'
                }`}
              >
                {t.content}
              </p>
              <div className="flex gap-1 flex-shrink-0">
                {t.priority && (
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-px capitalize ${priorityCls(t.priority)}`}
                  >
                    {t.priority}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1.5 py-px ${statusBadgeCls(t.status)}`}
                >
                  {t.status.replace('_', ' ')}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
