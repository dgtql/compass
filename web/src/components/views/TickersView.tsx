/**
 * TickersView — single page with two tabs:
 *
 *   [ My universe ]  [ Universe ]
 *
 * "My universe" is the PM's curated watchlist (small, mutable).
 * "Universe" is the full SEC catalog (~7.6k US filers, read-only).
 *
 * Both views are still rendered by `MyUniverseView` and `UniverseView`
 * respectively — this wrapper just handles the tab strip and the in-page
 * navigation between them, so the sidebar has one entry instead of two.
 */

import { useState } from 'react';
import { Bookmark, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UniverseView } from './UniverseView';
import { MyUniverseView } from './MyUniverseView';

export type TickerTab = 'my' | 'all';

type Props = {
  initialTab?: TickerTab;
};

export function TickersView({ initialTab = 'my' }: Props) {
  const [tab, setTab] = useState<TickerTab>(initialTab);

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 pt-5 pb-0 border-b border-border bg-background/60">
        <div className="flex gap-1">
          <TabButton
            label="My universe"
            icon={<Bookmark className="w-3.5 h-3.5" />}
            active={tab === 'my'}
            onClick={() => setTab('my')}
          />
          <TabButton
            label="Universe"
            icon={<Globe className="w-3.5 h-3.5" />}
            active={tab === 'all'}
            onClick={() => setTab('all')}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {tab === 'my' && (
          <MyUniverseView onOpenUniverse={() => setTab('all')} />
        )}
        {tab === 'all' && <UniverseView />}
      </div>
    </div>
  );
}

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-2 rounded-t-md text-sm font-medium transition-colors -mb-px border-b-2 flex items-center gap-1.5',
        active
          ? 'text-foreground border-primary bg-background'
          : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-accent/50',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
