import { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar, type View } from '@/components/Sidebar';
import { DashboardView } from '@/components/views/DashboardView';
import { AnalystDetailView } from '@/components/views/AnalystDetailView';
import { TickersView } from '@/components/views/TickersView';
import { KnowledgeView } from '@/components/views/KnowledgeView';
import { MasterAgentView } from '@/components/views/MasterAgentView';
import { SkillsView } from '@/components/views/SkillsView';
import { DataView } from '@/components/views/DataView';
import { PeopleView } from '@/components/views/PeopleView';
import { WorkflowsView } from '@/components/views/WorkflowsView';
import { TickerCoverageView } from '@/components/views/TickerCoverageView';
import { HireAnalystModal } from '@/components/HireAnalystModal';
import { EngagementProvider } from '@/contexts/EngagementContext';
import { getAnalysts, type ApiAnalyst } from '@/lib/api';

/** URL hash ⇄ View. Persistent across refreshes; supports back/forward.
 *  Format: ``#/<kind>[/<arg>]``. Unknown hashes resolve to the dashboard. */
function viewToHash(v: View): string {
  switch (v.kind) {
    case 'dashboard':       return '#/';
    case 'master-agent':    return '#/master-agent';
    case 'tickers':         return v.tab ? `#/tickers/${v.tab}` : '#/tickers';
    case 'universe':        return '#/tickers/all';
    case 'my-universe':     return '#/tickers/my';
    case 'knowledge':       return '#/knowledge';
    case 'skills':          return '#/skills';
    case 'data':            return '#/data';
    case 'people':          return '#/people';
    case 'workflows':       return '#/workflows';
    case 'analyst-detail':  return `#/analyst/${encodeURIComponent(v.slug)}`;
    case 'ticker-coverage': return `#/ticker/${encodeURIComponent(v.ticker)}`;
  }
}

function hashToView(hash: string): View {
  const cleaned = hash.replace(/^#\/?/, '');
  if (!cleaned) return { kind: 'dashboard' };
  const [head, arg] = cleaned.split('/');
  switch (head) {
    case 'master-agent': return { kind: 'master-agent' };
    case 'tickers':      return { kind: 'tickers', tab: arg === 'my' || arg === 'all' ? arg : undefined };
    case 'knowledge':    return { kind: 'knowledge' };
    case 'skills':       return { kind: 'skills' };
    case 'data':         return { kind: 'data' };
    case 'people':       return { kind: 'people' };
    case 'workflows':    return { kind: 'workflows' };
    case 'analyst':      return arg ? { kind: 'analyst-detail', slug: decodeURIComponent(arg) } : { kind: 'dashboard' };
    case 'ticker':       return arg ? { kind: 'ticker-coverage', ticker: decodeURIComponent(arg) } : { kind: 'dashboard' };
    default:             return { kind: 'dashboard' };
  }
}

export function App() {
  const [view, setView] = useState<View>(() => hashToView(window.location.hash));
  const [hireOpen, setHireOpen] = useState(false);
  /** Optional pack to pre-select when the Hire modal opens. Set by the
   *  People tab's Hire button so the modal lands on the right persona. */
  const [hirePackId, setHirePackId] = useState<string | null>(null);
  /** Role pre-selected when the Hire modal opens — lets the People tab
   *  surface a dedicated "Hire data engineer" button that lands directly
   *  on the DE branch of the modal. */
  const [hireRole, setHireRole] = useState<'analyst' | 'data-engineer'>('analyst');
  // Suppress the hashchange→setView round trip caused by our own push.
  const lastWrittenHash = useRef<string>('');

  // View → hash. Use replaceState so we don't bloat back/forward history
  // for navigations that aren't really new pages (e.g. tab changes inside
  // TickersView land later if/when those become first-class).
  useEffect(() => {
    const next = viewToHash(view);
    if (next === window.location.hash || next === lastWrittenHash.current) return;
    lastWrittenHash.current = next;
    window.history.replaceState(null, '', next);
  }, [view]);

  // Hash → view (back/forward, manual URL edit).
  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash;
      if (h === lastWrittenHash.current) return;
      setView(hashToView(h));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Hired-analyst roster: single source of truth in App, passed down to
  // Sidebar / Dashboard / AnalystDetail. Refreshed after a successful
  // `Hire` action so the new analyst appears immediately.
  const [analysts, setAnalysts] = useState<ApiAnalyst[]>([]);

  const reloadAnalysts = useCallback(() => {
    getAnalysts()
      .then((r) => setAnalysts(r.analysts))
      .catch(() => { /* leave previous list in place if API is down */ });
  }, []);

  useEffect(() => { reloadAnalysts(); }, [reloadAnalysts]);

  return (
    <EngagementProvider>
    <div className="h-full flex bg-background text-foreground">
      <Sidebar
        view={view}
        onNavigate={setView}
        onOpenHire={() => { setHireRole('analyst'); setHireOpen(true); }}
        analysts={analysts}
      />
      <main className="flex-1 min-w-0 flex flex-col">
        {view.kind === 'dashboard' && (
          <DashboardView
            analysts={analysts}
            onOpenAnalyst={(slug) => setView({ kind: 'analyst-detail', slug })}
            onOpenMasterAgent={() => setView({ kind: 'master-agent' })}
            onOpenHire={() => { setHireRole('analyst'); setHireOpen(true); }}
            onOpenUniverse={() => setView({ kind: 'tickers', tab: 'all' })}
            onOpenKnowledge={() => setView({ kind: 'knowledge' })}
          />
        )}
        {view.kind === 'master-agent' && <MasterAgentView />}
        {view.kind === 'analyst-detail' && (
          <AnalystDetailView
            slug={view.slug}
            analysts={analysts}
            onOpenCoverage={(ticker) => setView({ kind: 'ticker-coverage', ticker })}
            onAnalystUpdated={reloadAnalysts}
            onAnalystDeleted={() => {
              reloadAnalysts();
              setView({ kind: 'dashboard' });
            }}
          />
        )}
        {view.kind === 'tickers' && <TickersView initialTab={view.tab} />}
        {view.kind === 'universe' && <TickersView initialTab="all" />}
        {view.kind === 'my-universe' && <TickersView initialTab="my" />}
        {view.kind === 'knowledge' && <KnowledgeView />}
        {view.kind === 'skills' && <SkillsView />}
        {view.kind === 'data' && <DataView />}
        {view.kind === 'people' && (
          <PeopleView
            onHireFromPack={(packId) => {
              setHireRole('analyst');
              setHirePackId(packId);
              setHireOpen(true);
            }}
            onHireDataEngineer={() => {
              setHireRole('data-engineer');
              setHirePackId(null);
              setHireOpen(true);
            }}
          />
        )}
        {view.kind === 'workflows' && <WorkflowsView />}
        {view.kind === 'ticker-coverage' && <TickerCoverageView ticker={view.ticker} />}
      </main>
      <HireAnalystModal
        open={hireOpen}
        onClose={() => { setHireOpen(false); setHirePackId(null); }}
        initialPackId={hirePackId}
        initialRole={hireRole}
        analysts={analysts}
        onCreated={(a) => {
          reloadAnalysts();
          setHirePackId(null);
          setView({ kind: 'analyst-detail', slug: a.slug });
        }}
      />
    </div>
    </EngagementProvider>
  );
}
