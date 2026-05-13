/**
 * Domain types for the analyst-centric UI (slice 11+).
 *
 * These are currently consumed from mock data in `mocks/data.ts`; the
 * backend equivalents land when the data model is wired in slice 12+.
 */

export type AnalystStatus = 'idle' | 'working' | 'review' | 'offline';

export type Analyst = {
  id: string;
  slug: string;
  name: string;
  /** Short title — e.g. "Senior Analyst · TMT" */
  title: string;
  sector: string;
  coverage: string[]; // tickers
  avatarColor: string; // tailwind color class fragment, e.g. "cyan" "violet"
  avatarInitials: string;
  status: AnalystStatus;
  /** Free-form persona / writing style description shown on the profile */
  persona: string;
  hiredAt: string; // ISO date
  stats: {
    memos: number;
    tasksDone: number;
    activeTasks: number;
  };
  /** One-liner about the analyst's current working state */
  currentFocus: string | null;
};

export type TickerInfo = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  exchange: string;
  /** Latest price snapshot — purely cosmetic for the universe view */
  price: number;
  /** Day change as a number (e.g. 1.4 for +1.4%) */
  dayChangePct: number;
  marketCapB: number; // billions
  /** Analyst slugs covering this name */
  coveredBy: string[];
};

export type AnalystMemo = {
  id: string;
  analystSlug: string;
  ticker: string;
  type: 'pitch' | 'earnings-reaction' | 'maintenance' | 'deep-dive' | 'morning-note';
  title: string;
  date: string; // YYYY-MM-DD
  excerpt: string;
  citationCount: number;
};

export type AnalystTask = {
  id: string;
  analystSlug: string;
  type: AnalystMemo['type'] | 'fetch_filing' | 'snapshot';
  ticker: string | null;
  status: 'queued' | 'running' | 'done' | 'error';
  description: string;
  createdAt: string;
  durationSec: number | null;
};

export type KnowledgeNote = {
  id: string;
  title: string;
  body: string; // markdown
  tags: string[]; // tickers and concepts
  createdAt: string;
  /** Source: a memo, a chat with the master agent, or a manual PM note */
  source: 'memo' | 'chat' | 'manual';
  /** Number of other notes this links to (for the graph view in a later slice) */
  linkCount: number;
};

export type RichTodo = {
  id?: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
};

export type AskQuestion = {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: { label: string; description?: string }[];
};

/** Used by AskUserQuestionPanel + recorded back to the conversation when answered. */
export type AskAnswers = Record<string, string>;

export type MasterAgentMessage = {
  id: string;
  role: 'pm' | 'master';
  text: string;
  ts: string;
  /**
   * Optional rich content rendered inline with the message bubble. The
   * spec from `09/10-…` reference docs has several of these; we adopt
   * the ones that fit the PM/analyst chat shape.
   */
  todos?: RichTodo[];
  ask?: { requestId: string; questions: AskQuestion[] };
  answers?: AskAnswers; // when the PM has responded to an ask
};

export type AnalystSubtask = {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'done' | 'review' | 'deferred' | 'cancelled';
  whyNext?: string;
  nextActionPrompt?: string;
};

// ---------------------------------------------------------------------------
// Pipeline pattern (slice 16) — per-ticker research engagement with stages
// ---------------------------------------------------------------------------

export type StageId = 'setup' | 'ingest' | 'analyze' | 'compose' | 'maintain';

export type CoverageBriefKPI = {
  name: string;
  target: string;
  current: string;
  trend: 'up' | 'down' | 'flat';
};

export type CoverageBriefRisk = {
  rank: number;
  risk: string;
  severity: 'high' | 'medium' | 'low';
};

export type CoverageBriefCatalyst = {
  date: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
};

/** The analyst's structured thesis on a covered name. */
export type CoverageBrief = {
  ticker: string;
  thesisOneLiner: string;
  thesisBody: string;
  keyQuestions: string[];
  kpis: CoverageBriefKPI[];
  risks: CoverageBriefRisk[];
  catalysts: CoverageBriefCatalyst[];
  startStage: StageId;
  mode: 'idea' | 'plan';
  updatedAt: string;
};

export type PipelineTaskStatus =
  | 'pending'
  | 'in-progress'
  | 'done'
  | 'review'
  | 'deferred'
  | 'cancelled';

export type PipelineTask = {
  id: string;
  stage: StageId;
  title: string;
  description?: string;
  status: PipelineTaskStatus;
  priority: 'high' | 'medium' | 'low';
  taskType: string; // e.g. exploration, implementation, analysis, writing, review
  suggestedSkills: string[]; // skill slugs
  inputsNeeded?: string[]; // dot-paths into coverage_brief.json
  /** When the task completes, this artifact is expected to exist. */
  artifactPath?: string;
  /** The complete instruction the PM clicks "Use in chat" with. */
  nextActionPrompt?: string;
  dependencies: string[];
  requiresHumanApproval?: boolean;
};

export type ArtifactType =
  | 'filing'
  | 'snapshot'
  | 'transcript'
  | 'news'
  | 'memo'
  | 'analysis'
  | 'brief'
  | 'review';

export type Artifact = {
  /** Path relative to the engagement root. */
  path: string;
  stage: StageId;
  type: ArtifactType;
  /** Display name shown in the tree. */
  name: string;
  /** Which task produced this. */
  taskId?: string;
  size: string;
  updatedAt: string;
};

/** A per-ticker engagement combining brief + tasks + artifacts. */
export type TickerCoverage = {
  ticker: string;
  analystSlug: string;
  brief: CoverageBrief;
  tasks: PipelineTask[];
  artifacts: Artifact[];
};

export type ChatTaskStatus = 'active' | 'paused' | 'done';

/** A logical bucket of work the PM has assigned to an analyst (or to the master agent).
 *  Tasks group multiple chat sessions and are mutually independent — pausing one
 *  doesn't affect any other. Slice 16's pipeline tasks eventually map onto these;
 *  for now ChatTask is a sidebar-only grouping in the chat UI. */
export type ChatTask = {
  id: string;
  /** 'maria-chen' | 'david-park' | … | 'master' */
  ownerKey: string;
  title: string;
  status: ChatTaskStatus;
  createdAt: string;
  updatedAt: string;
  /**
   * Optional ticker this chat task is tied to. When set, the right-rail
   * Progress view renders the pipeline tasks from the matching coverage
   * (see `mockCoverages` in `mocks/pipeline.ts`); otherwise the rail
   * shows an empty state inviting the PM to tie it.
   */
  coverageTicker?: string;
};

export type ChatSession = {
  id: string;
  /** Owner: analyst slug, or 'master' for the master agent's threads. */
  ownerKey: string;
  /** Slice 17: every session lives under a task. */
  taskId: string;
  title: string;
  /** ISO date of the last message — drives the sort + "x minutes ago" rendering. */
  lastMessageAt: string;
  /** A one-line preview of the latest message for the sessions sidebar. */
  preview: string;
  messages: MasterAgentMessage[];
};

export type SkillStatus = 'production' | 'planned' | 'retired';

export type Skill = {
  slug: string;
  name: string;
  category: 'memo' | 'analysis' | 'ingestion' | 'workflow' | 'planner';
  description: string;
  status: SkillStatus;
  /** When this skill takes a ticker / filing / date range / etc. */
  inputs: string[];
  /** What it produces (memo file, evidence row, JSON, …). */
  outputs: string[];
  /** Analyst slugs that have run this skill at least once. */
  usedBy: string[];
  /** Skills this one invokes as sub-skills (skill stacking — slice 16). */
  calls?: string[];
  /** Which stages this skill is most useful in. */
  stages?: StageId[];
};

export type DataCategory = 'filings' | 'snapshots' | 'transcripts' | 'news' | 'ir-pages';

export type DataInventoryRow = {
  category: DataCategory;
  count: number;
  lastUpdated: string | null;
  /** Tickers (or sources) covered by items in this category. */
  tickers: string[];
};

export type DataItem = {
  category: DataCategory;
  ticker: string;
  type: string; // e.g. "10-K", "10-Q", "snapshot", "Q1 transcript"
  date: string;
  size: string; // e.g. "580 KB"
};
