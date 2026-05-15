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
  // Pack-aware fields — populated when the analyst was hired from a
  // persona pack. Generic hand-rolled analysts have empty `skills`,
  // null `default_template`, and null `pack`.
  skills?: string[];
  default_template?: string | null;
  pack?: string | null;
  /** Live-derived: number of in-progress + pending engagement tasks
   *  filed under this analyst. Server-computed at list time. */
  active_task_count?: number;
};

export type ApiAnalystList = { count: number; analysts: ApiAnalyst[] };

export function getAnalysts(): Promise<ApiAnalystList> {
  return getJson<ApiAnalystList>('/api/analysts');
}

export function createAnalyst(body: {
  name: string;
  /** Optional — a generalist analyst can be hired with no sector. */
  sector?: string | null;
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

/** Hire the singleton Data Engineer role. Idempotent — if the DE is
 *  already on the roster, the existing record is returned. */
export function hireDataEngineer(): Promise<ApiAnalyst> {
  return getJson<ApiAnalyst>('/api/analysts/data-engineer', {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
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

// --- Workflows (planner templates) ---------------------------------------

export type ApiWorkflow = {
  /** Planner template slug — e.g. ``buffett-pitch``. */
  name: string;
  task_count: number;
  phases: ('setup' | 'ingest' | 'analyze' | 'compose' | 'maintain')[];
  /** Ordered, deduplicated list of skill slugs the template invokes. */
  skills: string[];
  /** Engagement-relative path of the compose-phase deliverable. */
  final_output: string | null;
  /** Pack that owns this workflow (e.g. ``buffett``) or null for the
   *  generic templates (``pitch-memo``, ``earnings-reaction``, ...). */
  pack_id: string | null;
  pack_name: string | null;
  /** Display name from the pack manifest, falls back to ``name``. */
  display_name: string;
  /** Pack-provided description; null for unowned generic templates. */
  description: string | null;
};

export function getWorkflows(): Promise<{ workflows: ApiWorkflow[] }> {
  return getJson<{ workflows: ApiWorkflow[] }>('/api/templates/detail');
}

// --- Skills (library) ----------------------------------------------------

export type ApiSkill = {
  slug: string;
  name: string;
  phase: 'setup' | 'ingest' | 'analyze' | 'compose' | 'maintain';
  runner: 'deterministic' | 'agent';
  description: string;
  allowed_tools: string[];
  needs: string[];
  output: string | null;
  model: string | null;
  max_turns: number;
  /** Analyst slugs whose `skills` list includes this skill. */
  used_by: string[];
  /** Pack ids that ship this skill in their toolkit. */
  in_packs: string[];
};

export function getSkills(): Promise<ApiSkill[]> {
  return getJson<ApiSkill[]>('/api/skills');
}

export type ApiSkillDetail = ApiSkill & {
  /** Full SKILL.md body after the frontmatter — rendered as markdown
   *  in the detail modal. */
  body: string;
  /** Filenames under ``skills/<slug>/references/``. */
  references: string[];
  /** Absolute path to ``skills/<slug>/`` for "open on disk" hints. */
  path: string;
};

export function getSkill(slug: string): Promise<ApiSkillDetail> {
  return getJson<ApiSkillDetail>(`/api/skills/${encodeURIComponent(slug)}`);
}

export type SuggestedPack = {
  name: string;
  title?: string;
  sector_hint?: string;
  voice?: string;
  avatar_color?: string;
};

/** Author a SKILL.md by distilling a famous investor from their Wikipedia
 *  page. Does NOT write to disk — returns the proposed content for review.
 *  Also returns a ``suggested_pack`` the frontend can pass through to
 *  ``uploadSkill`` so the saved skill comes with a hireable pack manifest. */
export function distillSkill(body: {
  name: string;
  slug: string;
}): Promise<{
  slug: string;
  name: string;
  wiki_chars: number;
  skill_md: string;
  suggested_pack: SuggestedPack;
}> {
  return getJson('/api/skills/distill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

export type DistillStreamHandlers = {
  onWikiStart?: (data: { name: string }) => void;
  onWikiDone?: (data: { chars: number }) => void;
  onAuthorStart?: (data: { model: string }) => void;
  /** Streaming chunk of the authored SKILL.md as the model writes it. */
  onSay?: (data: { delta: string; total_chars: number }) => void;
  onAuthorDone?: (data: { chars: number }) => void;
  onDone?: (data: {
    slug: string;
    name: string;
    wiki_chars: number;
    skill_md: string;
    suggested_pack: SuggestedPack;
  }) => void;
  onError?: (err: Error) => void;
};

/** Streaming variant — emits per-stage progress so the UI can show what's
 *  happening through the 30–60s SDK call. Returns an abort fn. */
export function streamDistillSkill(
  body: { name: string; slug: string },
  handlers: DistillStreamHandlers,
): () => void {
  const ctrl = new AbortController();
  (async () => {
    try {
      const res = await fetch('/api/skills/distill/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
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
            case 'wiki_start':   handlers.onWikiStart?.(d as never);   break;
            case 'wiki_done':    handlers.onWikiDone?.(d as never);    break;
            case 'author_start': handlers.onAuthorStart?.(d as never); break;
            case 'say':          handlers.onSay?.(d as never);         break;
            case 'author_done':  handlers.onAuthorDone?.(d as never);  break;
            case 'done':         handlers.onDone?.(d as never);        break;
            case 'error':
              handlers.onError?.(new Error((d.error as string) ?? 'distill error'));
              break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      handlers.onError?.(err as Error);
    }
  })();
  return () => ctrl.abort();
}

/** Upload a SKILL.md (plus optional references/) into ``skills/<slug>/``.
 *  Slug must match ``[a-z][a-z0-9-]{1,63}``. The backend writes the file
 *  as-is and validates by re-loading; bad frontmatter rolls the upload
 *  back. References are name+content pairs that land under
 *  ``skills/<slug>/references/``. */
export function uploadSkill(body: {
  slug: string;
  content: string;
  references?: { name: string; content: string }[];
  overwrite?: boolean;
  /** When provided, the backend also writes ``packs/<slug>.json`` and
   *  registers a ``<slug>-pitch`` planner template so the skill is
   *  immediately hireable. The distill flow always sends this. */
  pack?: SuggestedPack;
}): Promise<ApiSkill & { skipped_references?: string[]; pack_created?: string | null }> {
  return getJson('/api/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

// --- Data inventory (Library → Data tab) ----------------------------------

export type ApiDataCategory =
  | 'filings'
  | 'snapshots'
  | 'transcripts'
  | 'news'
  | 'ownership'
  | 'earnings'
  | 'research';

export type ApiDataInventoryRow = {
  category: ApiDataCategory;
  count: number;
  tickers: string[];
  last_updated: string | null;
};

export type ApiDataItem = {
  category: ApiDataCategory;
  ticker: string;
  analyst: string;
  path: string;
  type: string;
  date: string;
  size: string;
  modified_at: number;
};

export function getDataInventory(): Promise<{
  inventory: ApiDataInventoryRow[];
  items: ApiDataItem[];
}> {
  return getJson('/api/data');
}

// --- Packs (persona bundles) ---------------------------------------------

export type ApiPackWorkflow = {
  command: string;        // planner template slug, e.g. "buffett-pitch"
  name: string;           // chip label
  description: string;    // tooltip / explainer
};

export type ApiPack = {
  id: string;
  name: string;
  title: string;
  sector_hint: string;
  voice: string;
  skills: string[];
  default_template: string | null;
  workflows: ApiPackWorkflow[];
  avatar_color: string | null;
};

export function getPacks(): Promise<{ packs: ApiPack[] }> {
  return getJson<{ packs: ApiPack[] }>('/api/packs');
}

export function getPack(packId: string): Promise<ApiPack> {
  return getJson<ApiPack>(`/api/packs/${encodeURIComponent(packId)}`);
}

/** Hire an analyst pre-filled from a persona pack. */
export function createAnalystFromPack(body: {
  pack_id: string;
  name?: string;
  title?: string;
  sector?: string;
  persona?: string;
  coverage?: string[];
}): Promise<ApiAnalyst> {
  return getJson<ApiAnalyst>('/api/analysts/from-pack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
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
  /** True for files under ``memos/`` — the engagement's headline output.
   *  The right-rail Files view stacks these at the top. */
  is_output?: boolean;
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

/** Route a free-form chat message to a workflow + ticker, or to plain chat.
 *
 *  Called from the chat composer at Send time, only when no chip is
 *  selected. Two Haiku calls behind the scenes (workflow + ticker) — if
 *  the message doesn't fit a workflow, returns ``workflow: null`` and
 *  the UI continues to the regular chat path. */
export function suggestWorkflow(
  ownerKey: string,
  body: {
    message: string;
    workflows: { command: string; name: string; description?: string }[];
  },
): Promise<{
  workflow: string | null;
  workflow_name: string | null;
  workflow_description: string | null;
  ticker: string | null;
}> {
  return jpost(`/api/chats/${encodeURIComponent(ownerKey)}/suggest-workflow`, body);
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
  /** Agent thinking-out-loud — assistant text emitted by the SDK loop
   *  *during* a task. ``task_id`` is auto-attached by the dispatcher so
   *  the UI can show the latest say under the right task row. */
  onSay?: (data: { task_id?: string; message: string; elapsed?: number }) => void;
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
            case 'say':               handlers.onSay?.(d as never);              break;
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

// --- Dashboard aggregations -----------------------------------------------

export type ApiDashboardTask = {
  /** Composite key for React lists: ``<analyst>/<ticker>/<task_id>``. */
  id: string;
  task_id: string;
  title: string;
  skill: string;
  stage: string;
  status: 'in-progress' | 'pending';
  analyst: string;
  ticker: string;
  started_at: string;
  elapsed_sec: number;
};

export function getDashboardActiveTasks(
  limit = 20,
): Promise<{ count: number; tasks: ApiDashboardTask[] }> {
  return getJson(`/api/dashboard/active-tasks?limit=${limit}`);
}

export type ApiDashboardMemo = {
  /** Composite key for React lists: ``<analyst>/<ticker>/<rel_path>``. */
  id: string;
  title: string;
  excerpt: string;
  analyst: string;
  ticker: string;
  type: string;
  path: string;
  date: string;
  citation_count: number;
  modified_at: number;
};

export function getDashboardRecentMemos(
  limit = 10,
): Promise<{ count: number; memos: ApiDashboardMemo[] }> {
  return getJson(`/api/dashboard/recent-memos?limit=${limit}`);
}

// --- Data-source specs (Data Engineer chat output) ------------------------

export type ApiSavedSpec = {
  slug: string;
  path: string;
  bytes: number;
};

/** Persist a Data-Engineer-produced spec to ``specs/data/<slug>.md``. */
export function saveDataSpec(req: {
  slug: string;
  content: string;
}): Promise<ApiSavedSpec> {
  return jpost<ApiSavedSpec>('/api/specs/data', req);
}

/** List every saved data-source spec, newest first. */
export function listDataSpecs(): Promise<{
  count: number;
  specs: (ApiSavedSpec & { modified_at: number })[];
}> {
  return getJson('/api/specs/data');
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
