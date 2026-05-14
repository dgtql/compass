/**
 * Thin fetch wrappers for the Compass FastAPI backend.
 *
 * Endpoints are documented in `compass/api.py`. In dev, Vite's `/api/*`
 * proxy forwards to http://127.0.0.1:8001 (the default `compass serve`
 * port); in production, FastAPI serves the SPA from the same origin so
 * relative paths work in both modes.
 */

export type ApiTicker = {
  cik: number;
  ticker: string;
  name: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
  cap_bucket: string | null;   // 'blue-chip' | 'large' | 'mid' | 'small' | 'micro' | null
};

export type ApiUniverse = {
  as_of: string;
  region: string;
  source: string;
  total: number;     // size of the entire universe
  matched: number;   // matches after filtering (before pagination)
  count: number;     // page size returned
  offset: number;
  tickers: ApiTicker[];
};

export type ApiRegion = { id: string; label: string; active: boolean };
export type ApiCapBucket = { id: string; label: string };

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { Accept: 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} on ${path}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export function getUniverse(params: {
  region?: string;
  sector?: string;
  exchange?: string;
  cap_bucket?: string;
  query?: string;
  offset?: number;
  limit?: number;
} = {}): Promise<ApiUniverse> {
  const search = new URLSearchParams();
  if (params.region)     search.set('region', params.region);
  if (params.sector)     search.set('sector', params.sector);
  if (params.exchange)   search.set('exchange', params.exchange);
  if (params.cap_bucket) search.set('cap_bucket', params.cap_bucket);
  if (params.query)      search.set('query', params.query);
  search.set('offset', String(params.offset ?? 0));
  search.set('limit',  String(params.limit ?? 500));
  return getJson<ApiUniverse>(`/api/universe?${search.toString()}`);
}

export function getSectors(): Promise<string[]> {
  return getJson<string[]>('/api/universe/sectors');
}

export function getExchanges(): Promise<string[]> {
  return getJson<string[]>('/api/universe/exchanges');
}

export function getRegions(): Promise<ApiRegion[]> {
  return getJson<ApiRegion[]>('/api/universe/regions');
}

export function getCapBuckets(): Promise<ApiCapBucket[]> {
  return getJson<ApiCapBucket[]>('/api/universe/cap-buckets');
}

/** Full bucket-id → label map (equity + non-equity). Used to render the
 *  Cap column of the universe table for tickers in non-equity buckets
 *  (ETFs, preferred, warrants/units, other). */
export function getCapBucketLabels(): Promise<Record<string, string>> {
  return getJson<Record<string, string>>('/api/universe/cap-bucket-labels');
}

// --- My universe (PM's personal watchlist) --------------------------------

export type ApiWatchlistEntry = {
  ticker: string;
  added_at: string;
  note: string | null;
  // Hydrated from the universe (may be null if the ticker isn't in the seed)
  name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  cap_bucket: string | null;
  cik: number | null;
};

export type ApiWatchlist = {
  as_of: string;
  count: number;
  tickers: ApiWatchlistEntry[];
};

export function getMyUniverse(): Promise<ApiWatchlist> {
  return getJson<ApiWatchlist>('/api/my-universe');
}

export function addToMyUniverse(ticker: string, note?: string): Promise<{ ticker: string; count: number }> {
  return getJson('/api/my-universe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ticker, note: note ?? null }),
  });
}

export function removeFromMyUniverse(ticker: string): Promise<{ ticker: string; count: number }> {
  return getJson(`/api/my-universe/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
}

// --- Analysts (hired roster) ----------------------------------------------

export type ApiAnalystStats = {
  memos: number;
  tasks_done: number;
  active_tasks: number;
};

export type ApiAnalyst = {
  id: string;
  slug: string;
  name: string;
  title: string;
  sector: string;
  coverage: string[];
  persona: string;
  avatar_color: string;
  avatar_initials: string;
  status: 'idle' | 'working' | 'review' | 'offline';
  hired_at: string;
  stats: ApiAnalystStats;
  current_focus: string | null;
};

export type ApiAnalystList = { count: number; analysts: ApiAnalyst[] };

export function getAnalysts(): Promise<ApiAnalystList> {
  return getJson<ApiAnalystList>('/api/analysts');
}

export function createAnalyst(body: {
  name: string;
  sector: string;
  coverage?: string[];
  persona?: string;
  title?: string;
}): Promise<ApiAnalyst> {
  return getJson<ApiAnalyst>('/api/analysts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteAnalyst(slug: string): Promise<{ slug: string }> {
  return getJson(`/api/analysts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
}

export function updateAnalystCoverage(slug: string, coverage: string[]): Promise<ApiAnalyst> {
  return getJson<ApiAnalyst>(`/api/analysts/${encodeURIComponent(slug)}/coverage`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ coverage }),
  });
}

export function updateAnalyst(
  slug: string,
  patch: Partial<{
    name: string;
    title: string;
    sector: string;
    persona: string;
    coverage: string[];
  }>,
): Promise<ApiAnalyst> {
  return getJson<ApiAnalyst>(`/api/analysts/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  });
}

/** Bulk-fetch matching universe rows for a list of ticker symbols. */
export function lookupTickers(tickers: string[]): Promise<{ count: number; tickers: ApiTicker[] }> {
  return getJson('/api/universe/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ tickers }),
  });
}

// --- Chats (per-owner tasks + sessions + messages) ------------------------

export type ApiChatMessage = {
  id: string;
  role: 'pm' | 'master';
  text: string;
  ts: string;
};

export type ApiChatSession = {
  id: string;
  ownerKey: string;
  taskId: string;
  title: string;
  lastMessageAt: string;
  preview: string;
  messages: ApiChatMessage[];
};

export type ApiChatTask = {
  id: string;
  ownerKey: string;
  title: string;
  status: 'active' | 'paused' | 'done';
  createdAt: string;
  updatedAt: string;
  coverageTicker: string | null;
};

export type ApiChatsForOwner = {
  owner_key: string;
  tasks: ApiChatTask[];
  sessions: ApiChatSession[];
};

const jpost = <T>(path: string, body: unknown): Promise<T> =>
  getJson<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });

const jpatch = <T>(path: string, body: unknown): Promise<T> =>
  getJson<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });

const jdelete = <T>(path: string): Promise<T> =>
  getJson<T>(path, { method: 'DELETE' });

export function getChats(ownerKey: string): Promise<ApiChatsForOwner> {
  return getJson<ApiChatsForOwner>(`/api/chats/${encodeURIComponent(ownerKey)}`);
}

export function createChatTask(
  ownerKey: string,
  body: { title: string; coverage_ticker?: string },
): Promise<ApiChatTask> {
  return jpost<ApiChatTask>(`/api/chats/${encodeURIComponent(ownerKey)}/tasks`, body);
}

export function updateChatTask(
  ownerKey: string,
  taskId: string,
  patch: Partial<{ title: string; status: 'active' | 'paused' | 'done'; coverage_ticker: string }>,
): Promise<ApiChatTask> {
  return jpatch<ApiChatTask>(
    `/api/chats/${encodeURIComponent(ownerKey)}/tasks/${encodeURIComponent(taskId)}`,
    patch,
  );
}

/** Ask the backend to infer a 3–7-word task title from chip + first
 *  message and PATCH the task. Returns the updated task; on backend
 *  failure (LLM unreachable, etc.) the title is left unchanged. */
export function suggestChatTaskTitle(
  ownerKey: string,
  taskId: string,
  body: { chip?: string | null; message: string },
): Promise<ApiChatTask> {
  return jpost<ApiChatTask>(
    `/api/chats/${encodeURIComponent(ownerKey)}/tasks/${encodeURIComponent(taskId)}/suggest-title`,
    body,
  );
}

export function deleteChatTask(ownerKey: string, taskId: string): Promise<{ task_count: number }> {
  return jdelete(`/api/chats/${encodeURIComponent(ownerKey)}/tasks/${encodeURIComponent(taskId)}`);
}

export function createChatSession(
  ownerKey: string,
  body: { task_id: string; title?: string },
): Promise<ApiChatSession> {
  return jpost<ApiChatSession>(`/api/chats/${encodeURIComponent(ownerKey)}/sessions`, body);
}

export function deleteChatSession(ownerKey: string, sessionId: string): Promise<unknown> {
  return jdelete(
    `/api/chats/${encodeURIComponent(ownerKey)}/sessions/${encodeURIComponent(sessionId)}`,
  );
}

/** Append a PM message — server returns the session with the user + LLM
 *  reply appended. ``model`` and ``thinking`` are passed through to the
 *  backend so the UI's selectors actually shape the call. */
export function postChatMessage(
  ownerKey: string,
  sessionId: string,
  body: {
    role?: 'pm' | 'master';
    text: string;
    model?: string;
    thinking?: 'standard' | 'extended';
  },
): Promise<ApiChatSession> {
  return jpost<ApiChatSession>(
    `/api/chats/${encodeURIComponent(ownerKey)}/sessions/${encodeURIComponent(sessionId)}/messages`,
    body,
  );
}

export type ChatStreamHandlers = {
  onUserMessage?: (msg: ApiChatMessage) => void;
  onDelta?: (text: string) => void;
  onDone?: (session: ApiChatSession) => void;
  onError?: (err: Error) => void;
};

/** Streaming variant — POSTs to /messages/stream, parses SSE events,
 *  and dispatches them to handlers. Returns a function the caller can
 *  invoke to abort the stream mid-flight (e.g. on navigation). */
export function streamChatMessage(
  ownerKey: string,
  sessionId: string,
  body: {
    role?: 'pm' | 'master';
    text: string;
    model?: string;
    thinking?: 'standard' | 'extended';
  },
  handlers: ChatStreamHandlers,
): () => void {
  const ctrl = new AbortController();
  (async () => {
    try {
      const res = await fetch(
        `/api/chats/${encodeURIComponent(ownerKey)}/sessions/${encodeURIComponent(sessionId)}/messages/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        },
      );
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Process complete SSE events (delimited by \n\n).
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const ev = _parseSse(raw);
          if (!ev) continue;
          if (ev.event === 'user_message' && handlers.onUserMessage) {
            handlers.onUserMessage(ev.data as ApiChatMessage);
          } else if (ev.event === 'delta' && handlers.onDelta) {
            handlers.onDelta((ev.data as { text: string }).text ?? '');
          } else if (ev.event === 'done' && handlers.onDone) {
            handlers.onDone((ev.data as { session: ApiChatSession }).session);
          } else if (ev.event === 'error' && handlers.onError) {
            handlers.onError(new Error((ev.data as { error: string }).error ?? 'error'));
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();
  return () => ctrl.abort();
}

// --- Per-analyst aggregates (deliverables + tasks across engagements) -----

export type ApiAnalystDeliverable = {
  ticker: string;
  path: string;
  name: string;
  category: string;
  size: number;
  modified_at: number;
};

export function getAnalystDeliverables(slug: string): Promise<{
  slug: string;
  count: number;
  deliverables: ApiAnalystDeliverable[];
}> {
  return getJson(`/api/analysts/${encodeURIComponent(slug)}/deliverables`);
}

/** Per-analyst aggregate: every task across every engagement filed under
 *  this analyst, with ``ticker`` carried per row. */
export type ApiAnalystTaskRow = ApiEngagementTask & { ticker: string };

export function getAnalystTasksAll(slug: string): Promise<{
  slug: string;
  count: number;
  tasks: ApiAnalystTaskRow[];
}> {
  return getJson(`/api/analysts/${encodeURIComponent(slug)}/tasks`);
}

/** Intermediate research files for one engagement (not memos — those are
 *  in the analyst-aggregated /deliverables endpoint). */
export type ApiEngagementFile = {
  path: string;
  name: string;
  category: string;
  size: number;
  modified_at: number;
};

export function getEngagementFiles(analyst: string, ticker: string): Promise<{
  analyst: string;
  ticker: string;
  count: number;
  files: ApiEngagementFile[];
}> {
  return getJson(
    `/api/engagements/${encodeURIComponent(analyst)}/${encodeURIComponent(ticker)}/files`,
  );
}

/** Fetch one artifact file's contents (used by the deliverables viewer). */
export function getEngagementArtifact(
  analyst: string,
  ticker: string,
  path: string,
): Promise<{ path: string; size: number; modified_at: number; content: string }> {
  const qs = new URLSearchParams({ path });
  return getJson(
    `/api/engagements/${encodeURIComponent(analyst)}/${encodeURIComponent(ticker)}/artifact?${qs.toString()}`,
  );
}

// --- Engagement tasks (live tracker — see doc 16) -------------------------

export type ApiEngagementTask = {
  id: string;
  stage: string;
  title: string;
  skill: string;
  status: 'pending' | 'in-progress' | 'done' | 'review' | 'error' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  task_type: string;
  description: string | null;
  params: Record<string, unknown>;
  artifact_path: string | null;
  depends_on: string[];
  next_action_prompt: string | null;
  requires_human_approval: boolean;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
};

export type ApiEngagementTasks = {
  analyst: string;
  ticker: string;
  task_count: number;
  tasks: ApiEngagementTask[];
};

export function getEngagementTasks(analyst: string, ticker: string): Promise<ApiEngagementTasks> {
  return getJson<ApiEngagementTasks>(
    `/api/engagements/${encodeURIComponent(analyst)}/${encodeURIComponent(ticker)}/tasks`,
  );
}

export function setEngagementTaskStatus(
  analyst: string,
  ticker: string,
  taskId: string,
  status: ApiEngagementTask['status'],
): Promise<ApiEngagementTask> {
  return jpost<ApiEngagementTask>(
    `/api/engagements/${encodeURIComponent(analyst)}/${encodeURIComponent(ticker)}/tasks/${encodeURIComponent(taskId)}/status`,
    { status },
  );
}

export type EngagementEventHandlers = {
  onHello?: (data: { ticker: string; analyst: string }) => void;
  onTasksUpdated?: (data: { ticker: string; analyst: string; task_count: number }) => void;
  /** Per-event firehose from the dispatcher (`task_start`, `task_done`,
   *  `task_error`, `task_blocked`, `skill_start`, `skill_done`, `tool`, `say`, …). */
  onTaskEvent?: (event: Record<string, unknown>) => void;
  onPing?: (data: { ts: string }) => void;
  onError?: (err: Error) => void;
};

/** Subscribe to live engagement events. Returns an abort fn — call it on
 *  unmount to close the SSE connection cleanly. */
export function subscribeEngagementEvents(
  analyst: string,
  ticker: string,
  handlers: EngagementEventHandlers,
): () => void {
  const ctrl = new AbortController();
  (async () => {
    try {
      const res = await fetch(
        `/api/engagements/${encodeURIComponent(analyst)}/${encodeURIComponent(ticker)}/events/stream`,
        {
          method: 'GET',
          headers: { Accept: 'text/event-stream' },
          signal: ctrl.signal,
        },
      );
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const ev = _parseSse(raw);
          if (!ev) continue;
          const d = ev.data as Record<string, unknown>;
          switch (ev.event) {
            case 'hello':          handlers.onHello?.(d as never);         break;
            case 'tasks-updated':  handlers.onTasksUpdated?.(d as never);  break;
            case 'task-event':     handlers.onTaskEvent?.(d);              break;
            case 'ping':           handlers.onPing?.(d as never);          break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();
  return () => ctrl.abort();
}

// --- chat-driven memo (skill-based plan + execute) -----------------------

export type ApiMemoCandidate = {
  ticker: string;
  name: string | null;
  sector: string | null;
};

export function getMemoCandidates(ownerKey: string): Promise<{
  owner_key: string;
  count: number;
  candidates: ApiMemoCandidate[];
}> {
  return getJson(`/api/chats/${encodeURIComponent(ownerKey)}/memo/candidates`);
}

export function suggestMemoTicker(
  ownerKey: string,
  body: { message: string; candidates?: ApiMemoCandidate[] | null },
): Promise<{ ticker: string | null; candidate_count: number }> {
  return jpost(
    `/api/chats/${encodeURIComponent(ownerKey)}/memo/suggest-ticker`,
    body,
  );
}

export type ApiMemoPlanTask = {
  id: string;
  stage: string;
  title: string;
  skill: string;
  status: string;
  depends_on: string[];
};

export type MemoStreamHandlers = {
  onEngagementOpened?: (data: { analyst: string; ticker: string; template: string; root: string }) => void;
  onPlanDone?: (data: { task_count: number; tasks: ApiMemoPlanTask[] }) => void;
  onTaskStart?: (data: { task_id: string; skill: string }) => void;
  onTaskDone?: (data: { task_id: string; skill: string; elapsed: number; result: unknown }) => void;
  onTaskError?: (data: { task_id: string; skill: string; error: string }) => void;
  onTaskBlocked?: (data: { task_id: string; blocked_by: string[] }) => void;
  onMemoReady?: (data: { memo_path: string | null; memo_text: string | null }) => void;
  onDone?: (data: { summary: Record<string, unknown>; session: ApiChatSession | null }) => void;
  onError?: (err: Error) => void;
};

/** SSE-consuming runner for the skill-based memo flow. Returns an abort fn. */
export function streamMemoRun(
  ownerKey: string,
  sessionId: string,
  body: { ticker: string; template?: string; message?: string },
  handlers: MemoStreamHandlers,
): () => void {
  const ctrl = new AbortController();
  (async () => {
    try {
      const res = await fetch(
        `/api/chats/${encodeURIComponent(ownerKey)}/sessions/${encodeURIComponent(sessionId)}/memo/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        },
      );
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const ev = _parseSse(raw);
          if (!ev) continue;
          const d = ev.data as Record<string, unknown>;
          switch (ev.event) {
            case 'engagement_opened': handlers.onEngagementOpened?.(d as never); break;
            case 'plan_done':         handlers.onPlanDone?.(d as never);         break;
            case 'task_start':        handlers.onTaskStart?.(d as never);        break;
            case 'task_done':         handlers.onTaskDone?.(d as never);         break;
            case 'task_error':        handlers.onTaskError?.(d as never);        break;
            case 'task_blocked':      handlers.onTaskBlocked?.(d as never);      break;
            case 'memo_ready':        handlers.onMemoReady?.(d as never);        break;
            case 'done':              handlers.onDone?.(d as never);             break;
            case 'error':             handlers.onError?.(new Error((d.error as string) ?? 'memo run error')); break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();
  return () => ctrl.abort();
}

function _parseSse(raw: string): { event: string; data: unknown } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}
