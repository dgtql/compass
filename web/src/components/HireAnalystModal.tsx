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
import { Sparkles, X, Loader2, Database, Users } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  createAnalyst,
  createAnalystFromPack,
  getMyUniverse,
  getPacks,
  getSectors,
  getUniverse,
  hireDataEngineer,
  type ApiAnalyst,
  type ApiPack,
  type ApiTicker,
  type ApiWatchlistEntry,
} from '@/lib/api';

type SuggestedTicker = { ticker: string; name: string };

/** Two role options for the hire flow. Analyst = the existing pack /
 *  custom-persona path; Data Engineer = the simple singleton role with
 *  no sector or coverage. */
type Role = 'analyst' | 'data-engineer';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Fired with the created analyst after a successful POST. */
  onCreated?: (analyst: ApiAnalyst) => void;
  /** When set, the modal pre-selects this pack on open (so deep-linking
   *  from People → Hire lands on the right persona). */
  initialPackId?: string | null;
  /** Current roster — used to compute which tickers are already covered
   *  by another analyst, so the suggestion list shows only uncovered ones. */
  analysts?: ApiAnalyst[];
  /** When set, the modal opens with role pre-selected. Useful for routing
   *  a "Hire data engineer" button straight to that branch. */
  initialRole?: Role;
};

export function HireAnalystModal({
  open, onClose, onCreated, initialPackId, analysts, initialRole,
}: Props) {
  const [role, setRole] = useState<Role>('analyst');
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

  // Persona packs (Buffett, ...) — fetched once on open. When a pack is
  // selected we pre-fill the form fields below from its defaults so the
  // user can override on the way out.
  const [packs, setPacks] = useState<ApiPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const selectedPack = useMemo(
    () => packs.find((p) => p.id === selectedPackId) ?? null,
    [packs, selectedPackId],
  );

  // Reset form whenever the modal opens (so reopening doesn't carry stale state).
  useEffect(() => {
    if (!open) return;
    setRole(initialRole ?? 'analyst');
    setName('');
    setTitle('');
    setSector(null);
    setPersona('');
    setCoverage(new Set());
    setUniverseMatches([]);
    setError(null);
    setSelectedPackId(null);
    getSectors().then(setSectors).catch(() => setSectors([]));
    getMyUniverse()
      .then((wl) => setMyUniverse(wl.tickers))
      .catch(() => setMyUniverse([]));
    getPacks()
      .then((r) => {
        setPacks(r.packs);
        // Pre-select a pack if the caller asked for one (People tab deep-link).
        if (initialPackId) {
          const target = r.packs.find((p) => p.id === initialPackId);
          if (target) applyPack(target);
        }
      })
      .catch(() => setPacks([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Tickers already on another analyst's coverage. Excluded from the
  // suggestion list so the PM doesn't double-assign by accident.
  const coveredByOthers = useMemo(() => {
    const s = new Set<string>();
    for (const a of analysts ?? []) {
      for (const t of a.coverage ?? []) s.add(t);
    }
    return s;
  }, [analysts]);

  // When a pack is picked, pre-fill the form from its defaults. The user
  // can still edit anything before hitting Hire.
  function applyPack(pack: ApiPack | null) {
    if (!pack) {
      setSelectedPackId(null);
      return;
    }
    setSelectedPackId(pack.id);
    setName(pack.name);
    setTitle(pack.title);
    // Deliberately NOT auto-applying ``pack.sector_hint`` — the hint is
    // informational; the PM should pick a sector (or leave it blank) on
    // their own.
    setPersona(pack.voice);
  }

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

  // My-universe matches — always present (sector-less → all tickers in My
  // universe; sector → filtered to that sector). Tickers already covered
  // by another analyst are dropped.
  const myUniverseMatches: SuggestedTicker[] = useMemo(() => {
    return myUniverse
      .filter((t) => (sector ? (t.sector ?? '') === sector : true))
      .filter((t) => !coveredByOthers.has(t.ticker))
      .map((t) => ({ ticker: t.ticker, name: t.name ?? t.ticker }));
  }, [myUniverse, sector, coveredByOthers]);

  // Universe-only matches — only when a sector is picked, otherwise the
  // unfiltered universe is too big to surface here. Excludes tickers
  // already in My universe (shown above) AND tickers covered by others.
  const universeOnlyMatches: SuggestedTicker[] = useMemo(() => {
    if (!sector) return [];
    const inBook = new Set(myUniverse.map((t) => t.ticker));
    return universeMatches
      .filter((t) => !inBook.has(t.ticker) && !coveredByOthers.has(t.ticker))
      .map((t) => ({ ticker: t.ticker, name: t.name }));
  }, [universeMatches, myUniverse, sector, coveredByOthers]);

  // Submit is allowed when the role-appropriate fields are populated:
  //   - Analyst: just a name. Sector is now optional.
  //   - Data Engineer: nothing — the hire endpoint is parameterless.
  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (role === 'data-engineer') return true;
    return !!name.trim();
  }, [name, role, submitting]);

  function toggle(t: string) {
    setCoverage((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      let analyst: ApiAnalyst;
      if (role === 'data-engineer') {
        analyst = await hireDataEngineer();
      } else if (selectedPack) {
        // Pack route — backend pulls skills, default_template, pack id
        // from the pack manifest; everything else is form-overridable.
        analyst = await createAnalystFromPack({
          pack_id: selectedPack.id,
          name: name.trim() || undefined,
          title: title.trim() || undefined,
          // Pass the PM's pick through verbatim — no auto-fallback to
          // the pack's sector_hint. If they left it blank, the analyst
          // gets no sector (server treats that as a generalist hire).
          sector: sector || undefined,
          persona: persona.trim(),
          coverage: Array.from(coverage),
        });
      } else {
        analyst = await createAnalyst({
          name: name.trim(),
          sector: sector || null,
          coverage: Array.from(coverage),
          persona: persona.trim(),
          title: title.trim() || undefined,
        });
      }
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
      title={role === 'data-engineer' ? 'Hire a data engineer' : 'Hire a new analyst'}
      description={
        role === 'data-engineer'
          ? "A pragmatic source-hunter. Chats with you to scope new data sources and produces a written spec."
          : "Define their identity, sector, and coverage. They'll start producing work as soon as you assign a task."
      }
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        {/* Role toggle — Analyst vs Data Engineer. The DE branch hides the
            pack / sector / coverage / persona fields. */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Role
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRole('analyst')}
              disabled={submitting}
              className={cn(
                'text-left px-3 py-2.5 rounded-md border transition-colors',
                role === 'analyst'
                  ? 'bg-primary/10 border-primary text-foreground'
                  : 'bg-card border-border hover:bg-accent hover:border-primary/40',
              )}
            >
              <div className="flex items-center gap-2">
                <Users className={cn('w-3.5 h-3.5', role === 'analyst' ? 'text-primary' : 'text-muted-foreground')} />
                <span className="text-sm font-medium">Analyst</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Covers tickers · writes memos · hireable from a pack or custom
              </div>
            </button>
            <button
              type="button"
              onClick={() => setRole('data-engineer')}
              disabled={submitting}
              className={cn(
                'text-left px-3 py-2.5 rounded-md border transition-colors',
                role === 'data-engineer'
                  ? 'bg-primary/10 border-primary text-foreground'
                  : 'bg-card border-border hover:bg-accent hover:border-primary/40',
              )}
            >
              <div className="flex items-center gap-2">
                <Database className={cn('w-3.5 h-3.5', role === 'data-engineer' ? 'text-primary' : 'text-muted-foreground')} />
                <span className="text-sm font-medium">Data Engineer</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Scopes new data sources · one per pod
              </div>
            </button>
          </div>
        </div>

        {/* DE info panel — short explainer; no form fields needed. */}
        {role === 'data-engineer' && (
          <div className="text-xs text-muted-foreground border border-border rounded-md p-3 bg-muted/30 leading-relaxed">
            <p className="mb-1.5">
              <strong className="text-foreground">Name:</strong> Data Engineer
              <span className="ml-2 text-muted-foreground">·</span>
              <strong className="ml-2 text-foreground">Slug:</strong> <code className="font-mono text-[11px]">data-engineer</code>
            </p>
            <p>
              No sector, no coverage. The DE chats with you about new data
              sources and saves a written spec under <code className="font-mono text-[11px]">specs/data/</code>.
              One DE per pod — re-hiring just returns the existing record.
            </p>
          </div>
        )}

        {/* Pack selector — pick a famous-PM template, or skip for a hand-rolled analyst */}
        {role === 'analyst' && packs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Hire from a template <span className="text-muted-foreground/60 normal-case font-normal lowercase">— optional</span>
              </label>
              {selectedPack && (
                <button
                  onClick={() => applyPack(null)}
                  disabled={submitting}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {packs.map((p) => {
                const isSelected = selectedPackId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => applyPack(isSelected ? null : p)}
                    disabled={submitting}
                    title={p.voice}
                    className={cn(
                      'text-left px-3 py-2 rounded-md border transition-colors min-w-[180px]',
                      isSelected
                        ? 'bg-primary/10 border-primary text-foreground'
                        : 'bg-card border-border hover:bg-accent hover:border-primary/40',
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <Sparkles className={cn('w-3 h-3', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="text-sm font-medium">{p.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {p.title} · {p.workflows.length} workflow{p.workflows.length === 1 ? '' : 's'}
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedPack && (
              <div className="text-[11px] text-muted-foreground italic pl-1">
                Pre-filled from <strong>{selectedPack.name}</strong>. Edit any field before hiring.
              </div>
            )}
          </div>
        )}

        {role === 'analyst' && (
          <>
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
                  placeholder={sector ? `Defaults to "Analyst · ${sector}"` : 'Defaults to "Analyst"'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Sector specialty <span className="text-muted-foreground/60 normal-case font-normal lowercase">— optional, narrows the ticker suggestions below</span>
                </label>
                {sector && (
                  <button
                    onClick={() => setSector(null)}
                    disabled={submitting}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline"
                  >
                    Clear
                  </button>
                )}
              </div>
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
                  Coverage <span className="text-muted-foreground/60 normal-case font-normal lowercase">— optional, tickers not yet covered by another analyst</span>
                </label>
                <span className="text-[10px] text-muted-foreground">
                  {coverage.size} selected · {myUniverseMatches.length + universeOnlyMatches.length} suggested
                </span>
              </div>
              <div className="border border-border rounded-md p-3 max-h-56 overflow-y-auto scrollbar-thin space-y-3">
                {/* Group 1: from My universe (the PM's curated book) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      {sector ? 'From your book · in sector' : 'From your book'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{myUniverseMatches.length}</span>
                  </div>
                  {myUniverseMatches.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground italic">
                      {sector
                        ? 'No uncovered tickers in My universe match this sector yet.'
                        : myUniverse.length === 0
                          ? 'My universe is empty. Add tickers from the Tickers page.'
                          : 'Every ticker in My universe is already covered by another analyst.'}
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

                {/* Group 2: from the broader universe (only when a sector is picked) */}
                {sector && (suggestedLoading || suggestedError || universeOnlyMatches.length > 0) && (
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
          </>
        )}

        {error && (
          <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-2">
            <strong>Couldn't hire {role === 'data-engineer' ? 'data engineer' : 'analyst'}:</strong> {error}
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
