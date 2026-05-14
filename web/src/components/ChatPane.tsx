/**
 * ChatPane — analyst (or master agent) chat surface.
 *
 * Tasks + sessions + messages are persisted via `/api/chats/{ownerKey}`
 * (see `compass/chats.py`). Navigating away and coming back resumes
 * exactly where the PM left off.
 *
 *   ┌───────┬──────────────────────────┬───────┐
 *   │ Tasks │  Conversation + composer │ Right │  ← optional right rail
 *   │  /    │                          │ rail  │     (per-task progress,
 *   │ Sess. │                          │       │      analyst sidebar)
 *   └───────┴──────────────────────────┴───────┘
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Send, Brain, Plus, MessageCircle, ChevronDown, ChevronRight,
  FolderOpen, Trash2, FileText, Sunrise, Search, BarChart3, CalendarClock,
  X, AlertTriangle, Check, Loader2, Sparkles, AlertCircle,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useEngagement } from '@/contexts/EngagementContext';
import type { ApiEngagementTask } from '@/lib/api';
import {
  createChatSession,
  createChatTask,
  deleteChatTask,
  getChats,
  getMemoCandidates,
  streamChatMessage,
  streamMemoRun,
  suggestChatTaskTitle,
  suggestMemoTicker,
  type ApiChatMessage,
  type ApiChatSession,
  type ApiChatTask,
  type ApiMemoCandidate,
  type ApiMemoPlanTask,
} from '@/lib/api';

export type RightRailTab = {
  id: string;
  label: string;
  badge?: string | number;
  content: ReactNode;
};

export type ChatPaneCtx = {
  activeTask: ApiChatTask | null;
  activeSession: ApiChatSession | null;
  tasks: ApiChatTask[];
};

export type RightRailTabsProp =
  | RightRailTab[]
  | ((ctx: ChatPaneCtx) => RightRailTab[]);

export type ChatModel = 'claude-sonnet-4-6' | 'claude-haiku-4-5' | 'claude-opus-4-7';
export type ThinkingMode = 'standard' | 'extended';

const MODEL_LABEL: Record<ChatModel, string> = {
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-haiku-4-5': 'Haiku 4.5',
  'claude-opus-4-7': 'Opus 4.7',
};

type CounterpartyAvatar = {
  initials: string;
  color: string;
};

/** Live state of a chat-driven memo run — plan tasks, statuses, and
 *  the final assembled memo if compose-assemble produced one. */
type MemoRunStatus = 'pending' | 'in-progress' | 'done' | 'error' | 'blocked';

type MemoRunTask = {
  id: string;
  stage: string;
  title: string;
  skill: string;
  status: MemoRunStatus;
  error?: string;
  elapsed?: number;
};

type MemoRunState = {
  ticker: string;
  template: string;
  analyst?: string;
  tasks: MemoRunTask[];
  memoText: string | null;
  memoPath: string | null;
  finished: boolean;
  error?: string;
};

/** Task-type chips on the welcome screen. Click → creates a task with
 *  that label as the title, opens a session in it, focuses the composer. */
const TASK_TYPE_CHIPS: { id: string; label: string; icon: ReactNode }[] = [
  { id: 'memo',          label: 'Memo',          icon: <FileText className="w-3 h-3" /> },
  { id: 'morning-brief', label: 'Morning brief', icon: <Sunrise className="w-3 h-3" /> },
  { id: 'find-data',     label: 'Find data',     icon: <Search className="w-3 h-3" /> },
  { id: 'data-analysis', label: 'Data analysis', icon: <BarChart3 className="w-3 h-3" /> },
  { id: 'catalysts',     label: 'Catalysts',     icon: <CalendarClock className="w-3 h-3" /> },
];

type Props = {
  /** 'maria-chen' | 'master' — selects which chats belong here. */
  ownerKey: string;
  counterparty: CounterpartyAvatar;
  /** Friendly name to greet with on the welcome screen ('Hey boss, …'). */
  counterpartyName?: string;
  placeholder?: string;
  rightRail?: ReactNode;
  rightRailTabs?: RightRailTabsProp;
  initialRailTab?: string;
};

export function ChatPane({
  ownerKey,
  counterparty,
  counterpartyName,
  placeholder,
  rightRail,
  rightRailTabs,
  initialRailTab,
}: Props) {
  const { setEngagement, tasks: liveEngagementTasks, connected: engagementConnected } = useEngagement();
  const [tasks, setTasks] = useState<ApiChatTask[]>([]);
  const [sessions, setSessions] = useState<ApiChatSession[]>([]);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<ChatModel>('claude-sonnet-4-6');
  const [thinking, setThinking] = useState<ThinkingMode>('standard');
  const [sending, setSending] = useState(false);
  /** Optimistic in-flight assistant text being streamed back. While
   *  non-null, renders as the bottom bubble; cleared on stream-done. */
  const [streamingText, setStreamingText] = useState<string | null>(null);
  /** Pending task-type selection from the welcome chips. Becomes the task
   *  title when the PM hits Send (and is cleared once the task is created). */
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  /** Delete-task confirmation dialog target (null = closed). */
  const [pendingDeleteTask, setPendingDeleteTask] = useState<ApiChatTask | null>(null);
  /** Memo-flow state — populated when the welcome panel's Memo chip is active. */
  const [memoCandidates, setMemoCandidates] = useState<ApiMemoCandidate[]>([]);
  const [memoTicker, setMemoTicker] = useState<string | null>(null);
  const [memoSuggesting, setMemoSuggesting] = useState(false);
  /** Live memo-run state. While non-null the chat scroll area renders task
   *  progress in place of the normal message bubbles. */
  const [memoRun, setMemoRun] = useState<MemoRunState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch chats for this owner whenever the owner key changes. Owner key
  // is stable per analyst view, so this happens on mount + on each switch
  // (Dashboard → Analyst → back) — which is exactly what fixes the "tasks
  // disappear when I navigate away" bug.
  const refresh = useCallback(async (preserveActive = true) => {
    setLoading(true);
    try {
      const data = await getChats(ownerKey);
      // Newest-first ordering matches the backend (insert at index 0).
      const sortedTasks = [...data.tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const sortedSessions = [...data.sessions].sort((a, b) =>
        b.lastMessageAt.localeCompare(a.lastMessageAt),
      );
      setTasks(sortedTasks);
      setSessions(sortedSessions);
      setExpandedTaskIds(
        new Set(sortedTasks.filter((t) => t.status === 'active').map((t) => t.id)),
      );
      if (!preserveActive) {
        setActiveId(null);
      } else {
        // If the active session still exists, keep it; otherwise clear.
        setActiveId((prev) =>
          prev && sortedSessions.some((s) => s.id === prev) ? prev : null,
        );
      }
    } catch {
      setTasks([]);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    setActiveId(null);  // reset on owner change
    refresh(false);
  }, [ownerKey, refresh]);

  const active = sessions.find((s) => s.id === activeId);
  const activeTask = active ? tasks.find((t) => t.id === active.taskId) ?? null : null;

  const resolvedRailTabs: RightRailTab[] = useMemo(() => {
    if (!rightRailTabs) return [];
    if (typeof rightRailTabs === 'function') {
      return rightRailTabs({ activeTask, activeSession: active ?? null, tasks });
    }
    return rightRailTabs;
  }, [rightRailTabs, activeTask, active, tasks]);

  const [railTab, setRailTab] = useState<string | null>(
    initialRailTab ?? resolvedRailTabs[0]?.id ?? null,
  );
  useEffect(() => {
    if (resolvedRailTabs.length > 0 && !resolvedRailTabs.find((t) => t.id === railTab)) {
      setRailTab(resolvedRailTabs[0]?.id ?? null);
    }
  }, [resolvedRailTabs, railTab]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [active?.messages.length, activeId, memoRun?.tasks.length, memoRun?.memoText]);

  // Load candidate tickers for the Memo chip the first time it's selected.
  useEffect(() => {
    if (selectedChip !== 'Memo') return;
    if (memoCandidates.length > 0) return;
    let cancelled = false;
    getMemoCandidates(ownerKey)
      .then((data) => { if (!cancelled) setMemoCandidates(data.candidates); })
      .catch(() => { if (!cancelled) setMemoCandidates([]); });
    return () => { cancelled = true; };
  }, [selectedChip, ownerKey, memoCandidates.length]);

  // Reset memo-flow state when the chip is deselected or the owner changes.
  useEffect(() => {
    if (selectedChip !== 'Memo') {
      setMemoTicker(null);
    }
  }, [selectedChip]);
  useEffect(() => {
    setMemoCandidates([]);
    setMemoTicker(null);
  }, [ownerKey]);

  // When the active session belongs to a memo task with a coverage ticker,
  // wire the EngagementContext to (ownerKey, ticker). This is what makes a
  // mid-run page refresh resilient: the streamMemoRun SSE is gone, but the
  // EngagementContext's SSE re-subscribes and re-fetches tasks from disk.
  //
  // Master-agent memos don't carry the resolved analyst slug in chat state
  // (only the dispatcher knows which analyst the engagement filed under),
  // so we skip those for v1 — the master-agent right rail can adopt this
  // later when we persist the analyst on ApiChatTask.
  useEffect(() => {
    if (!activeTask || !activeTask.coverageTicker || ownerKey === 'master') {
      setEngagement(null);
      return;
    }
    setEngagement({ analyst: ownerKey, ticker: activeTask.coverageTicker });
  }, [activeTask, ownerKey, setEngagement]);

  // Debounced LLM pre-fill of the ticker as the PM types. Only runs while
  // the Memo chip is selected and no ticker has been picked manually yet.
  useEffect(() => {
    if (selectedChip !== 'Memo') return;
    if (memoTicker) return;
    const trimmed = input.trim();
    if (trimmed.length < 4) return;
    if (memoCandidates.length === 0) return;
    setMemoSuggesting(true);
    const handle = window.setTimeout(() => {
      suggestMemoTicker(ownerKey, { message: trimmed })
        .then((res) => {
          if (res.ticker && memoTicker === null && selectedChip === 'Memo') {
            setMemoTicker(res.ticker);
          }
        })
        .catch(() => { /* non-fatal */ })
        .finally(() => setMemoSuggesting(false));
    }, 600);
    return () => {
      window.clearTimeout(handle);
      setMemoSuggesting(false);
    };
  }, [input, selectedChip, memoTicker, memoCandidates.length, ownerKey]);

  const hasRail = Boolean(rightRail) || resolvedRailTabs.length > 0;

  // --- mutations ----------------------------------------------------------

  async function newSession(taskId: string, title?: string) {
    try {
      const s = await createChatSession(ownerKey, { task_id: taskId, title });
      setSessions((prev) => [s, ...prev]);
      setActiveId(s.id);
      setExpandedTaskIds((prev) => new Set([...prev, taskId]));
      setInput('');
    } catch {
      refresh();
    }
  }

  async function newTask(title = 'New task') {
    try {
      const t = await createChatTask(ownerKey, { title });
      setTasks((prev) => [t, ...prev]);
      setExpandedTaskIds((prev) => new Set([...prev, t.id]));
      // Auto-open a session under the new task.
      await newSession(t.id);
    } catch {
      refresh();
    }
  }

  async function confirmDeleteTask() {
    const t = pendingDeleteTask;
    if (!t) return;
    setPendingDeleteTask(null);
    // Optimistic
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    setSessions((prev) => prev.filter((s) => s.taskId !== t.id));
    if (active?.taskId === t.id) setActiveId(null);
    try {
      await deleteChatTask(ownerKey, t.id);
    } catch {
      refresh();
    }
  }

  function toggleTask(taskId: string) {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  }

  async function sendMemo(message: string, ticker: string) {
    // Create the task + session up front so the memo run has a session
    // to persist its summary into, and so the task shows up in the rail
    // immediately. The title is deterministic — no LLM title-suggest call.
    let sessionId: string;
    let newTaskId: string;
    try {
      const newT = await createChatTask(ownerKey, {
        title: `Memo on ${ticker}`,
        coverage_ticker: ticker,
      });
      const newS = await createChatSession(ownerKey, { task_id: newT.id });
      setTasks((prev) => [newT, ...prev]);
      setSessions((prev) => [newS, ...prev]);
      setExpandedTaskIds((prev) => new Set([...prev, newT.id]));
      setActiveId(newS.id);
      setSelectedChip(null);
      setMemoTicker(null);
      sessionId = newS.id;
      newTaskId = newT.id;
    } catch {
      refresh();
      return;
    }
    setInput('');
    setSending(true);

    // Optimistic PM bubble so the framing message is visible immediately.
    const optimisticPmMsg: ApiChatMessage = {
      id: `pending-${Date.now()}`,
      role: 'pm',
      text: message,
      ts: new Date().toISOString(),
    };
    setSessions((prev) =>
      prev.map((s) => (s.id !== sessionId ? s : { ...s, messages: [...s.messages, optimisticPmMsg] })),
    );

    setMemoRun({
      ticker,
      template: 'pitch-memo',
      tasks: [],
      memoText: null,
      memoPath: null,
      finished: false,
    });

    streamMemoRun(
      ownerKey, sessionId,
      { ticker, template: 'pitch-memo', message },
      {
        onEngagementOpened: ({ analyst }) => {
          setMemoRun((prev) => (prev ? { ...prev, analyst } : prev));
          // Tell the EngagementContext which engagement is active — it
          // opens the SSE subscription so the task list stays live even
          // if the user refreshes mid-run (refresh closes streamMemoRun's
          // SSE but the context's SSE picks up immediately on remount).
          setEngagement({ analyst, ticker });
        },
        onPlanDone: ({ tasks: plan }) =>
          setMemoRun((prev) => (prev ? {
            ...prev,
            tasks: plan.map((t: ApiMemoPlanTask) => ({
              id: t.id,
              stage: t.stage,
              title: t.title,
              skill: t.skill,
              status: 'pending' as MemoRunStatus,
            })),
          } : prev)),
        onTaskStart: ({ task_id }) =>
          setMemoRun((prev) => (prev ? {
            ...prev,
            tasks: prev.tasks.map((t) => (t.id === task_id ? { ...t, status: 'in-progress' } : t)),
          } : prev)),
        onTaskDone: ({ task_id, elapsed }) =>
          setMemoRun((prev) => (prev ? {
            ...prev,
            tasks: prev.tasks.map((t) => (t.id === task_id ? { ...t, status: 'done', elapsed } : t)),
          } : prev)),
        onTaskError: ({ task_id, error }) =>
          setMemoRun((prev) => (prev ? {
            ...prev,
            tasks: prev.tasks.map((t) => (t.id === task_id ? { ...t, status: 'error', error } : t)),
          } : prev)),
        onTaskBlocked: ({ task_id }) =>
          setMemoRun((prev) => (prev ? {
            ...prev,
            tasks: prev.tasks.map((t) => (t.id === task_id ? { ...t, status: 'blocked' } : t)),
          } : prev)),
        onMemoReady: ({ memo_path, memo_text }) =>
          setMemoRun((prev) => (prev ? {
            ...prev,
            memoPath: memo_path,
            memoText: memo_text,
          } : prev)),
        onDone: ({ session }) => {
          if (session) {
            setSessions((prev) => prev.map((s) => (s.id === session.id ? session : s)));
          }
          setMemoRun((prev) => (prev ? { ...prev, finished: true } : prev));
          setSending(false);
        },
        onError: (err) => {
          setMemoRun((prev) => (prev ? { ...prev, finished: true, error: err.message } : prev));
          setSending(false);
        },
      },
    );

    // Discard the unused id (kept for future per-task right-rail wiring).
    void newTaskId;
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Memo-flow branch: chip is Memo and a ticker is picked → route to the
    // skill-based engagement runner instead of the chat LLM.
    if (!active && selectedChip === 'Memo' && memoTicker) {
      await sendMemo(trimmed, memoTicker);
      return;
    }
    let sessionId = active?.id;
    // If no session is selected yet, create a task + session. The task
    // title starts as a chip-or-snippet placeholder and is replaced once
    // the LLM-suggested title comes back from the backend.
    if (!sessionId) {
      const taskTitle = selectedChip ?? trimmed.slice(0, 40);
      const chipForTitle = selectedChip;
      try {
        const newT = await createChatTask(ownerKey, { title: taskTitle });
        const newS = await createChatSession(ownerKey, { task_id: newT.id });
        setTasks((prev) => [newT, ...prev]);
        setSessions((prev) => [newS, ...prev]);
        setExpandedTaskIds((prev) => new Set([...prev, newT.id]));
        setActiveId(newS.id);
        setSelectedChip(null);
        sessionId = newS.id;

        // Fire-and-forget: ask the backend to infer a better title from
        // (chip, first message). Replace the placeholder once it lands;
        // ignore failures — placeholder stays put.
        suggestChatTaskTitle(ownerKey, newT.id, {
          chip: chipForTitle,
          message: trimmed,
        })
          .then((updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          })
          .catch(() => {
            /* non-fatal — keep the placeholder */
          });
      } catch {
        refresh();
        return;
      }
    }
    setInput('');
    setSending(true);
    setStreamingText('');  // empty → triggers "thinking..." bubble

    // Optimistically render the PM's message in the active session so it
    // shows up the moment they hit Send (instead of after the SDK reply
    // round-trip). The server's persisted version arrives via the
    // user_message SSE event and replaces this placeholder.
    const optimisticPmMsg: ApiChatMessage = {
      id: `pending-${Date.now()}`,
      role: 'pm',
      text: trimmed,
      ts: new Date().toISOString(),
    };
    setSessions((prev) =>
      prev.map((s) =>
        s.id !== sessionId
          ? s
          : { ...s, messages: [...s.messages, optimisticPmMsg] },
      ),
    );

    const sid = sessionId!;
    streamChatMessage(
      ownerKey, sid,
      { role: 'pm', text: trimmed, model, thinking },
      {
        onUserMessage: (serverMsg) => {
          // Replace the optimistic message with the server's record.
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== sid) return s;
              const msgs = s.messages.filter((m) => m.id !== optimisticPmMsg.id);
              return { ...s, messages: [...msgs, serverMsg] };
            }),
          );
        },
        onDelta: (chunk) => {
          setStreamingText((prev) => (prev ?? '') + chunk);
        },
        onDone: (finalSession) => {
          setSessions((prev) => prev.map((s) => (s.id === finalSession.id ? finalSession : s)));
          setStreamingText(null);
          setSending(false);
        },
        onError: () => {
          // Server-side errors land as a master "(couldn't reach the LLM …)"
          // message inside `done`. Treat raw transport errors by
          // refreshing the session list.
          setStreamingText(null);
          setSending(false);
          refresh();
        },
      },
    );
  }

  function toggleChip(label: string) {
    setSelectedChip((prev) => (prev === label ? null : label));
  }

  return (
    <div
      className={cn(
        'h-full grid',
        hasRail ? 'grid-cols-[200px_minmax(0,1fr)_300px]' : 'grid-cols-[200px_minmax(0,1fr)]',
      )}
    >
      {/* Tasks → sessions list */}
      <aside className="border-r border-border bg-background/40 flex flex-col">
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Tasks
          </div>
          <button
            onClick={() => newTask()}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="New task"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <ul className="px-2 pb-3 flex-1 overflow-y-auto scrollbar-thin space-y-1">
          {loading && (
            <li className="px-2 py-2 text-[11px] text-muted-foreground italic">Loading…</li>
          )}
          {!loading && tasks.length === 0 && (
            <li className="px-2 py-2 text-[11px] text-muted-foreground italic">No tasks yet.</li>
          )}
          {tasks.map((t) => {
            const taskSessions = sessions
              .filter((s) => s.taskId === t.id)
              .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
            const isExpanded = expandedTaskIds.has(t.id);
            const hasActiveSession = taskSessions.some((s) => s.id === activeId);
            return (
              <li key={t.id}>
                <div
                  className={cn(
                    'rounded-md',
                    hasActiveSession && !isExpanded && 'bg-accent/40',
                  )}
                >
                  <div className="flex items-center gap-1 group">
                    <button
                      onClick={() => toggleTask(t.id)}
                      className="flex-1 flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-accent/40 transition-colors text-left min-w-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      )}
                      <FolderOpen className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium truncate flex-1">
                        {t.title}
                      </span>
                      {taskSessions.length > 0 && (
                        <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
                          {taskSessions.length}
                        </span>
                      )}
                      <TaskStatusDot status={t.status} />
                    </button>
                    {/* Per-task hover actions */}
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => newSession(t.id)}
                        className="text-muted-foreground hover:text-foreground px-1"
                        title="New session in this task"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setPendingDeleteTask(t)}
                        className="text-muted-foreground hover:text-rose-500 px-1"
                        title={`Delete task "${t.title}"`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <ul className="ml-3 border-l border-border space-y-0.5 my-0.5">
                      {taskSessions.length === 0 ? (
                        <li className="pl-3 py-1.5 text-[10px] italic text-muted-foreground">
                          No sessions in this task yet.
                        </li>
                      ) : (
                        taskSessions.map((s) => {
                          const isActive = s.id === activeId;
                          return (
                            <li key={s.id}>
                              <button
                                onClick={() => setActiveId(s.id)}
                                className={cn(
                                  'w-full text-left pl-3 pr-2 py-1.5 rounded-r-md transition-colors',
                                  isActive
                                    ? 'bg-accent text-accent-foreground'
                                    : 'hover:bg-accent/40 text-foreground',
                                )}
                              >
                                <div className="flex items-center gap-1.5">
                                  <MessageCircle className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                                  <span className="text-[11px] font-medium truncate">
                                    {s.title}
                                  </span>
                                </div>
                                <div className="text-[9px] text-muted-foreground mt-0.5 pl-4 uppercase tracking-wider">
                                  {fmtRelative(s.lastMessageAt)}
                                </div>
                              </button>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Conversation + composer */}
      <div className="flex flex-col min-h-0">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4 max-w-3xl w-full mx-auto"
        >
          {!active ? (
            <WelcomePanel
              counterparty={counterparty}
              counterpartyName={counterpartyName}
              selectedChip={selectedChip}
              onChip={toggleChip}
              memoCandidates={memoCandidates}
              memoTicker={memoTicker}
              memoSuggesting={memoSuggesting}
              onMemoTicker={setMemoTicker}
            />
          ) : active.messages.length === 0 && streamingText === null && memoRun === null ? (
            <div className="mt-12 text-center text-sm text-muted-foreground italic">
              Type to start. Shift+Enter for newline.
            </div>
          ) : (
            <>
              {active.messages.map((m) => (
                <Bubble key={m.id} msg={m} counterparty={counterparty} />
              ))}
              {(memoRun !== null || (activeTask?.coverageTicker && liveEngagementTasks.length > 0)) && (
                <MemoRunPanel
                  run={memoRun}
                  counterparty={counterparty}
                  liveTasks={liveEngagementTasks}
                  engagementConnected={engagementConnected}
                  fallbackTicker={activeTask?.coverageTicker ?? null}
                />
              )}
              {streamingText !== null && (
                <StreamingBubble
                  counterparty={counterparty}
                  counterpartyName={counterpartyName}
                  text={streamingText}
                />
              )}
            </>
          )}
        </div>

        <div className="border-t border-border bg-background/80 px-4 py-3">
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Selected chip tag — only when a new (no session) task is being framed */}
            {!active && selectedChip && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Task</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/30">
                  {selectedChip}
                  <button
                    onClick={() => setSelectedChip(null)}
                    className="hover:text-primary-foreground"
                    title="Clear task type"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              </div>
            )}
            <Textarea
              placeholder={placeholder ?? 'Ask anything. Shift+Enter for newline.'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              className="min-h-[56px] max-h-[160px] resize-none"
              disabled={sending}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Select
                  value={model}
                  onChange={(e) => setModel(e.target.value as ChatModel)}
                  aria-label="Model"
                >
                  {(Object.keys(MODEL_LABEL) as ChatModel[]).map((m) => (
                    <option key={m} value={m}>
                      {MODEL_LABEL[m]}
                    </option>
                  ))}
                </Select>
                <Select
                  value={thinking}
                  onChange={(e) => setThinking(e.target.value as ThinkingMode)}
                  aria-label="Thinking mode"
                >
                  <option value="standard">Standard</option>
                  <option value="extended">Extended thinking</option>
                </Select>
                {thinking === 'extended' && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Brain className="w-3 h-3 text-primary" />
                    higher latency · higher cost
                  </span>
                )}
              </div>
              <Button
                onClick={() => send(input)}
                disabled={!input.trim() || sending || (selectedChip === 'Memo' && !memoTicker && !active)}
                size="sm"
              >
                {!active && selectedChip === 'Memo' && memoTicker ? (
                  <>
                    <FileText className="w-3.5 h-3.5" />
                    Run memo · {memoTicker}
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete-task confirm — styled, not a Chrome window.confirm */}
      <Dialog
        open={pendingDeleteTask !== null}
        onClose={() => setPendingDeleteTask(null)}
        title="Delete task?"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-full bg-rose-500/15 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
            </div>
            <div className="text-sm">
              Delete <span className="font-semibold">{pendingDeleteTask?.title}</span> and all of its
              sessions? This can't be undone.
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setPendingDeleteTask(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmDeleteTask}
              className="bg-rose-600 text-white hover:bg-rose-700 border-rose-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </Dialog>

      {hasRail && (
        <aside className="border-l border-border bg-background/40 overflow-y-auto scrollbar-thin flex flex-col">
          {resolvedRailTabs.length > 0 ? (
            <>
              {resolvedRailTabs.length > 1 && (
                <div className="flex border-b border-border bg-background/60 sticky top-0 z-10">
                  {resolvedRailTabs.map((t) => {
                    const isActive = t.id === railTab;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setRailTab(t.id)}
                        className={cn(
                          'flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px flex items-center justify-center gap-1.5',
                          isActive
                            ? 'text-foreground border-primary'
                            : 'text-muted-foreground hover:text-foreground border-transparent',
                        )}
                      >
                        {t.label}
                        {t.badge != null && t.badge !== '' && (
                          <Badge
                            variant={isActive ? 'default' : 'secondary'}
                            className="text-[9px] h-4 px-1.5"
                          >
                            {t.badge}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {resolvedRailTabs.find((t) => t.id === railTab)?.content ?? null}
              </div>
            </>
          ) : (
            rightRail
          )}
        </aside>
      )}
    </div>
  );
}

function WelcomePanel({
  counterparty,
  counterpartyName,
  selectedChip,
  onChip,
  memoCandidates,
  memoTicker,
  memoSuggesting,
  onMemoTicker,
}: {
  counterparty: CounterpartyAvatar;
  counterpartyName?: string;
  selectedChip: string | null;
  onChip: (label: string) => void;
  memoCandidates: ApiMemoCandidate[];
  memoTicker: string | null;
  memoSuggesting: boolean;
  onMemoTicker: (ticker: string | null) => void;
}) {
  const greeting = counterpartyName
    ? `Hey boss — what would you like ${counterpartyName} to work on?`
    : `Hey boss — what would you like to work on?`;
  return (
    <div className="mt-8 max-w-2xl mx-auto text-center space-y-5">
      <div className="flex items-center justify-center gap-3">
        <Avatar initials={counterparty.initials} color={counterparty.color} size="md" />
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{greeting}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a task type below (optional), then describe what you need in the composer.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        {TASK_TYPE_CHIPS.map((c) => {
          const isSelected = selectedChip === c.label;
          return (
            <button
              key={c.id}
              onClick={() => onChip(c.label)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-secondary text-secondary-foreground border-border hover:bg-accent hover:border-primary/40',
              )}
            >
              {c.icon}
              {c.label}
            </button>
          );
        })}
      </div>
      {selectedChip === 'Memo' && (
        <MemoTickerPicker
          candidates={memoCandidates}
          selected={memoTicker}
          suggesting={memoSuggesting}
          onSelect={onMemoTicker}
        />
      )}
    </div>
  );
}

function MemoTickerPicker({
  candidates,
  selected,
  suggesting,
  onSelect,
}: {
  candidates: ApiMemoCandidate[];
  selected: string | null;
  suggesting: boolean;
  onSelect: (ticker: string | null) => void;
}) {
  if (candidates.length === 0) {
    return (
      <div className="mt-2 text-xs text-muted-foreground italic">
        No coverage tickers found. Add tickers to this analyst's coverage (or your watchlist for the master agent) to run a memo.
      </div>
    );
  }
  return (
    <div className="mt-3 text-left space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          Ticker
          {suggesting && (
            <span className="inline-flex items-center gap-1 text-primary normal-case tracking-normal font-normal">
              <Sparkles className="w-3 h-3" /> guessing…
            </span>
          )}
        </div>
        {selected && (
          <button
            onClick={() => onSelect(null)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {candidates.map((c) => {
          const isSel = c.ticker === selected;
          return (
            <button
              key={c.ticker}
              onClick={() => onSelect(isSel ? null : c.ticker)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors',
                isSel
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-secondary text-secondary-foreground border-border hover:border-primary/50',
              )}
              title={c.name ?? c.ticker}
            >
              <span className="font-semibold">{c.ticker}</span>
              {c.name && (
                <span className={cn('truncate max-w-[140px]', isSel ? 'opacity-90' : 'text-muted-foreground')}>
                  {c.name}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Merge the in-flight memo-run state with the engagement-context's
 *  on-disk task state. Memo SSE wins for tasks it knows about (richer
 *  data: elapsed, error message); the context fills in anything else
 *  (e.g. on page refresh, when memoRun is null but disk has tasks). */
function mergeMemoTasks(
  runTasks: MemoRunTask[],
  liveTasks: ApiEngagementTask[],
): MemoRunTask[] {
  if (runTasks.length === 0) {
    return liveTasks.map((t) => ({
      id: t.id,
      stage: t.stage,
      title: t.title,
      skill: t.skill,
      status: t.status as MemoRunStatus,
      error: t.error ?? undefined,
    }));
  }
  const liveById = new Map(liveTasks.map((t) => [t.id, t]));
  return runTasks.map((rt) => {
    const live = liveById.get(rt.id);
    if (!live) return rt;
    // Memo-run status leads; if memo says pending but disk says done,
    // trust disk (the SSE may have missed the transition after refresh).
    const status: MemoRunStatus = rt.status === 'pending'
      ? (live.status as MemoRunStatus)
      : rt.status;
    return {
      ...rt,
      status,
      error: rt.error ?? live.error ?? undefined,
    };
  });
}

function MemoRunPanel({
  run,
  counterparty,
  liveTasks,
  engagementConnected,
  fallbackTicker,
}: {
  run: MemoRunState | null;
  counterparty: CounterpartyAvatar;
  liveTasks: ApiEngagementTask[];
  engagementConnected: boolean;
  fallbackTicker: string | null;
}) {
  const ticker = run?.ticker ?? fallbackTicker ?? '?';
  const template = run?.template ?? 'pitch-memo';
  const analyst = run?.analyst;
  const tasks = mergeMemoTasks(run?.tasks ?? [], liveTasks);
  const memoText = run?.memoText ?? null;
  const memoPath = run?.memoPath ?? null;
  const finished = run?.finished ?? false;
  const error = run?.error;

  return (
    <div className="flex gap-3">
      <Avatar initials={counterparty.initials} color={counterparty.color} size="sm" />
      <div className="flex-1 min-w-0 space-y-3">
        <div className="rounded-lg border border-border bg-card text-card-foreground px-4 py-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
              Memo · {ticker} · {template}
            </div>
            <div className="flex items-center gap-2">
              {!run && !finished && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  resumed from disk
                </span>
              )}
              <span
                className={cn(
                  'inline-block w-1.5 h-1.5 rounded-full',
                  engagementConnected ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                )}
                title={engagementConnected ? 'Live events connected' : 'Events disconnected'}
              />
              {analyst && (
                <div className="text-[10px] text-muted-foreground">filed under {analyst}</div>
              )}
            </div>
          </div>
          {tasks.length === 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
              <Loader2 className="w-3 h-3 animate-spin" /> Planning…
            </div>
          ) : (
            <ol className="space-y-1">
              {tasks.map((t) => (
                <MemoRunRow key={t.id} task={t} />
              ))}
            </ol>
          )}
          {error && (
            <div className="mt-3 text-xs text-rose-500 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" /> {error}
            </div>
          )}
        </div>
        {memoText && (
          <div className="rounded-lg border border-border bg-card text-card-foreground px-4 py-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                Assembled memo
              </div>
              {memoPath && (
                <code className="text-[10px] text-muted-foreground">{memoPath}</code>
              )}
            </div>
            <div className="whitespace-pre-line text-sm leading-relaxed">{memoText}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function MemoRunRow({ task }: { task: MemoRunTask }) {
  const icon =
    task.status === 'done'
      ? <Check className="w-3 h-3 text-emerald-500" />
      : task.status === 'in-progress'
      ? <Loader2 className="w-3 h-3 text-primary animate-spin" />
      : task.status === 'error'
      ? <AlertCircle className="w-3 h-3 text-rose-500" />
      : task.status === 'blocked'
      ? <AlertCircle className="w-3 h-3 text-amber-500" />
      : <span className="w-3 h-3 rounded-full border border-muted-foreground/40 inline-block" />;
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{task.title}</span>
          <span className="text-[10px] text-muted-foreground font-mono">{task.skill}</span>
          {task.elapsed != null && (
            <span className="text-[10px] text-muted-foreground tabular-nums">{task.elapsed.toFixed(1)}s</span>
          )}
        </div>
        {task.error && (
          <div className="text-[11px] text-rose-500 mt-0.5 break-words">{task.error}</div>
        )}
      </div>
    </li>
  );
}

function Bubble({
  msg,
  counterparty,
}: {
  msg: ApiChatMessage;
  counterparty: CounterpartyAvatar;
}) {
  const isPM = msg.role === 'pm';
  return (
    <div className={cn('flex gap-3', isPM ? 'flex-row-reverse' : '')}>
      {isPM ? (
        <Avatar initials="PM" color="violet" size="sm" />
      ) : (
        <Avatar initials={counterparty.initials} color={counterparty.color} size="sm" />
      )}
      <div className="flex-1 min-w-0 max-w-[85%]">
        <div
          className={cn(
            'rounded-lg px-4 py-3 text-sm leading-relaxed border',
            isPM
              ? 'bg-primary text-primary-foreground border-primary inline-block'
              : 'bg-card text-card-foreground border-border',
          )}
        >
          <div className="whitespace-pre-line">{msg.text}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Streaming bubble — rendered between the persisted assistant messages
 * and the composer while a reply is in flight. Three visual states:
 *
 *   * Pre-first-token: animated dots + "<name> is thinking…"
 *   * Mid-stream: the assistant's avatar + the accumulating text, with
 *     a soft pulsing caret that signals "still arriving".
 *   * Post-stream: this bubble unmounts and the persisted Bubble takes
 *     over (managed by the parent when onDone fires).
 */
function StreamingBubble({
  counterparty,
  counterpartyName,
  text,
}: {
  counterparty: CounterpartyAvatar;
  counterpartyName?: string;
  text: string;
}) {
  const showThinking = text.length === 0;
  return (
    <div className="flex gap-3">
      <Avatar initials={counterparty.initials} color={counterparty.color} size="sm" />
      <div className="flex-1 min-w-0 max-w-[85%]">
        <div className="rounded-lg px-4 py-3 text-sm leading-relaxed border bg-card text-card-foreground border-border">
          {showThinking ? (
            <div className="flex items-center gap-1.5 text-muted-foreground italic">
              <ThinkingDots />
              <span className="text-xs">
                {counterpartyName ? `${counterpartyName} is thinking…` : 'Thinking…'}
              </span>
            </div>
          ) : (
            <div className="whitespace-pre-line">
              {text}
              <span
                className="ml-0.5 inline-block w-1.5 h-3.5 -mb-0.5 bg-primary/70 align-baseline animate-pulse rounded-sm"
                aria-hidden
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  );
}

function TaskStatusDot({ status }: { status: ApiChatTask['status'] }) {
  const color =
    status === 'active'
      ? 'bg-emerald-500'
      : status === 'paused'
        ? 'bg-amber-500'
        : 'bg-muted-foreground/50';
  return (
    <span
      className={cn('w-1.5 h-1.5 rounded-full inline-block shrink-0', color)}
      title={status}
    />
  );
}

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = (now - t) / 60000;
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${Math.floor(diffMin)}m ago`;
  const diffHr = diffMin / 60;
  if (diffHr < 24) return `${Math.floor(diffHr)}h ago`;
  const diffDay = diffHr / 24;
  if (diffDay < 7) return `${Math.floor(diffDay)}d ago`;
  return new Date(iso).toLocaleDateString();
}
