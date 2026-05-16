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
import { CitedMarkdown } from '@/components/markdown/CitedMarkdown';
import { themeKeyFromText } from '@/lib/theme-key';
import {
  Send, Brain, Plus, MessageCircle, ChevronDown, ChevronRight,
  FolderOpen, Trash2, FileText, Sunrise, Search, BarChart3, CalendarClock,
  X, AlertTriangle, Check, Loader2, Sparkles, AlertCircle, Save, Lightbulb,
  Wrench, GraduationCap,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  getUniverse,
  getWorkflows,
  saveDataSpec,
  suggestWorkflow,
  type ApiPackWorkflow,
  type ApiTicker,
  type ApiWorkflow,
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

/** The auto-injected Data Engineer's slug. Mirrors ``DATA_ENGINEER_SLUG``
 *  in ``compass/analysts.py``. Used to gate the "Save as spec" affordance. */
const DATA_ENGINEER_SLUG = 'data-engineer';

type CounterpartyAvatar = {
  initials: string;
  color: string;
};

/** Live state of a chat-driven memo run — plan tasks, statuses, and
 *  the final assembled memo if compose-assemble produced one. */
type MemoRunStatus = 'pending' | 'in-progress' | 'done' | 'skipped' | 'error' | 'blocked';

type MemoRunTask = {
  id: string;
  stage: string;
  title: string;
  skill: string;
  status: MemoRunStatus;
  /** Latest "say" excerpt — the agent's thinking-out-loud text from the
   *  most recent assistant message during this task. Cleared when the
   *  task completes; rendered under the row while it's in-progress. */
  latestSay?: string;
  /** Rolling log of the most recent tool calls the agent made for this
   *  task (WebSearch / WebFetch / Read / Write / Glob / Grep / ...).
   *  Capped at the last few entries — we want the PM to see "the agent
   *  is looking up arXiv right now", not a verbose call trace. */
  recentTools?: { name: string; preview: string; ts: number }[];
  error?: string;
  /** Producer-supplied explanation when ``status === 'skipped'`` — e.g.
   *  "AKSO.OL is an EU ticker; SEC has no filings." Shown inline in the
   *  task row. */
  skippedReason?: string;
  elapsed?: number;
};

/** Cap on per-task tool-call history kept in client state. Tool calls
 *  beyond this window get dropped — the PM only cares about *what the
 *  agent is doing right now*, not every read/write the SDK loop made. */
const MEMO_RUN_TOOL_LOG_CAP = 4;

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
  { id: 'memo',             label: 'Memo',              icon: <FileText className="w-3 h-3" /> },
  { id: 'trading-idea',     label: 'Trading idea',      icon: <Lightbulb className="w-3 h-3" /> },
  { id: 'academic-idea',    label: 'Academic survey',   icon: <GraduationCap className="w-3 h-3" /> },
  { id: 'morning-brief',    label: 'Morning brief',     icon: <Sunrise className="w-3 h-3" /> },
  { id: 'find-data',        label: 'Find data',         icon: <Search className="w-3 h-3" /> },
  { id: 'data-analysis',    label: 'Data analysis',     icon: <BarChart3 className="w-3 h-3" /> },
  { id: 'catalysts',        label: 'Catalysts',         icon: <CalendarClock className="w-3 h-3" /> },
];

/** Planner templates that produce trading-idea memos keyed by a synthetic
 *  ``IDEA-<slug>`` engagement instead of a tradable ticker. Each chip
 *  picks a different survey lens (open-web news vs. academic literature)
 *  but the downstream ideation skill is the same. */
const IDEA_TEMPLATE = 'idea-exploration';
const ACADEMIC_TEMPLATE = 'academic-exploration';

/** True iff ``template`` is one of the theme-keyed (no-ticker) workflows. */
function isThemeTemplate(template: string | null): boolean {
  return template === IDEA_TEMPLATE || template === ACADEMIC_TEMPLATE;
}

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
  /** When set, the welcome screen renders the pack's named pipelines as
   *  chips instead of the generic TASK_TYPE_CHIPS. Click → memo flow with
   *  ``workflow.command`` as the planner template. AnalystDetailView fills
   *  this from the pack the analyst was hired from. */
  packWorkflows?: ApiPackWorkflow[];
};

export function ChatPane({
  ownerKey,
  counterparty,
  counterpartyName,
  placeholder,
  rightRail,
  rightRailTabs,
  initialRailTab,
  packWorkflows,
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
  /** When a memo-style flow is active (generic "Memo" chip OR a pack
   *  workflow chip), this holds the planner template the next ``Send`` will
   *  drive. ``null`` means the next message goes to chat, not to a run. */
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  /** Generic (persona-agnostic) workflow templates — pitch-memo,
   *  earnings-reaction, maintenance-refresh, deep-dive. Fetched once on
   *  mount; surfaced as a dropdown next to pack chips so a hired persona
   *  (e.g. Buffett) can still run a generic ``pitch-memo`` if the PM
   *  wants to compare frameworks. */
  const [genericWorkflows, setGenericWorkflows] = useState<ApiWorkflow[]>([]);
  /** When the PM sends with no chip selected, the router (Haiku call)
   *  may detect a workflow intent. This holds the suggestion until the
   *  PM confirms or cancels. Null = no pending route. */
  const [pendingRoute, setPendingRoute] = useState<{
    command: string;
    name: string;
    description: string;
    ticker: string | null;
    /** The original message text — restored to the composer if the PM cancels. */
    message: string;
  } | null>(null);
  /** Router Haiku call is in flight. Send button shows a spinner. */
  const [routing, setRouting] = useState(false);
  /** PM's message echoed in the UI the moment Send fires, before any
   *  session exists. Stays visible through routing / confirmation /
   *  cancel; cleared once the message lands in a real session (chat
   *  optimistic bubble takes over) or a memo run starts. */
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getWorkflows()
      .then((r) => {
        if (cancelled) return;
        setGenericWorkflows(r.workflows.filter((wf) => wf.pack_id === null));
      })
      .catch(() => { /* non-fatal — the chips still work */ });
    return () => { cancelled = true; };
  }, []);
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

  // Load candidate tickers the first time a memo-style flow becomes active.
  // Skip theme-keyed flows (trading idea, academic survey) — no ticker needed.
  useEffect(() => {
    if (selectedTemplate === null) return;
    if (isThemeTemplate(selectedTemplate)) return;
    if (memoCandidates.length > 0) return;
    let cancelled = false;
    getMemoCandidates(ownerKey)
      .then((data) => { if (!cancelled) setMemoCandidates(data.candidates); })
      .catch(() => { if (!cancelled) setMemoCandidates([]); });
    return () => { cancelled = true; };
  }, [selectedTemplate, ownerKey, memoCandidates.length]);

  // Reset memo-flow state when the flow exits or the owner changes.
  useEffect(() => {
    if (selectedTemplate === null) {
      setMemoTicker(null);
    }
  }, [selectedTemplate]);
  useEffect(() => {
    setMemoCandidates([]);
    setMemoTicker(null);
    setSelectedTemplate(null);
    setPendingRoute(null);
    setRouting(false);
    setPendingMessage(null);
  }, [ownerKey]);

  // When the active session belongs to a memo task with a coverage ticker,
  // wire the EngagementContext to (ownerKey, ticker). This is what makes a
  // mid-run page refresh resilient: the streamMemoRun SSE is gone, but the
  // EngagementContext's SSE re-subscribes and re-fetches tasks from disk.
  //
  // Gated on ``!loading`` so a tab-switch remount (which empties sessions
  // until the first refresh completes) doesn't transiently null the
  // engagement — that would tear down the right-rail SSE and leave the
  // tasks panel stale until the user manually refreshes the page.
  //
  // Special case: master-agent idea-exploration runs land under the synthetic
  // ``house`` analyst with an ``IDEA-<slug>`` ticker — we know that without
  // needing the dispatcher to tell us, so the rails light up immediately.
  // Master-agent *ticker* memos still skip until we persist the resolved
  // analyst on ApiChatTask.
  useEffect(() => {
    if (loading) return;
    if (!activeTask || !activeTask.coverageTicker) {
      setEngagement(null);
      return;
    }
    const ticker = activeTask.coverageTicker;
    if (ticker.startsWith('IDEA-')) {
      setEngagement({ analyst: 'house', ticker });
      return;
    }
    if (ownerKey === 'master') {
      setEngagement(null);
      return;
    }
    setEngagement({ analyst: ownerKey, ticker });
  }, [activeTask, ownerKey, setEngagement, loading]);

  // Debounced LLM pre-fill of the ticker as the PM types. Only runs while
  // a memo flow is active (any template) and no ticker has been picked yet.
  // Skip theme-keyed flows — they don't have a ticker.
  useEffect(() => {
    if (selectedTemplate === null) return;
    if (isThemeTemplate(selectedTemplate)) return;
    if (memoTicker) return;
    const trimmed = input.trim();
    if (trimmed.length < 4) return;
    if (memoCandidates.length === 0) return;
    setMemoSuggesting(true);
    const handle = window.setTimeout(() => {
      suggestMemoTicker(ownerKey, { message: trimmed })
        .then((res) => {
          if (res.ticker && memoTicker === null && selectedTemplate !== null) {
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
  }, [input, selectedTemplate, memoTicker, memoCandidates.length, ownerKey]);

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

  /** Save-as-spec dialog state. Opens with the latest assistant message
   *  pre-loaded as ``saveSpecContent`` and a slug parsed from the
   *  ``**slug:** `<...>` `` line when the DE included one. */
  const [saveSpecOpen, setSaveSpecOpen] = useState(false);
  const [saveSpecSlug, setSaveSpecSlug] = useState('');
  const [saveSpecContent, setSaveSpecContent] = useState('');
  const [savingSpec, setSavingSpec] = useState(false);
  const [saveSpecError, setSaveSpecError] = useState<string | null>(null);
  /** Brief success state shown after the save lands. ``null`` = idle. */
  const [saveSpecResult, setSaveSpecResult] = useState<{ path: string; bytes: number } | null>(null);

  function openSaveSpec() {
    if (!active) return;
    const lastAssistant = [...active.messages].reverse().find((m) => m.role !== 'pm');
    if (!lastAssistant) {
      setSaveSpecContent('');
      setSaveSpecSlug('');
      setSaveSpecError('No assistant message yet — chat with the Data Engineer first.');
      setSaveSpecResult(null);
      setSaveSpecOpen(true);
      return;
    }
    const text = lastAssistant.text;
    const slugMatch = text.match(/\*\*slug:\*\*\s*`?([a-z][a-z0-9-]*)`?/i);
    setSaveSpecContent(text);
    setSaveSpecSlug(slugMatch ? slugMatch[1] : '');
    setSaveSpecError(null);
    setSaveSpecResult(null);
    setSaveSpecOpen(true);
  }

  async function submitSaveSpec() {
    const slug = saveSpecSlug.trim().toLowerCase();
    if (!slug || !saveSpecContent.trim()) return;
    setSavingSpec(true);
    setSaveSpecError(null);
    try {
      const result = await saveDataSpec({ slug, content: saveSpecContent });
      setSaveSpecResult({ path: result.path, bytes: result.bytes });
    } catch (err) {
      setSaveSpecError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSpec(false);
    }
  }

  function closeSaveSpec() {
    if (savingSpec) return;
    setSaveSpecOpen(false);
    setSaveSpecError(null);
    setSaveSpecResult(null);
  }

  function toggleTask(taskId: string) {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  }

  async function sendMemo(
    message: string,
    ticker: string,
    template: string,
    reuseSessionId?: string,
  ) {
    // When ``reuseSessionId`` is provided we land the run inside an
    // already-open empty session (e.g. the user clicked "+ New task"
    // first, then picked a workflow chip). Otherwise we create the
    // task+session up front. Either way the memo run has a session to
    // persist its summary into.
    let sessionId: string;
    let newTaskId: string | undefined;
    const isIdea = isThemeTemplate(template);
    const ideaLabel = template === ACADEMIC_TEMPLATE ? 'Academic ideas' : 'Trading ideas';
    if (reuseSessionId) {
      sessionId = reuseSessionId;
      setSelectedChip(null);
      setSelectedTemplate(null);
      setMemoTicker(null);
    } else {
      try {
        // For theme-keyed flows we file the chat task under the synthetic
        // IDEA-<slug> "ticker" so the right-rail Tasks/Files tabs + the
        // MemoRunPanel can resume against the same engagement after a
        // page reload (without this they'd lose their handle and go blank).
        const taskTitle = isIdea
          ? `${ideaLabel} — ${message.slice(0, 60)}`
          : `Memo on ${ticker}`;
        const newT = await createChatTask(ownerKey, {
          title: taskTitle,
          coverage_ticker: ticker,
        });
        const newS = await createChatSession(ownerKey, { task_id: newT.id });
        setTasks((prev) => [newT, ...prev]);
        setSessions((prev) => [newS, ...prev]);
        setExpandedTaskIds((prev) => new Set([...prev, newT.id]));
        setActiveId(newS.id);
        setSelectedChip(null);
        setSelectedTemplate(null);
        setMemoTicker(null);
        sessionId = newS.id;
        newTaskId = newT.id;
      } catch {
        refresh();
        return;
      }
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
      template,
      tasks: [],
      memoText: null,
      memoPath: null,
      finished: false,
    });

    streamMemoRun(
      ownerKey, sessionId,
      { ticker, template, message },
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
            tasks: prev.tasks.map((t) => (
              t.id === task_id ? { ...t, status: 'in-progress', latestSay: undefined } : t
            )),
          } : prev)),
        onTaskDone: ({ task_id, elapsed }) =>
          setMemoRun((prev) => (prev ? {
            ...prev,
            tasks: prev.tasks.map((t) => (
              t.id === task_id ? { ...t, status: 'done', elapsed, latestSay: undefined } : t
            )),
          } : prev)),
        onTaskSkipped: ({ task_id, elapsed, skipped_reason }) =>
          setMemoRun((prev) => (prev ? {
            ...prev,
            tasks: prev.tasks.map((t) => (
              t.id === task_id
                ? { ...t, status: 'skipped', elapsed, latestSay: undefined, skippedReason: skipped_reason }
                : t
            )),
          } : prev)),
        onSay: ({ task_id, message }) => {
          if (!task_id || !message) return;
          setMemoRun((prev) => (prev ? {
            ...prev,
            tasks: prev.tasks.map((t) => (
              t.id === task_id ? { ...t, latestSay: message } : t
            )),
          } : prev));
        },
        onTool: ({ task_id, tool_name, preview }) => {
          if (!task_id || !tool_name) return;
          // ``preview`` is the formatted "ToolName arg=value …" string the
          // backend already produced — readable enough for the chat.
          const display = (preview || tool_name).trim();
          setMemoRun((prev) => (prev ? {
            ...prev,
            tasks: prev.tasks.map((t) => {
              if (t.id !== task_id) return t;
              const next = [
                ...(t.recentTools ?? []),
                { name: tool_name, preview: display, ts: Date.now() },
              ];
              return {
                ...t,
                recentTools: next.slice(-MEMO_RUN_TOOL_LOG_CAP),
              };
            }),
          } : prev));
        },
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
    // Echo the PM's message immediately so they see it landed even
    // before routing/session creation finishes. Cleared at the end of
    // the chat path (real session message takes over) or at the start
    // of a memo run (memo flow has its own optimistic bubble).
    setPendingMessage(trimmed);
    setInput('');
    // Theme-keyed branch (Trading idea / Academic survey): no ticker
    // needed. The PM's typed message IS the theme; we derive a stable
    // ``IDEA-<slug>`` engagement key from it and dispatch.
    if (
      selectedTemplate !== null &&
      isThemeTemplate(selectedTemplate) &&
      (!active || active.messages.length === 0)
    ) {
      const themeKey = themeKeyFromText(trimmed);
      setPendingMessage(null);
      await sendMemo(trimmed, themeKey, selectedTemplate, active?.id);
      return;
    }

    // Memo-flow branch: a memo template is active (generic Memo chip or
    // pack workflow chip). If the PM already picked a ticker, we run
    // straight away. If not, do a last-chance synchronous resolve from
    // the typed message — handles the "clicked chip, typed 'AKSO',
    // hit Send before the 600ms debounce fired" race that otherwise
    // strands the user with a grey button or surprising chat fallback.
    if (
      selectedTemplate !== null &&
      (!active || active.messages.length === 0)
    ) {
      let resolvedTicker: string | null = memoTicker;
      if (!resolvedTicker) {
        setRouting(true);
        try {
          const res = await suggestMemoTicker(ownerKey, { message: trimmed });
          resolvedTicker = res.ticker ?? null;
        } catch {
          resolvedTicker = null;
        } finally {
          setRouting(false);
        }
      }
      if (resolvedTicker) {
        setMemoTicker(resolvedTicker);
        setPendingMessage(null);
        await sendMemo(trimmed, resolvedTicker, selectedTemplate, active?.id);
        return;
      }
      // No ticker resolved — surface a confirmation card so the PM can
      // pick from the dropdown, rather than silently routing to chat.
      const pack = (packWorkflows ?? []).find((w) => w.command === selectedTemplate);
      const generic = genericWorkflows.find((w) => w.name === selectedTemplate);
      setPendingRoute({
        command: selectedTemplate,
        name: pack?.name ?? generic?.display_name ?? selectedTemplate,
        description: pack?.description ?? generic?.description ?? 'Pick a ticker below to run this workflow.',
        ticker: null,
        message: trimmed,
      });
      return;
    }

    // Router intercept: only when no chip is selected AND we're in the
    // welcome state (no active session OR a brand-new empty session).
    // We ask Haiku whether the message clearly fits a workflow; if so,
    // surface a confirmation banner and pause. The PM either Confirms
    // (→ memo flow) or Cancels (→ continue to chat). Skip the call when
    // we already have a pending suggestion — the PM is in the middle of
    // deciding on it.
    const inWelcome = !active || active.messages.length === 0;
    const packs = packWorkflows ?? [];
    if (
      inWelcome
      && selectedTemplate === null
      && !pendingRoute
      && (packs.length > 0 || genericWorkflows.length > 0)
    ) {
      const all = [
        ...packs.map((w) => ({
          command: w.command, name: w.name, description: w.description,
        })),
        ...genericWorkflows.map((w) => ({
          command: w.name, name: w.display_name, description: w.description ?? '',
        })),
      ];
      setRouting(true);
      try {
        const route = await suggestWorkflow(ownerKey, {
          message: trimmed,
          workflows: all,
        });
        if (route.workflow && isThemeTemplate(route.workflow)) {
          // The router picked a theme-keyed workflow — no ticker prompt,
          // just run it directly with a theme-derived key.
          setRouting(false);
          setPendingMessage(null);
          await sendMemo(trimmed, themeKeyFromText(trimmed), route.workflow, active?.id);
          return;
        }
        if (route.workflow) {
          setPendingRoute({
            command: route.workflow,
            name: route.workflow_name ?? route.workflow,
            description: route.workflow_description ?? '',
            ticker: route.ticker,
            message: trimmed,
          });
          setRouting(false);
          return;
        }
      } catch {
        // Router failure shouldn't block chat. Fall through.
      }
      setRouting(false);
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
    // The session now carries the message — clear the welcome-area echo
    // so we don't show it twice.
    setPendingMessage(null);

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

  /** PM confirmed the router's suggestion. Set up the memo flow with the
   *  suggested workflow + ticker and fire ``sendMemo`` immediately so the
   *  PM doesn't have to hit Send a second time. */
  async function confirmRouterSuggestion() {
    if (!pendingRoute) return;
    const { command, ticker, message } = pendingRoute;
    setPendingRoute(null);
    // Theme-keyed workflows have no ticker — derive the key from the
    // PM's message and run.
    if (isThemeTemplate(command)) {
      setPendingMessage(null);
      await sendMemo(message, themeKeyFromText(message), command, active?.id);
      return;
    }
    if (!ticker) {
      // Workflow detected but no ticker — fall back to chat with the
      // original message so the PM can clarify in conversation.
      setInput(message);
      setPendingMessage(null);
      return;
    }
    setPendingMessage(null);
    await sendMemo(message, ticker, command, active?.id);
  }

  /** PM said "just chat" — drop the suggestion and send the message
   *  through the regular chat path (with the same composer text). */
  function cancelRouterSuggestion(continueAsChat: boolean) {
    if (!pendingRoute) return;
    const message = pendingRoute.message;
    setPendingRoute(null);
    if (continueAsChat) {
      // Push the message through chat. ``send`` already early-exits when
      // pendingRoute is null (we just cleared it), so this won't recurse.
      send(message);
    } else {
      // Restore the message into the composer so the PM can edit and retry.
      setInput(message);
      setPendingMessage(null);
    }
  }

  function toggleChip(label: string) {
    setSelectedChip((prev) => {
      const next = prev === label ? null : label;
      // Chip → planner-template mapping. Anything not in this map stays
      // in chat mode (Morning brief, Catalysts, ...).
      const chipTemplate: Record<string, string> = {
        'Memo':            'pitch-memo',
        'Trading idea':    IDEA_TEMPLATE,
        'Academic survey': ACADEMIC_TEMPLATE,
      };
      const wasWorkflow = prev !== null && prev in chipTemplate;
      if (next !== null && next in chipTemplate) {
        setSelectedTemplate(chipTemplate[next]);
      } else if (wasWorkflow) {
        setSelectedTemplate(null);
      }
      return next;
    });
  }

  /** Pack workflow chip click: select it as the active task type AND set
   *  the planner template. Same end-state as toggleChip('Memo'), just with
   *  a pack-specific command. */
  function chooseWorkflow(workflow: ApiPackWorkflow) {
    setSelectedChip((prev) => (prev === workflow.name ? null : workflow.name));
    setSelectedTemplate((prev) => (
      prev === workflow.command ? null : workflow.command
    ));
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
          {!active || (active.messages.length === 0 && streamingText === null && memoRun === null) ? (
            // No active session OR a brand-new empty session — both land on
            // the welcome panel so the pack workflow chips stay reachable
            // when the PM clicks "+ New task" or "+ New session" on a
            // pack-aware analyst.
            <>
              <WelcomePanel
                counterparty={counterparty}
                counterpartyName={counterpartyName}
                selectedChip={selectedChip}
                onChip={toggleChip}
                memoCandidates={memoCandidates}
                memoTicker={memoTicker}
                memoSuggesting={memoSuggesting}
                onMemoTicker={setMemoTicker}
                packWorkflows={packWorkflows}
                genericWorkflows={genericWorkflows}
                onWorkflow={chooseWorkflow}
                selectedTemplate={selectedTemplate}
              />
              {/* Echo the PM's message immediately on Send — so they don't
                  stare at a "Routing…" button wondering if their input was
                  even received. Cleared once a real session message takes
                  over (chat path) or a memo run kicks off. */}
              {pendingMessage && (
                <div className="mt-6">
                  <Bubble
                    msg={{
                      id: 'pending-pm',
                      role: 'pm',
                      text: pendingMessage,
                      ts: new Date().toISOString(),
                    }}
                    counterparty={counterparty}
                  />
                  {(routing || pendingRoute) && (
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground italic items-center">
                      <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
                      {routing ? 'Routing your message…' : 'Confirm or cancel the suggestion below to continue.'}
                    </div>
                  )}
                </div>
              )}
            </>
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
            {/* Router suggestion — Haiku detected a workflow intent in the
                PM's message. Confirm to run it, or fall through to chat. */}
            {pendingRoute && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 text-xs">
                    <div className="font-medium">
                      Detected:{' '}
                      <span className="text-primary">{pendingRoute.name}</span>
                      {pendingRoute.ticker && (
                        <>
                          {' '}on{' '}
                          <code className="font-mono text-primary">{pendingRoute.ticker}</code>
                        </>
                      )}
                    </div>
                    {pendingRoute.description && (
                      <div className="text-muted-foreground mt-0.5 line-clamp-2">
                        {pendingRoute.description}
                      </div>
                    )}
                    {!pendingRoute.ticker && !isThemeTemplate(pendingRoute.command) && (
                      <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                        Couldn't auto-resolve a ticker — pick one below.
                      </div>
                    )}
                  </div>
                </div>

                {/* Ticker picker — visible when the router couldn't resolve
                    one from the message. Searches coverage first (instant,
                    in-memory), then the broader universe as the PM types.
                    Suppressed for theme-keyed workflows (Trading idea / Academic). */}
                {!pendingRoute.ticker && !isThemeTemplate(pendingRoute.command) && (
                  <RouteTickerPicker
                    candidates={memoCandidates}
                    onPick={(ticker) => setPendingRoute((prev) => (
                      prev ? { ...prev, ticker } : prev
                    ))}
                  />
                )}

                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => cancelRouterSuggestion(false)}
                    title="Drop the suggestion and edit your message"
                  >
                    Edit message
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => cancelRouterSuggestion(true)}
                    title="Send the message through normal chat instead"
                  >
                    Just chat
                  </Button>
                  <Button
                    size="sm"
                    onClick={confirmRouterSuggestion}
                    disabled={!pendingRoute.ticker && !isThemeTemplate(pendingRoute.command)}
                    title={
                      isThemeTemplate(pendingRoute.command)
                        ? 'Run this workflow'
                        : pendingRoute.ticker
                          ? 'Run this workflow'
                          : 'Pick a ticker first'
                    }
                  >
                    <Sparkles className="w-3 h-3" />
                    Run {pendingRoute.name}
                  </Button>
                </div>
              </div>
            )}

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
              <div className="flex items-center gap-2">
                {ownerKey === DATA_ENGINEER_SLUG
                  && active
                  && active.messages.some((m) => m.role !== 'pm') && (
                  <Button
                    onClick={openSaveSpec}
                    variant="outline"
                    size="sm"
                    title="Save the Data Engineer's latest reply as a data-source spec under specs/data/"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save as spec
                  </Button>
                )}
              <Button
                onClick={() => send(input)}
                disabled={
                  !input.trim()
                  || sending
                  || routing
                  || pendingRoute !== null
                }
                size="sm"
              >
                {routing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Routing…
                  </>
                ) : !active && selectedTemplate !== null && memoTicker ? (
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

      {/* Save-as-spec dialog — Data Engineer flow. Pre-fills slug from the
          ``**slug:** <x>`` line in the latest assistant message; the body
          is the entire message (human trims pre-spec chitchat in the file). */}
      <Dialog
        open={saveSpecOpen}
        onClose={closeSaveSpec}
        title={saveSpecResult ? 'Spec saved' : 'Save data-source spec'}
        description={
          saveSpecResult
            ? undefined
            : "Persist the Data Engineer's latest reply under specs/data/."
        }
        maxWidth="max-w-xl"
      >
        {saveSpecResult ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <Check className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="text-sm space-y-1">
                <div>Saved to <code className="font-mono text-[11px]">{saveSpecResult.path}</code></div>
                <div className="text-[11px] text-muted-foreground">{saveSpecResult.bytes} bytes</div>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-border">
              <Button size="sm" onClick={closeSaveSpec}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Slug
              </label>
              <Input
                placeholder="e.g. insider-form-4-daily"
                value={saveSpecSlug}
                onChange={(e) => setSaveSpecSlug(e.target.value)}
                disabled={savingSpec}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && saveSpecSlug.trim() && saveSpecContent.trim()) {
                    e.preventDefault();
                    submitSaveSpec();
                  }
                }}
              />
              <p className="text-[10px] text-muted-foreground">
                Becomes <code className="font-mono">specs/data/&lt;slug&gt;.md</code> and the future
                fetch skill's folder name. Lowercase letters, digits, hyphens.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Content <span className="text-muted-foreground/60 normal-case font-normal lowercase">— editable preview</span>
              </label>
              <Textarea
                value={saveSpecContent}
                onChange={(e) => setSaveSpecContent(e.target.value)}
                rows={10}
                disabled={savingSpec}
                className="font-mono text-[11px] leading-relaxed"
              />
            </div>
            {saveSpecError && (
              <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-2">
                <strong>Couldn't save:</strong> {saveSpecError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={closeSaveSpec} disabled={savingSpec}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={submitSaveSpec}
                disabled={savingSpec || !saveSpecSlug.trim() || !saveSpecContent.trim()}
              >
                {savingSpec && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <Save className="w-3.5 h-3.5" />
                Save
              </Button>
            </div>
          </div>
        )}
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
  packWorkflows,
  genericWorkflows,
  onWorkflow,
  selectedTemplate,
}: {
  counterparty: CounterpartyAvatar;
  counterpartyName?: string;
  selectedChip: string | null;
  onChip: (label: string) => void;
  memoCandidates: ApiMemoCandidate[];
  memoTicker: string | null;
  memoSuggesting: boolean;
  onMemoTicker: (ticker: string | null) => void;
  packWorkflows?: ApiPackWorkflow[];
  /** Persona-agnostic templates (pitch-memo, etc.) shown as a dropdown
   *  next to a pack's chips so the PM can still run a generic workflow
   *  against a persona-hired analyst. */
  genericWorkflows?: ApiWorkflow[];
  onWorkflow: (workflow: ApiPackWorkflow) => void;
  selectedTemplate: string | null;
}) {
  const greeting = counterpartyName
    ? `Hey boss — what would you like ${counterpartyName} to work on?`
    : `Hey boss — what would you like to work on?`;

  // Pack-based analysts replace the generic chips with their pack's
  // named pipelines. "The menu is the persona" — Buffett's chips are
  // not the same as the master agent's chips.
  const usePackChips = (packWorkflows?.length ?? 0) > 0;
  const subtitle = usePackChips
    ? "Pick one of this analyst's pipelines, then describe the company you want them to look at."
    : 'Pick a task type below (optional), then describe what you need in the composer.';

  return (
    <div className="mt-8 max-w-2xl mx-auto text-center space-y-5">
      <div className="flex items-center justify-center gap-3">
        <Avatar initials={counterparty.initials} color={counterparty.color} size="md" />
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{greeting}</h2>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>
      <div className="flex flex-wrap justify-center items-center gap-2 pt-2">
        {usePackChips
          ? <>
              {packWorkflows!.map((wf) => {
                const isSelected = selectedTemplate === wf.command;
                return (
                  <button
                    key={wf.command}
                    onClick={() => onWorkflow(wf)}
                    title={wf.description}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary text-secondary-foreground border-border hover:bg-accent hover:border-primary/40',
                    )}
                  >
                    <FileText className="w-3 h-3" />
                    {wf.name}
                  </button>
                );
              })}
              {(genericWorkflows?.length ?? 0) > 0 && (
                <GenericWorkflowDropdown
                  workflows={genericWorkflows!}
                  selectedTemplate={selectedTemplate}
                  onPick={onWorkflow}
                />
              )}
            </>
          : TASK_TYPE_CHIPS.map((c) => {
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
      {selectedTemplate !== null && !isThemeTemplate(selectedTemplate) && (
        <MemoTickerStatus
          candidates={memoCandidates}
          ticker={memoTicker}
          suggesting={memoSuggesting}
          onClear={() => onMemoTicker(null)}
        />
      )}
      {selectedTemplate === IDEA_TEMPLATE && (
        <div className="mx-auto max-w-md text-xs text-muted-foreground bg-secondary/40 border border-border rounded-md px-3 py-2 text-left">
          <Lightbulb className="inline-block w-3 h-3 text-primary mr-1 -translate-y-px" />
          <span className="font-medium text-foreground">Trading-idea mode.</span>{' '}
          Describe a theme in the composer — the master agent will run an open-web
          survey, inventory the pod's existing memos on the topic, and write up
          new trading ideas grounded in both. No ticker needed.
        </div>
      )}
      {selectedTemplate === ACADEMIC_TEMPLATE && (
        <div className="mx-auto max-w-md text-xs text-muted-foreground bg-secondary/40 border border-border rounded-md px-3 py-2 text-left">
          <GraduationCap className="inline-block w-3 h-3 text-primary mr-1 -translate-y-px" />
          <span className="font-medium text-foreground">Academic-survey mode.</span>{' '}
          Describe a theme. The survey reads arXiv q-fin, Semantic Scholar, and
          SSRN (papers, not news) and feeds the ideation step. Same trading-idea
          memo at the end, grounded in the research literature.
        </div>
      )}
    </div>
  );
}

/** Inline status shown under the chip row whenever a memo workflow is
 *  active. Replaces the old ticker-picker grid: the PM mentions the
 *  ticker in the composer message and Haiku auto-resolves it server-side.
 *  We only surface the *result* here — a small pill when we've got one,
 *  a hint otherwise. */
/** Searchable ticker picker shown inside the router-suggestion banner
 *  when Haiku detected a workflow but couldn't bind it to a ticker.
 *
 *  Two tiers:
 *
 *    1. **Coverage** — the analyst's coverage list (memoCandidates).
 *       Filtered in-memory by the search query; renders as clickable chips.
 *    2. **Universe** — debounced server-side ranked search via
 *       ``getUniverse``. Excludes coverage tickers to avoid duplicates.
 *       Fires only when the query is ≥ 2 chars.
 *
 *  Clicking a chip calls ``onPick`` with the ticker string. The parent
 *  (the pendingRoute confirmation card) then enables the Run button.
 */
function RouteTickerPicker({
  candidates,
  onPick,
}: {
  candidates: ApiMemoCandidate[];
  onPick: (ticker: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [universeMatches, setUniverseMatches] = useState<ApiTicker[]>([]);
  const [searching, setSearching] = useState(false);

  // Coverage filter — instant, since the list is small and already loaded.
  const filteredCoverage = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      (c.ticker || '').toLowerCase().includes(q)
      || (c.name || '').toLowerCase().includes(q)
    );
  }, [candidates, query]);

  // Debounced universe search — only when the PM has typed something
  // substantial. 200ms is short enough to feel responsive, long enough
  // to coalesce keystrokes.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setUniverseMatches([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = window.setTimeout(() => {
      getUniverse({ query: q, limit: 8 })
        .then((u) => setUniverseMatches(u.tickers))
        .catch(() => setUniverseMatches([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => {
      window.clearTimeout(handle);
      setSearching(false);
    };
  }, [query]);

  // Universe results minus tickers already shown under Coverage.
  const universeOnly = useMemo(() => {
    const coverageSet = new Set(candidates.map((c) => c.ticker));
    return universeMatches.filter((t) => !coverageSet.has(t.ticker));
  }, [universeMatches, candidates]);

  const queryActive = query.trim().length >= 2;
  const noMatches = queryActive
    && !searching
    && filteredCoverage.length === 0
    && universeOnly.length === 0;

  return (
    <div className="pt-2 mt-1 border-t border-primary/20 space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
        <Input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          placeholder='Search coverage or universe — try "AKSO", "MC.PA", "AZN", "Aker"…'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-7 h-8 text-xs"
        />
      </div>

      <div className="max-h-44 overflow-y-auto space-y-2 scrollbar-thin">
        {/* Coverage tier */}
        {filteredCoverage.length > 0 && (
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              {queryActive && filteredCoverage.length !== candidates.length
                ? `Coverage · ${filteredCoverage.length} match${filteredCoverage.length === 1 ? '' : 'es'}`
                : 'Coverage'}
            </div>
            <div className="flex flex-wrap gap-1">
              {filteredCoverage.map((c) => (
                <RouteTickerChip
                  key={c.ticker}
                  ticker={c.ticker}
                  name={c.name || ''}
                  onClick={() => onPick(c.ticker)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Universe tier — only when the PM typed something */}
        {(searching || universeOnly.length > 0) && (
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              From the universe
              {searching && (
                <Loader2 className="inline-block w-2.5 h-2.5 animate-spin ml-1 text-muted-foreground/60" />
              )}
            </div>
            {universeOnly.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {universeOnly.map((t) => (
                  <RouteTickerChip
                    key={t.ticker}
                    ticker={t.ticker}
                    name={t.name}
                    onClick={() => onPick(t.ticker)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {noMatches && (
          <div className="text-[11px] text-muted-foreground italic">
            No matches for "{query}". Try the bare symbol or the company name.
          </div>
        )}

        {!queryActive && candidates.length === 0 && (
          <div className="text-[11px] text-muted-foreground italic">
            No coverage yet — type a symbol or company name to search the universe.
          </div>
        )}
      </div>
    </div>
  );
}

function RouteTickerChip({
  ticker,
  name,
  onClick,
}: {
  ticker: string;
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={name}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-card border border-border hover:bg-primary/10 hover:border-primary/50 transition-colors"
    >
      {ticker}
    </button>
  );
}

function MemoTickerStatus({
  candidates,
  ticker,
  suggesting,
  onClear,
}: {
  candidates: ApiMemoCandidate[];
  ticker: string | null;
  suggesting: boolean;
  onClear: () => void;
}) {
  // When there's no coverage at all, ticker auto-resolution can't work —
  // ``suggestMemoTicker`` has nothing to pick from. Steer the PM to fix
  // the root cause instead of leaving them poking a disabled Send button.
  if (candidates.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground italic mt-1">
        No coverage tickers found. Add tickers to this analyst's coverage
        (or your watchlist for the master agent) to run a memo.
      </div>
    );
  }
  if (ticker) {
    return (
      <div className="flex items-center justify-center gap-1.5 text-[11px] mt-1">
        <span className="text-muted-foreground">Targeting</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-[11px] font-medium">
          {ticker}
          <button
            onClick={onClear}
            className="text-primary/70 hover:text-primary"
            title="Clear — re-resolve from your next message"
            aria-label="Clear targeted ticker"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground italic mt-1">
      {suggesting ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          Resolving ticker from your message…
        </>
      ) : (
        <>Mention a ticker in your message — I'll pick it up.</>
      )}
    </div>
  );
}


/** Native ``<select>`` dressed as a chip — sits next to a pack's named
 *  workflows so a persona-hired analyst can still drive a generic
 *  ``pitch-memo`` / ``earnings-reaction`` / etc. when the PM wants to
 *  compare frameworks. Picking an option synthesizes an
 *  :class:`ApiPackWorkflow` shape and routes it through the same
 *  ``onWorkflow`` handler the persona chips use, so all downstream
 *  state transitions stay identical. */
function GenericWorkflowDropdown({
  workflows,
  selectedTemplate,
  onPick,
}: {
  workflows: ApiWorkflow[];
  selectedTemplate: string | null;
  onPick: (wf: ApiPackWorkflow) => void;
}) {
  // Reflect the active template back to the <select> so it visually
  // tracks which generic was picked (or returns to placeholder when
  // another chip became active).
  const currentValue = selectedTemplate && workflows.some((w) => w.name === selectedTemplate)
    ? selectedTemplate
    : '';

  return (
    <Select
      aria-label="Run a generic workflow"
      title="Generic workflows — persona-agnostic templates the analyst can still run."
      value={currentValue}
      onChange={(e) => {
        const cmd = e.target.value;
        const wf = workflows.find((w) => w.name === cmd);
        if (!wf) return;
        onPick({
          command: wf.name,
          name: wf.display_name,
          description: wf.description ?? '',
        });
      }}
      // Match the chip row's height + rhythm — taller than the default
      // 32px so we don't look out of place beside the buttons.
      className="h-[34px] text-xs font-medium border-border"
    >
      <option value="" disabled>
        Generic ▾
      </option>
      {workflows.map((wf) => (
        <option key={wf.name} value={wf.name}>
          {wf.display_name}
        </option>
      ))}
    </Select>
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

/** How "advanced" each task status is. Used by ``mergeMemoTasks`` to pick
 *  the more-progressed state when the memo-SSE channel and the engagement
 *  SSE channel disagree (which happens routinely: events can buffer or
 *  arrive out of order across the two streams). */
const STATUS_RANK: Record<string, number> = {
  pending:        0,
  blocked:        0,
  'in-progress':  1,
  review:         2,
  done:           3,
  error:          3,
  cancelled:      3,
};

/** Merge the in-flight memo-run state with the engagement-context's
 *  on-disk task state. We pick the *more advanced* status from either
 *  channel — so a missed memo-SSE ``task_done`` doesn't leave a row
 *  spinning forever when the engagement SSE already saw the disk write. */
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
    const rtRank   = STATUS_RANK[rt.status] ?? 0;
    const liveRank = STATUS_RANK[live.status] ?? 0;
    const status: MemoRunStatus = liveRank > rtRank
      ? (live.status as MemoRunStatus)
      : rt.status;
    return {
      ...rt,
      status,
      error: rt.error ?? live.error ?? undefined,
    };
  });
}

/** Engagement-phase taxonomy used to group the in-chat task list. Mirrors
 *  ``compass.engagement.PHASES`` so the order stays consistent with the
 *  right-rail Tasks tab. */
const MEMO_STAGE_ORDER: MemoRunTask['stage'][] = [
  'setup', 'ingest', 'analyze', 'compose', 'maintain',
];

const MEMO_STAGE_LABEL: Record<string, string> = {
  setup:    'Setup',
  ingest:   'Ingest',
  analyze:  'Analyze',
  compose:  'Compose',
  maintain: 'Maintain',
};

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
  const finished = run?.finished ?? false;
  const error = run?.error;

  // "All tasks done" — both the in-flight memoRun and the resumed-from-disk
  // case (run === null, liveTasks all done). Skipped counts as terminal
  // (the producer ran and bailed deliberately — no further work coming).
  // Drives the default-collapsed disclosure: once everything's finished
  // the chat bubble is the headline output, not the task list.
  const isTerminal = (s: MemoRunStatus) => s === 'done' || s === 'skipped';
  const allDone = tasks.length > 0 && tasks.every((t) => isTerminal(t.status));
  const isCompleted = finished || (run === null && allDone);

  // Default-collapse the task list when the run is done. While in flight,
  // the PM wants to see what's happening live; once finished the bubble
  // takes over and the list becomes a "what did you do?" disclosure.
  const [expanded, setExpanded] = useState(!isCompleted);
  useEffect(() => {
    if (isCompleted) setExpanded(false);
  }, [isCompleted]);

  // Group by stage. Tasks without a known stage land in a fallthrough
  // bucket at the end so they're still visible.
  const grouped = useMemo(() => {
    const m = new Map<string, MemoRunTask[]>();
    for (const t of tasks) {
      const key = MEMO_STAGE_ORDER.includes(t.stage as MemoRunTask['stage']) ? t.stage : 'other';
      (m.get(key) ?? m.set(key, []).get(key)!).push(t);
    }
    const order = [...MEMO_STAGE_ORDER, 'other'];
    return order
      .filter((k) => (m.get(k) ?? []).length > 0)
      .map((stage) => ({
        stage,
        items: m.get(stage)!,
        done: m.get(stage)!.filter((t) => isTerminal(t.status)).length,
        total: m.get(stage)!.length,
      }));
  }, [tasks]);

  const totalDone = tasks.filter((t) => isTerminal(t.status)).length;

  return (
    <div className="flex gap-3">
      <Avatar initials={counterparty.initials} color={counterparty.color} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="rounded-lg border border-border bg-card text-card-foreground px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-xs font-semibold tracking-wide uppercase text-muted-foreground truncate">
                Memo · {ticker} · {template}
              </div>
              {isCompleted && (
                <Check className="w-3 h-3 text-emerald-500 shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {totalDone}/{tasks.length}
              </span>
              {!run && !finished && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  resumed
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
                <div className="text-[10px] text-muted-foreground">{analyst}</div>
              )}
              {/* Toggle button — useful both for collapsing a long live
                  list and for expanding the post-completion disclosure. */}
              {tasks.length > 0 && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="text-muted-foreground hover:text-foreground p-0.5"
                  title={expanded ? 'Hide tasks' : 'Show tasks'}
                >
                  {expanded
                    ? <ChevronDown className="w-3 h-3" />
                    : <ChevronRight className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic mt-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Planning…
            </div>
          ) : expanded ? (
            <div className="mt-2 space-y-2">
              {grouped.map(({ stage, items, done, total }) => (
                <div key={stage} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    <span>{MEMO_STAGE_LABEL[stage] ?? stage}</span>
                    <span className="tabular-nums">{done}/{total}</span>
                  </div>
                  <ol className="space-y-1 pl-1 border-l border-border/60 ml-1">
                    {items.map((t) => (
                      <li key={t.id} className="pl-2">
                        <MemoRunRow task={t} />
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-muted-foreground italic">
              {isCompleted
                ? `${tasks.length} task${tasks.length === 1 ? '' : 's'} complete — expand to review.`
                : `${totalDone}/${tasks.length} done — expand to follow live.`}
            </div>
          )}

          {error && (
            <div className="mt-3 text-xs text-rose-500 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" /> {error}
            </div>
          )}
        </div>
        {/* memoText was rendered here as raw markdown — removed. The chat
            bubble (master role) carries the rendered memo, so showing it
            again here just duplicated content. */}
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
      : task.status === 'skipped'
      // SkipForward-ish glyph rendered with a dash inside a circle so we
      // don't import another icon — distinct from done's checkmark and
      // pending's empty circle.
      ? <span
          className="w-3 h-3 rounded-full border border-muted-foreground/60 text-muted-foreground flex items-center justify-center text-[8px] leading-none"
          title="Skipped"
        >–</span>
      : <span className="w-3 h-3 rounded-full border border-muted-foreground/40 inline-block" />;
  // Only show the agent's "thinking out loud" excerpt while the task is
  // actively running. It's cleared on task_done / task_start (next row).
  const showSay = task.status === 'in-progress' && !!task.latestSay;
  const isSkipped = task.status === 'skipped';
  // The agent's live tool calls — surfaced under the row while in-progress
  // so the PM sees "the agent is running WebSearch right now," not just
  // a spinner. Drops away cleanly when the task completes.
  const showTools = task.status === 'in-progress' && (task.recentTools?.length ?? 0) > 0;
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            'font-medium truncate',
            isSkipped && 'text-muted-foreground line-through decoration-muted-foreground/40',
          )}>
            {task.title}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">{task.skill}</span>
          {isSkipped && (
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold px-1 py-0.5 rounded bg-muted">
              skipped
            </span>
          )}
          {task.elapsed != null && !isSkipped && (
            <span className="text-[10px] text-muted-foreground tabular-nums">{task.elapsed.toFixed(1)}s</span>
          )}
        </div>
        {showSay && (
          <div className="mt-1 text-[11px] text-muted-foreground italic leading-snug border-l-2 border-primary/40 pl-2 line-clamp-3">
            {task.latestSay}
          </div>
        )}
        {showTools && (
          <ul className="mt-1 space-y-0.5">
            {task.recentTools!.map((tc, i) => (
              <li
                key={`${tc.ts}-${i}`}
                className="text-[10px] text-muted-foreground flex items-start gap-1.5 leading-snug"
                title={tc.preview}
              >
                <Wrench className="w-2.5 h-2.5 text-primary/70 mt-[3px] shrink-0" />
                <span className="font-mono truncate">{tc.preview}</span>
              </li>
            ))}
          </ul>
        )}
        {isSkipped && task.skippedReason && (
          <div className="mt-0.5 text-[11px] text-muted-foreground italic leading-snug">
            {task.skippedReason}
          </div>
        )}
        {task.error && (
          <div className="text-[11px] text-rose-500 mt-0.5 break-words">{task.error}</div>
        )}
      </div>
    </li>
  );
}

/** Render markdown for the analyst/master side of a chat bubble.
 *
 *  Delegates to ``CitedMarkdown`` so any ``[N]`` references the analyst
 *  emits get hover tooltips linking to the Sources section. PM-side
 *  messages stay as plain text since the user types prose and the
 *  bubble's primary-foreground colour doesn't play nicely with prose
 *  styles.
 *
 *  Wrapped in try/catch because mid-stream input may be unbalanced
 *  markdown (open code fence, half a table row) — on failure we fall
 *  back to a plain-text render so the bubble still says *something*. */
function MarkdownBubbleBody({ text }: { text: string }) {
  try {
    return <CitedMarkdown content={text} />;
  } catch {
    return <div className="whitespace-pre-line">{text}</div>;
  }
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
          {isPM ? (
            <div className="whitespace-pre-line">{msg.text}</div>
          ) : (
            <MarkdownBubbleBody text={msg.text} />
          )}
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
            <div className="relative">
              <MarkdownBubbleBody text={text} />
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
