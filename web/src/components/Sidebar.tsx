import { Compass, MessageSquare, LayoutDashboard, Globe, BookOpen, Moon, Sun, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { mockAnalysts, mockTasks } from '@/mocks/data';
import type { Analyst } from '@/types/domain';

export type View =
  | { kind: 'dashboard' }
  | { kind: 'master-agent' }
  | { kind: 'universe' }
  | { kind: 'knowledge' }
  | { kind: 'analyst-detail'; slug: string };

type Props = {
  view: View;
  onNavigate: (v: View) => void;
  onOpenHire: () => void;
};

function statusDot(s: Analyst['status']) {
  const color =
    s === 'working'
      ? 'bg-amber-500'
      : s === 'review'
        ? 'bg-primary'
        : s === 'offline'
          ? 'bg-muted-foreground'
          : 'bg-emerald-500';
  return <span className={cn('w-1.5 h-1.5 rounded-full inline-block', color)} />;
}

export function Sidebar({ view, onNavigate, onOpenHire }: Props) {
  const { theme, toggle } = useTheme();
  const activeTasks = mockTasks.filter((t) => t.status === 'running' || t.status === 'queued');

  return (
    <aside className="hidden md:flex md:flex-col w-[280px] border-r border-border bg-background/80 backdrop-blur-sm">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <button
          onClick={() => onNavigate({ kind: 'dashboard' })}
          className="flex items-center gap-2"
        >
          <Compass className="w-5 h-5 text-primary" />
          <div className="text-left">
            <div className="font-semibold text-foreground leading-none">Compass</div>
            <div className="text-[10px] text-muted-foreground mt-1">AI analyst desk</div>
          </div>
        </button>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>

      {/* Top nav */}
      <div className="px-2 pt-3 pb-1 space-y-0.5">
        <NavItem
          icon={LayoutDashboard}
          label="Dashboard"
          active={view.kind === 'dashboard'}
          onClick={() => onNavigate({ kind: 'dashboard' })}
        />
        <NavItem
          icon={MessageSquare}
          label="Master agent"
          active={view.kind === 'master-agent'}
          onClick={() => onNavigate({ kind: 'master-agent' })}
          accent
        />
      </div>

      {/* Analysts */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Analysts
        </div>
        <button
          onClick={onOpenHire}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Hire analyst"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <ul className="px-2 space-y-0.5">
        {mockAnalysts.map((a) => {
          const isActive = view.kind === 'analyst-detail' && view.slug === a.slug;
          return (
            <li key={a.id}>
              <button
                onClick={() => onNavigate({ kind: 'analyst-detail', slug: a.slug })}
                className={cn(
                  'w-full text-left px-2 py-2 rounded-md flex items-center gap-2.5 transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-foreground'
                )}
              >
                <Avatar initials={a.avatarInitials} color={a.avatarColor} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight truncate">{a.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                    {statusDot(a.status)}
                    {a.sector} · {a.coverage.length}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Bottom nav */}
      <div className="px-2 pt-3 pb-1 space-y-0.5">
        <NavItem
          icon={Globe}
          label="Ticker universe"
          active={view.kind === 'universe'}
          onClick={() => onNavigate({ kind: 'universe' })}
        />
        <NavItem
          icon={BookOpen}
          label="Knowledge base"
          active={view.kind === 'knowledge'}
          onClick={() => onNavigate({ kind: 'knowledge' })}
        />
      </div>

      <div className="nav-divider mx-3 my-2" />

      {/* Active tasks */}
      <div className="px-4 pb-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
          Active tasks
        </div>
      </div>
      <ul className="px-2 pb-4 flex-1 overflow-y-auto scrollbar-thin space-y-1">
        {activeTasks.length === 0 && (
          <li className="px-2 py-2 text-[10px] text-muted-foreground italic">Idle.</li>
        )}
        {activeTasks.map((t) => {
          const analyst = mockAnalysts.find((a) => a.slug === t.analystSlug);
          return (
            <li
              key={t.id}
              className="px-2 py-2 rounded-md hover:bg-accent/30 cursor-pointer"
              onClick={() => analyst && onNavigate({ kind: 'analyst-detail', slug: analyst.slug })}
            >
              <div className="flex items-center gap-2">
                <span className="spinner shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{t.description}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {analyst?.name}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-2 py-2 rounded-md flex items-center gap-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : accent
            ? 'text-primary hover:bg-primary/10'
            : 'text-foreground hover:bg-accent/50'
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
