import { useState } from 'react';
import { Compass, FolderPlus, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import type { TickerSummary, Task } from '@/types/api';
import { TasksPanel } from '@/components/TasksPanel';

type Props = {
  tickers: TickerSummary[];
  selectedTicker: string | null;
  onSelectTicker: (t: string) => void;
  onAddTicker: (t: string) => Promise<void>;
  tasks: Task[];
  expandedTaskId: string | null;
  onToggleTask: (id: string) => void;
};

export function Sidebar({
  tickers,
  selectedTicker,
  onSelectTicker,
  onAddTicker,
  tasks,
  expandedTaskId,
  onToggleTask,
}: Props) {
  const { theme, toggle } = useTheme();
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setSubmitting(true);
    try {
      await onAddTicker(input.trim().toUpperCase());
      setInput('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className="hidden md:flex md:flex-col w-[280px] border-r border-border bg-background/80 backdrop-blur-sm">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-primary" />
          <div>
            <div className="font-semibold text-foreground leading-none">Compass</div>
            <div className="text-xs text-muted-foreground mt-1">AI analyst desk</div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>

      {/* Projects */}
      <div className="px-4 pt-3 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
        Projects
      </div>
      <ul className="px-2 py-1">
        {tickers.length === 0 && (
          <li className="px-3 py-2 text-xs text-muted-foreground italic">No projects yet.</li>
        )}
        {tickers.map((t) => (
          <li key={t.workspace_key}>
            <button
              onClick={() => onSelectTicker(t.ticker)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-sm flex justify-between items-center transition-colors',
                selectedTicker === t.ticker
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'hover:bg-accent/50 text-foreground'
              )}
            >
              <span>{t.ticker}</span>
              <span className="text-xs text-muted-foreground">
                {t.memo_count} memo{t.memo_count === 1 ? '' : 's'}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="px-3 pt-1 pb-3 flex gap-2">
        <Input
          placeholder="Add ticker (e.g. AAPL)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={submitting}
          className="h-8 text-xs"
        />
        <Button type="submit" size="sm" variant="default" disabled={submitting || !input.trim()}>
          <FolderPlus className="w-3.5 h-3.5" />
        </Button>
      </form>

      <div className="nav-divider mx-3" />

      {/* Tasks */}
      <TasksPanel tasks={tasks} expandedId={expandedTaskId} onToggle={onToggleTask} />
    </aside>
  );
}
