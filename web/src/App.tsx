import { useState } from 'react';
import { Sidebar, type View } from '@/components/Sidebar';
import { DashboardView } from '@/components/views/DashboardView';
import { AnalystDetailView } from '@/components/views/AnalystDetailView';
import { TickersView } from '@/components/views/TickersView';
import { KnowledgeView } from '@/components/views/KnowledgeView';
import { MasterAgentView } from '@/components/views/MasterAgentView';
import { SkillsView } from '@/components/views/SkillsView';
import { DataView } from '@/components/views/DataView';
import { TickerCoverageView } from '@/components/views/TickerCoverageView';
import { HireAnalystModal } from '@/components/HireAnalystModal';

export function App() {
  const [view, setView] = useState<View>({ kind: 'dashboard' });
  const [hireOpen, setHireOpen] = useState(false);

  return (
    <div className="h-full flex bg-background text-foreground">
      <Sidebar view={view} onNavigate={setView} onOpenHire={() => setHireOpen(true)} />
      <main className="flex-1 min-w-0 flex flex-col">
        {view.kind === 'dashboard' && (
          <DashboardView
            onOpenAnalyst={(slug) => setView({ kind: 'analyst-detail', slug })}
            onOpenMasterAgent={() => setView({ kind: 'master-agent' })}
            onOpenHire={() => setHireOpen(true)}
            onOpenUniverse={() => setView({ kind: 'tickers', tab: 'all' })}
            onOpenKnowledge={() => setView({ kind: 'knowledge' })}
          />
        )}
        {view.kind === 'master-agent' && <MasterAgentView />}
        {view.kind === 'analyst-detail' && (
          <AnalystDetailView
            slug={view.slug}
            onOpenCoverage={(ticker) => setView({ kind: 'ticker-coverage', ticker })}
          />
        )}
        {view.kind === 'tickers' && <TickersView initialTab={view.tab} />}
        {/* legacy aliases from older callsites — render the same view */}
        {view.kind === 'universe' && <TickersView initialTab="all" />}
        {view.kind === 'my-universe' && <TickersView initialTab="my" />}
        {view.kind === 'knowledge' && <KnowledgeView />}
        {view.kind === 'skills' && <SkillsView />}
        {view.kind === 'data' && <DataView />}
        {view.kind === 'ticker-coverage' && <TickerCoverageView ticker={view.ticker} />}
      </main>
      <HireAnalystModal open={hireOpen} onClose={() => setHireOpen(false)} />
    </div>
  );
}
