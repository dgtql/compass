/**
 * EngagementContext — single source of truth for one engagement's tasks
 * across the React tree.
 *
 * Mirrors the pattern from
 * `background/code_analysis_want_to_use/16-task-tracker-ui-design.md` §4:
 *
 *   disk → REST (`/api/engagements/{a}/{t}/tasks`)
 *       ↘ SSE (`/api/engagements/{a}/{t}/events/stream`)
 *           ↘ context refresh → all subscribers re-render
 *
 * Components that need tasks for "the current engagement" call
 * `useEngagement()` and don't worry about fetching, polling, or staying
 * in sync with the dispatcher — the context handles it.
 *
 * One engagement at a time (v1). Switching engagements closes the SSE
 * subscription and opens a new one.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import {
  getEngagementTasks,
  setEngagementTaskStatus,
  subscribeEngagementEvents,
  type ApiEngagementTask,
} from '@/lib/api';

export type EngagementKey = { analyst: string; ticker: string } | null;

/** Bounded firehose of dispatcher events for the current engagement.
 *  Used by debug consoles; capped so a long-running pipeline doesn't
 *  blow up React state. */
const EVENT_BUFFER_CAP = 500;

export type EngagementEvent = Record<string, unknown> & {
  ts?: string;
  type?: string;
};

type EngagementContextValue = {
  engagement: EngagementKey;
  setEngagement: (next: EngagementKey) => void;

  tasks: ApiEngagementTask[];
  events: EngagementEvent[];
  isLoading: boolean;
  error: string | null;
  connected: boolean;

  refreshTasks: () => Promise<void>;
  markStatus: (taskId: string, status: ApiEngagementTask['status']) => Promise<void>;
};

const EngagementContext = createContext<EngagementContextValue | null>(null);

export function EngagementProvider({ children }: { children: ReactNode }) {
  const [engagement, setEngagementState] = useState<EngagementKey>(null);
  const [tasks, setTasks] = useState<ApiEngagementTask[]>([]);
  const [events, setEvents] = useState<EngagementEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  // Guard against late-arriving refreshes for an engagement we already
  // navigated away from.
  const activeKey = useRef<string>('');

  const refreshTasks = useCallback(async () => {
    const eng = engagement;
    if (!eng) {
      setTasks([]);
      return;
    }
    const key = `${eng.analyst}|${eng.ticker}`;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getEngagementTasks(eng.analyst, eng.ticker);
      if (activeKey.current !== key) return;
      setTasks(data.tasks);
    } catch (err) {
      if (activeKey.current !== key) return;
      setError((err as Error).message);
    } finally {
      if (activeKey.current === key) setIsLoading(false);
    }
  }, [engagement]);

  const setEngagement = useCallback((next: EngagementKey) => {
    setEngagementState((prev) => {
      if (
        (prev?.analyst === next?.analyst) &&
        (prev?.ticker === next?.ticker)
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  // Fetch + subscribe whenever the engagement key changes.
  useEffect(() => {
    if (!engagement) {
      activeKey.current = '';
      setTasks([]);
      setEvents([]);
      setConnected(false);
      return;
    }
    const key = `${engagement.analyst}|${engagement.ticker}`;
    activeKey.current = key;
    setEvents([]);
    setConnected(false);

    // Initial fetch.
    refreshTasks();

    // Subscribe to live events.
    const close = subscribeEngagementEvents(engagement.analyst, engagement.ticker, {
      onHello: () => {
        if (activeKey.current === key) setConnected(true);
      },
      onTasksUpdated: () => {
        if (activeKey.current !== key) return;
        // Doc 16 §6 pattern: WS push only signals "refresh", the actual
        // data flows over REST. Same here with SSE.
        refreshTasks();
      },
      onTaskEvent: (event) => {
        if (activeKey.current !== key) return;
        setEvents((prev) => {
          const next = [...prev, event];
          return next.length > EVENT_BUFFER_CAP ? next.slice(-EVENT_BUFFER_CAP) : next;
        });
      },
      onError: (err) => {
        if (activeKey.current !== key) return;
        setConnected(false);
        setError(err.message);
      },
    });

    return () => {
      close();
      setConnected(false);
    };
  }, [engagement, refreshTasks]);

  const markStatus = useCallback(
    async (taskId: string, status: ApiEngagementTask['status']) => {
      if (!engagement) return;
      // No optimistic update — doc 16 §6 picks the "trustworthy UI"
      // tradeoff. The PATCH writes to disk → publishes tasks-updated →
      // we refetch.
      await setEngagementTaskStatus(engagement.analyst, engagement.ticker, taskId, status);
      // tasks-updated will trigger refreshTasks via the SSE handler; but
      // also fire one explicit refresh for the case where SSE is down.
      await refreshTasks();
    },
    [engagement, refreshTasks],
  );

  const value = useMemo<EngagementContextValue>(() => ({
    engagement,
    setEngagement,
    tasks,
    events,
    isLoading,
    error,
    connected,
    refreshTasks,
    markStatus,
  }), [engagement, setEngagement, tasks, events, isLoading, error, connected, refreshTasks, markStatus]);

  return <EngagementContext.Provider value={value}>{children}</EngagementContext.Provider>;
}

export function useEngagement(): EngagementContextValue {
  const ctx = useContext(EngagementContext);
  if (!ctx) {
    throw new Error('useEngagement must be used within an <EngagementProvider>');
  }
  return ctx;
}

/** Optional variant: returns null instead of throwing, for components
 *  that may render outside the provider during transitions. */
export function useEngagementOptional(): EngagementContextValue | null {
  return useContext(EngagementContext);
}
