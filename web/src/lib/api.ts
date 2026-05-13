/**
 * Thin fetch wrappers for the Compass FastAPI backend.
 *
 * Endpoints are documented in `compass/api.py`. In dev, Vite's `/api/*`
 * proxy forwards to http://127.0.0.1:8000; in production, FastAPI serves
 * the SPA from the same origin, so relative paths work in both modes.
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
