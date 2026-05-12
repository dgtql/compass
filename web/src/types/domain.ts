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

export type MasterAgentMessage = {
  id: string;
  role: 'pm' | 'master';
  text: string;
  ts: string;
};
