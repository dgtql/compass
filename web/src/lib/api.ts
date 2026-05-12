import type { EvidenceRow, MemoDetail, MemoListItem, Task, TickerSummary } from '@/types/api';

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json() as Promise<T>;
}

async function jpost<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`${url} → ${r.status}: ${txt}`);
  }
  return r.json() as Promise<T>;
}

export const api = {
  listTickers: () => jget<TickerSummary[]>('/api/tickers'),
  addTicker: (ticker: string) =>
    jpost<{ ticker: string; workspace_key: string }>('/api/tickers', { ticker }),

  listMemos: (ticker: string) => jget<MemoListItem[]>(`/api/tickers/${ticker}/memos`),
  getMemo: (ticker: string, type: string, date: string) =>
    jget<MemoDetail>(`/api/memos/${ticker}/${type}/${date}`),

  getEvidence: (id: number) => jget<EvidenceRow>(`/api/evidence/${id}`),

  listTasks: (limit = 20) => jget<Task[]>(`/api/tasks?limit=${limit}`),
  startTask: (ticker: string, type: string, params: Record<string, unknown> = {}) =>
    jpost<Task>('/api/tasks', { ticker, type, params }),
};
