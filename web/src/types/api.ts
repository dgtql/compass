export type TickerSummary = {
  ticker: string;
  workspace_key: string;
  memo_count: number;
};

export type MemoListItem = {
  type: string;
  date: string;
  size_bytes: number;
};

export type MemoDetail = {
  ticker: string;
  type: string;
  date: string;
  content: string;
  citations: number[];
};

export type EvidenceRow = {
  id: number;
  doc_id: string;
  ticker: string;
  source: string;
  source_url: string | null;
  form_type: string | null;
  line_start: number;
  line_end: number;
  retrieved_at: string;
  content: string;
};

export type TaskStatus = 'queued' | 'running' | 'done' | 'error';

export type TaskEvent = {
  ts: number;
  type: 'start' | 'tool' | 'say' | 'done' | 'error' | string;
  elapsed?: number;
  message?: string;
  preview?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
};

export type Task = {
  id: string;
  ticker: string;
  type: 'fetch_filing' | 'snapshot' | 'research' | string;
  params: Record<string, unknown>;
  status: TaskStatus;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  events: TaskEvent[];
  result: Record<string, unknown> | null;
  error: string | null;
};
