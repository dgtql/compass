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
  market_cap: number | null;
};

export type ApiUniverse = {
  as_of: string;
  region: string;
  source: string;
  total: number;
  count: number;
  tickers: ApiTicker[];
};

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
  sector?: string;
  exchange?: string;
  query?: string;
  limit?: number;
} = {}): Promise<ApiUniverse> {
  const search = new URLSearchParams();
  if (params.sector)   search.set('sector', params.sector);
  if (params.exchange) search.set('exchange', params.exchange);
  if (params.query)    search.set('query', params.query);
  search.set('limit', String(params.limit ?? 1000));
  return getJson<ApiUniverse>(`/api/universe?${search.toString()}`);
}

export function getSectors(): Promise<string[]> {
  return getJson<string[]>('/api/universe/sectors');
}

export function getExchanges(): Promise<string[]> {
  return getJson<string[]>('/api/universe/exchanges');
}

export function getRegions(): Promise<string[]> {
  return getJson<string[]>('/api/universe/regions');
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
  market_cap: number | null;
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
