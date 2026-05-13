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
