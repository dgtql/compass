import { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { TabBar, type TabId } from '@/components/TabBar';
import { DashboardTab } from '@/components/DashboardTab';
import { MemoTab } from '@/components/MemoTab';
import { AuditTab } from '@/components/AuditTab';
import { api } from '@/lib/api';
import type { Task, TickerSummary } from '@/types/api';

const POLL_INTERVAL_MS = 1500;

export function App() {
  const [tickers, setTickers] = useState<TickerSummary[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [openedMemoKey, setOpenedMemoKey] = useState<{ type: string; date: string } | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshTickers = useCallback(async () => {
    const next = await api.listTickers();
    setTickers((prev) => {
      // detect newly-arrived memo on selected ticker
      const prevForSelected = prev.find((t) => t.ticker === selectedTicker);
      const nextForSelected = next.find((t) => t.ticker === selectedTicker);
      if (
        selectedTicker &&
        prevForSelected &&
        nextForSelected &&
        nextForSelected.memo_count > prevForSelected.memo_count
      ) {
        setRefreshNonce((n) => n + 1);
      }
      return next;
    });
    if (next.length && !selectedTicker) {
      setSelectedTicker(next[0].ticker);
    }
  }, [selectedTicker]);

  const refreshTasks = useCallback(async () => {
    const next = await api.listTasks(20);
    setTasks(next);
    return next;
  }, []);

  const handleAddTicker = useCallback(
    async (t: string) => {
      await api.addTicker(t);
      await refreshTickers();
      setSelectedTicker(t);
      setActiveTab('dashboard');
    },
    [refreshTickers]
  );

  const handleStartTask = useCallback(
    async (type: string, params: Record<string, unknown> = {}) => {
      if (!selectedTicker) return;
      const t = await api.startTask(selectedTicker, type, params);
      setExpandedTaskId(t.id);
      await refreshTasks();
      schedulePoll();
    },
    [selectedTicker, refreshTasks]
  );

  const handleOpenMemo = useCallback((type: string, date: string) => {
    setOpenedMemoKey({ type, date });
    setActiveTab('memo');
  }, []);

  const schedulePoll = useCallback(() => {
    if (pollTimer.current) return;
    pollTimer.current = setTimeout(async function poll() {
      pollTimer.current = null;
      try {
        const next = await refreshTasks();
        await refreshTickers();
        const stillActive = next.some(
          (t) => t.status === 'queued' || t.status === 'running'
        );
        if (stillActive) {
          pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        // ignore transient errors
      }
    }, POLL_INTERVAL_MS);
  }, [refreshTasks, refreshTickers]);

  // Initial load + start polling if anything is already active
  useEffect(() => {
    (async () => {
      await refreshTickers();
      const initialTasks = await refreshTasks();
      if (initialTasks.some((t) => t.status === 'queued' || t.status === 'running')) {
        schedulePoll();
      }
    })();
  }, []);

  return (
    <div className="h-full flex bg-background text-foreground">
      <Sidebar
        tickers={tickers}
        selectedTicker={selectedTicker}
        onSelectTicker={(t) => {
          setSelectedTicker(t);
          setActiveTab('dashboard');
        }}
        onAddTicker={handleAddTicker}
        tasks={tasks}
        expandedTaskId={expandedTaskId}
        onToggleTask={(id) =>
          setExpandedTaskId((prev) => (prev === id ? null : id))
        }
      />
      <main className="flex-1 flex flex-col min-w-0">
        <TabBar active={activeTab} onChange={setActiveTab} />
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === 'dashboard' && (
            <DashboardTab
              ticker={selectedTicker}
              onStartTask={handleStartTask}
              refreshNonce={refreshNonce}
              onOpenMemo={handleOpenMemo}
            />
          )}
          {activeTab === 'memo' && (
            <MemoTab
              ticker={selectedTicker}
              openedMemoKey={openedMemoKey}
              refreshNonce={refreshNonce}
            />
          )}
          {activeTab === 'audit' && <AuditTab />}
        </div>
      </main>
    </div>
  );
}
