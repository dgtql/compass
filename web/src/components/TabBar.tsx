import { LayoutDashboard, FileText, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabId = 'dashboard' | 'memo' | 'audit';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'memo', label: 'Memos', icon: FileText },
  { id: 'audit', label: 'Audit', icon: Database },
];

type Props = {
  active: TabId;
  onChange: (t: TabId) => void;
};

export function TabBar({ active, onChange }: Props) {
  return (
    <div className="px-6 pt-3 border-b border-border bg-background/60">
      <div className="flex gap-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={cn(
                'px-3 py-2 rounded-t-md text-sm font-medium transition-colors flex items-center gap-1.5 -mb-px border-b-2',
                isActive
                  ? 'text-foreground border-primary bg-background'
                  : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-accent/50'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
