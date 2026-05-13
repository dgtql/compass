import { useState } from 'react';
import { Sidebar, type View } from '@/components/Sidebar';
import { DashboardView } from '@/components/views/DashboardView';
import { AnalystDetailView } from '@/components/views/AnalystDetailView';
import { UniverseView } from '@/components/views/UniverseView';
import { KnowledgeView } from '@/components/views/KnowledgeView';
import { MasterAgentView } from '@/components/views/MasterAgentView';
import { SkillsView } from '@/components/views/SkillsView';
import { DataView } from '@/components/views/DataView';
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
            onOpenUniverse={() => setView({ kind: 'universe' })}
            onOpenKnowledge={() => setView({ kind: 'knowledge' })}
          />
        )}
        {view.kind === 'master-agent' && <MasterAgentView />}
        {view.kind === 'analyst-detail' && <AnalystDetailView slug={view.slug} />}
        {view.kind === 'universe' && <UniverseView />}
        {view.kind === 'knowledge' && <KnowledgeView />}
        {view.kind === 'skills' && <SkillsView />}
        {view.kind === 'data' && <DataView />}
      </main>
      <HireAnalystModal open={hireOpen} onClose={() => setHireOpen(false)} />
    </div>
  );
}
