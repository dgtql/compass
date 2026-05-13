/**
 * HireAnalystModal — creates a new analyst on the backend.
 *
 * Flow:
 *   1. Loads the GICS sector list from /api/universe/sectors on open.
 *   2. When the PM picks a sector, fetches suggested tickers from
 *      /api/universe?sector=...&limit=20 (excluding non-equity buckets
 *      so SPAC warrants don't pollute the suggestion list).
 *   3. On Hire, POSTs to /api/analysts. On success calls `onCreated`
 *      so the App can refresh the roster + close the modal.
 */

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  createAnalyst,
  getMyUniverse,
  getSectors,
  getUniverse,
  type ApiAnalyst,
  type ApiTicker,
  type ApiWatchlistEntry,
} from '@/lib/api';

type SuggestedTicker = { ticker: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Fired with the created analyst after a successful POST. */
  onCreated?: (analyst: ApiAnalyst) => void;
};

export function HireAnalystModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [sector, setSector] = useState<string | null>(null);
  const [persona, setPersona] = useState('');
  const [coverage, setCoverage] = useState<Set<string>>(new Set());

  const [sectors, setSectors] = useState<string[]>([]);
  // My-universe (fetched once on open) — filtered by sector below.
  const [myUniverse, setMyUniverse] = useState<ApiWatchlistEntry[]>([]);
  // Top universe matches for the selected sector — used as fallback /
  // "more names" suggestions below the My-universe group.
  const [universeMatches, setUniverseMatches] = useState<ApiTicker[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(false);
  const [suggestedError, setSuggestedError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the modal opens (so reopening doesn't carry stale state).
  useEffect(() => {
    if (!open) return;
    setName('');
    setTitle('');
    setSector(null);
    setPersona('');
    setCoverage(new Set());
    setUniverseMatches([]);
    setError(null);
    getSectors().then(setSectors).catch(() => setSectors([]));
    getMyUniverse()
      .then((wl) => setMyUniverse(wl.tickers))
      .catch(() => setMyUniverse([]));
  }, [open]);

  // Fetch the broader-universe matches when sector changes.
  useEffect(() => {
    if (!sector) {
      setUniverseMatches([]);
      setSuggestedLoading(false);
      setSuggestedError(null);
      return;
    }
    let cancelled = false;
    setSuggestedLoading(true);
    setSuggestedError(null);
    getUniverse({ sector, limit: 20 })
      .then((u) => {
        if (cancelled) return;
        setUniverseMatches(u.tickers);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setUniverseMatches([]);
        setSuggestedError(err.message);
      })
      .finally(() => { if (!cancelled) setSuggestedLoading(false); });
    return () => { cancelled = true; };
  }, [sector]);

  // My-universe matches in the selected sector (book first).
  const myUniverseMatches: SuggestedTicker[] = useMemo(() => {
    if (!sector) return [];
    return myUniverse
      .filter((t) => (t.sector ?? '') === sector)
      .map((t) => ({ ticker: t.ticker, name: t.name ?? t.ticker }));
  }, [myUniverse, sector]);

  // Universe-only matches (exclude tickers that are already in My universe
  // — they'll be shown in the top group).
  const universeOnlyMatches: SuggestedTicker[] = useMemo(() => {
    const inBook = new Set(myUniverse.map((t) => t.ticker));
    return universeMatches
      .filter((t) => !inBook.has(t.ticker))
      .map((t) => ({ ticker: t.ticker, name: t.name }));
  }, [universeMatches, myUniverse]);

  const canSubmit = useMemo(
    () => !!name.trim() && !!sector && !submitting,
    [name, sector, submitting],
  );

  function toggle(t: string) {
    setCoverage((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  async function handleSubmit() {
    if (!canSubmit || !sector) return;
    setSubmitting(true);
    setError(null);
    try {
      const analyst = await createAnalyst({
        name: name.trim(),
        sector,
        coverage: Array.from(coverage),
        persona: persona.trim(),
        title: title.trim() || undefined,
      });
      onCreated?.(analyst);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Hire a new analyst"
      description="Define their identity, sector, and coverage. They'll start producing work as soon as you assign a task."
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Name
            </label>
            <Input
              placeholder="e.g. Maria Chen"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Title <span className="text-muted-foreground/60 normal-case font-normal lowercase">— optional</span>
            </label>
            <Input
              placeholder='Defaults to "Analyst · {sector}"'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Sector specialty
          </label>
          <div className="flex flex-wrap gap-1.5">
            {sectors.length === 0 && (
              <span className="text-[11px] text-muted-foreground italic">Loading…</span>
            )}
            {sectors.map((s) => (
              <button
                key={s}
                onClick={() => setSector(sector === s ? null : s)}
                disabled={submitting}
                className={cn(
                  'text-xs px-2 py-1 rounded-md font-medium transition-colors',
                  sector === s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-accent',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Coverage <span className="text-muted-foreground/60 normal-case font-normal lowercase">— optional</span>
            </label>
            {sector && (
              <span className="text-[10px] text-muted-foreground">
                {coverage.size} selected · {myUniverseMatches.length + universeOnlyMatches.length} suggested
              </span>
            )}
          </div>
          {!sector ? (
            <div className="text-xs text-muted-foreground italic border border-dashed border-border rounded-md p-3">
              Pick a sector to see suggested tickers from your book and the universe.
            </div>
          ) : (
            <div className="border border-border rounded-md p-3 max-h-56 overflow-y-auto scrollbar-thin space-y-3">
              {/* Group 1: from My universe (the PM's curated book) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    From your book
                  </span>
                  <span className="text-[10px] text-muted-foreground">{myUniverseMatches.length}</span>
                </div>
                {myUniverseMatches.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground italic">
                    No tickers in My universe match this sector yet. Add some from the Tickers page.
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {myUniverseMatches.map((t) => (
                      <TickerPill
                        key={t.ticker}
                        ticker={t.ticker}
                        name={t.name}
                        selected={coverage.has(t.ticker)}
                        onToggle={() => toggle(t.ticker)}
                        disabled={submitting}
                        accent
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Group 2: from the broader universe (top matches, excluding My-uni) */}
              {(suggestedLoading || suggestedError || universeOnlyMatches.length > 0) && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      More from the universe
                    </span>
                    {!suggestedLoading && !suggestedError && (
                      <span className="text-[10px] text-muted-foreground">{universeOnlyMatches.length}</span>
                    )}
                  </div>
                  {suggestedLoading && (
                    <span className="text-[11px] text-muted-foreground italic">Loading…</span>
                  )}
                  {!suggestedLoading && suggestedError && (
                    <span className="text-[11px] text-rose-500 italic">Couldn't load: {suggestedError}</span>
                  )}
                  {!suggestedLoading && !suggestedError && (
                    <div className="flex flex-wrap gap-1.5">
                      {universeOnlyMatches.map((t) => (
                        <TickerPill
                          key={t.ticker}
                          ticker={t.ticker}
                          name={t.name}
                          selected={coverage.has(t.ticker)}
                          onToggle={() => toggle(t.ticker)}
                          disabled={submitting}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {coverage.size > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {Array.from(coverage).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                >
                  {t}
                  <button onClick={() => toggle(t)} disabled={submitting} className="hover:text-primary-foreground">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Persona <span className="text-muted-foreground/60 normal-case font-normal lowercase">— optional, shapes the analyst's writing voice</span>
          </label>
          <Textarea
            placeholder="e.g. Quantitative-leaning semis specialist. Treats every thesis as a supply-chain question first. Plain English, no superlatives."
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={3}
            disabled={submitting}
          />
        </div>

        {error && (
          <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-2">
            <strong>Couldn't hire analyst:</strong> {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            <Sparkles className="inline-block w-3 h-3 mr-1 -translate-y-px text-primary" />
            Analyst is stored locally. Engagements appear under their slug.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Hire
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function TickerPill({
  ticker,
  name,
  selected,
  onToggle,
  disabled,
  accent,
}: {
  ticker: string;
  name: string;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** When true, render with a star + amber tint to mark it as already in
   *  the PM's My universe. */
  accent?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      title={name}
      className={cn(
        'text-xs font-mono px-2 py-1 rounded-md border transition-colors',
        selected
          ? 'bg-primary text-primary-foreground border-primary'
          : accent
            ? 'bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/20'
            : 'bg-card border-border hover:bg-accent',
      )}
    >
      {accent && <span className="mr-0.5">★</span>}
      {ticker}
    </button>
  );
}
