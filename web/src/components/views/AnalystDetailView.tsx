import { useEffect, useMemo, useState } from 'react';
import { Pencil, Check, X, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import { marked } from 'marked';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import { ChatPane } from '@/components/ChatPane';
import { useEngagement } from '@/contexts/EngagementContext';
import { Dialog } from '@/components/ui/dialog';
import { mockCoverages } from '@/mocks/pipeline';
import {
  getAnalystDeliverables,
  getAnalystTasksAll,
  getEngagementArtifact,
  getEngagementFiles,
  getSectors,
  lookupTickers,
  updateAnalyst,
  type ApiAnalyst,
  type ApiAnalystDeliverable,
  type ApiAnalystTaskRow,
  type ApiEngagementFile,
  type ApiEngagementTask,
  type ApiTicker,
} from '@/lib/api';

type Props = {
  slug: string;
  analysts: ApiAnalyst[];
  onOpenCoverage?: (ticker: string) => void;
  /** Called after a successful profile edit so the parent re-fetches the
   *  analyst list (sidebar + dashboard pick up the changes). */
  onAnalystUpdated?: () => void;
};

type Tab = 'chat' | 'coverage' | 'deliverables' | 'tasks' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'deliverables', label: 'Deliverables' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'profile', label: 'Profile' },
];

export function AnalystDetailView({ slug, analysts, onOpenCoverage, onAnalystUpdated }: Props) {
  const [tab, setTab] = useState<Tab>('chat');
  const analyst = useMemo(() => analysts.find((a) => a.slug === slug), [slug, analysts]);

  // Real engagement deliverables + tasks aggregated across every
  // (analyst, ticker) the dispatcher has touched. Refetched whenever
  // the slug changes; the Deliverables/Tasks tabs also refetch on
  // mount so a fresh memo run shows up without a hard reload.
  const [deliverables, setDeliverables] = useState<ApiAnalystDeliverable[]>([]);
  const [engagementTasks, setEngagementTasks] = useState<ApiAnalystTaskRow[]>([]);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);
  const [viewing, setViewing] = useState<ApiAnalystDeliverable | null>(null);

  const refreshArtifacts = useMemo(
    () => async () => {
      if (!slug) return;
      setLoadingArtifacts(true);
      try {
        const [d, t] = await Promise.all([
          getAnalystDeliverables(slug),
          getAnalystTasksAll(slug),
        ]);
        setDeliverables(d.deliverables);
        setEngagementTasks(t.tasks);
      } catch {
        // leave whatever was there
      } finally {
        setLoadingArtifacts(false);
      }
    },
    [slug],
  );
  useEffect(() => { refreshArtifacts(); }, [refreshArtifacts]);
  // Re-fetch on tab switch so a memo finished from chat shows up here.
  useEffect(() => {
    if (tab === 'deliverables' || tab === 'tasks') refreshArtifacts();
  }, [tab, refreshArtifacts]);

  // Resolve coverage tickers against the real universe (used by the
  // Coverage tab to show name + sector + cap bucket beside each symbol).
  const [coverageRows, setCoverageRows] = useState<ApiTicker[]>([]);
  useEffect(() => {
    if (!analyst || analyst.coverage.length === 0) {
      setCoverageRows([]);
      return;
    }
    let cancelled = false;
    lookupTickers(analyst.coverage)
      .then((r) => { if (!cancelled) setCoverageRows(r.tickers); })
      .catch(() => { if (!cancelled) setCoverageRows([]); });
    return () => { cancelled = true; };
  }, [analyst?.slug, analyst?.coverage.join(',')]);

  if (!analyst) {
    return <div className="p-8 text-sm text-muted-foreground">Analyst not found.</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header (compact when in Chat tab) */}
      <div className="px-8 pt-5 pb-3 border-b border-border bg-background/60">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Avatar initials={analyst.avatar_initials} color={analyst.avatar_color} size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">{analyst.name}</h1>
                <Badge
                  variant={
                    analyst.status === 'working'
                      ? 'warning'
                      : analyst.status === 'review'
                        ? 'default'
                        : 'secondary'
                  }
                  className="text-[10px] uppercase"
                >
                  {analyst.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {analyst.title} · {analyst.coverage.length} names · hired {analyst.hired_at}
              </p>
              {analyst.current_focus && tab !== 'chat' && (
                <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                  <span className="spinner" /> {analyst.current_focus}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-3 -mb-3">
          {TABS.map((t) => {
            const isActive = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-2 rounded-t-md text-sm font-medium transition-colors -mb-px border-b-2',
                  isActive
                    ? 'text-foreground border-primary bg-background'
                    : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-accent/50'
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab body */}
      <div className="flex-1 min-h-0">
        {tab === 'chat' && (
          <ChatPane
            ownerKey={analyst.slug}
            counterparty={{
              initials: analyst.avatar_initials,
              color: analyst.avatar_color,
            }}
            counterpartyName={analyst.name}
            placeholder={`Ask ${analyst.name.split(' ')[0]} anything — about ${analyst.sector.toLowerCase()}, a specific name, the thesis…`}
            rightRailTabs={({ activeTask }) => {
              // The right rail is scoped to the active chat task's engagement.
              // When the active task carries a ticker we render live task
              // stats + the engagement's intermediate files (briefs, KPIs,
              // filings, sections); otherwise we show a placeholder.
              const ticker = activeTask?.coverageTicker ?? null;
              return [
                {
                  id: 'tasks',
                  label: 'Tasks',
                  content: <EngagementTasksRail ticker={ticker} />,
                },
                {
                  id: 'files',
                  label: 'Files',
                  content: <EngagementFilesRail analyst={analyst.slug} ticker={ticker} />,
                },
              ];
            }}
          />
        )}

        {tab === 'coverage' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-5xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Coverage universe</CardTitle>
                <CardDescription>
                  {analyst.coverage.length} names · click a ticker with an active pipeline to open its research view.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analyst.coverage.length === 0 ? (
                  <div className="text-sm text-muted-foreground italic">
                    No coverage yet. Add tickers from the Profile tab.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {analyst.coverage.map((sym) => {
                      const t = coverageRows.find((r) => r.ticker === sym);
                      const hasPipeline = mockCoverages.some((c) => c.ticker === sym);
                      return (
                        <button
                          key={sym}
                          onClick={() => hasPipeline && onOpenCoverage && onOpenCoverage(sym)}
                          disabled={!hasPipeline}
                          className={cn(
                            'text-left flex items-center justify-between border border-border rounded-md p-3 transition-all',
                            hasPipeline
                              ? 'hover:bg-accent/30 hover:border-primary/40 cursor-pointer'
                              : 'opacity-80',
                          )}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                              <span className="font-mono">{sym}</span>
                              {t && (
                                <span className="text-muted-foreground font-normal truncate">· {t.name}</span>
                              )}
                              {hasPipeline && (
                                <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                  pipeline
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t?.sector ?? '—'}{t?.industry ? ` · ${t.industry}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {t?.cap_bucket && (
                              <Badge variant="outline" className="text-[10px]">
                                {CAP_LABELS[t.cap_bucket] ?? t.cap_bucket}
                              </Badge>
                            )}
                            {hasPipeline && (
                              <ArrowRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'deliverables' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold">Deliverables</h2>
                <p className="text-xs text-muted-foreground">
                  Finished outputs the PM consumes. Intermediate research files (briefs,
                  filings, KPIs, sections) live in each engagement's chat → Files rail.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={refreshArtifacts} disabled={loadingArtifacts}>
                {loadingArtifacts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Refresh
              </Button>
            </div>
            {deliverables.length === 0 ? (
              <div className="text-sm text-muted-foreground italic mt-8 text-center">
                {loadingArtifacts ? 'Loading…' : 'No deliverables yet. Run a memo from chat to produce one.'}
              </div>
            ) : (
              <div className="space-y-5">
                {DELIVERABLE_SECTIONS.map((section) => {
                  const items = deliverables.filter((d) => section.matches(d));
                  if (items.length === 0) return null;
                  return (
                    <section key={section.id}>
                      <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        {section.label} <span className="text-muted-foreground/60">({items.length})</span>
                      </h3>
                      <ul className="space-y-2">
                        {items.map((d) => (
                          <li
                            key={`${d.ticker}/${d.path}`}
                            onClick={() => setViewing(d)}
                            className="rounded-md border border-border bg-card p-3 hover:shadow-sm hover:border-primary/40 cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <Badge variant="outline" className="text-[10px] font-mono">{d.ticker}</Badge>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {fmtBytes(d.size)} · {fmtRelative(d.modified_at * 1000)}
                              </span>
                            </div>
                            <div className="text-sm font-medium truncate">{d.name}</div>
                            <code className="text-[10px] text-muted-foreground">{d.path}</code>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
                {(() => {
                  const matched = new Set(
                    DELIVERABLE_SECTIONS.flatMap((s) => deliverables.filter((d) => s.matches(d)).map((d) => `${d.ticker}/${d.path}`)),
                  );
                  const leftovers = deliverables.filter((d) => !matched.has(`${d.ticker}/${d.path}`));
                  if (leftovers.length === 0) return null;
                  return (
                    <section>
                      <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        Other ({leftovers.length})
                      </h3>
                      <ul className="space-y-2">
                        {leftovers.map((d) => (
                          <li
                            key={`${d.ticker}/${d.path}`}
                            onClick={() => setViewing(d)}
                            className="rounded-md border border-border bg-card p-3 hover:shadow-sm hover:border-primary/40 cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] font-mono">{d.ticker}</Badge>
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                                  {d.category}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {fmtBytes(d.size)} · {fmtRelative(d.modified_at * 1000)}
                              </span>
                            </div>
                            <div className="text-sm font-medium truncate">{d.name}</div>
                            <code className="text-[10px] text-muted-foreground">{d.path}</code>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {tab === 'tasks' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold">Tasks</h2>
                <p className="text-xs text-muted-foreground">
                  Every dispatcher task across this analyst's engagements.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={refreshArtifacts} disabled={loadingArtifacts}>
                {loadingArtifacts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Refresh
              </Button>
            </div>
            {engagementTasks.length === 0 ? (
              <div className="text-sm text-muted-foreground italic mt-8 text-center">
                {loadingArtifacts ? 'Loading…' : 'No tasks yet. Run a memo from chat to populate.'}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {engagementTasks.map((t) => (
                  <li
                    key={`${t.ticker}/${t.id}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant="outline" className="text-[10px] font-mono">{t.ticker}</Badge>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          {t.stage}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">{t.skill}</span>
                      </div>
                      <div className="text-sm font-medium truncate">{t.title}</div>
                      {t.error && (
                        <div className="text-[11px] text-rose-500 mt-1 line-clamp-2">{t.error}</div>
                      )}
                    </div>
                    <Badge
                      variant={
                        t.status === 'done'
                          ? 'success'
                          : t.status === 'in-progress'
                            ? 'warning'
                            : t.status === 'error'
                              ? 'destructive'
                              : 'secondary'
                      }
                      className="text-[10px] shrink-0"
                    >
                      {t.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DeliverableViewer
          item={viewing}
          analyst={slug}
          onClose={() => setViewing(null)}
        />


        {tab === 'profile' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-3xl mx-auto">
            <ProfilePanel
              analyst={analyst}
              onSaved={() => onAnalystUpdated?.()}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const CAP_LABELS: Record<string, string> = {
  'blue-chip': 'Blue chip',
  large: 'Large cap',
  mid: 'Mid cap',
  small: 'Small cap',
  micro: 'Micro cap',
  etf: 'ETF / Fund',
  preferred: 'Preferred',
  derivative: 'Warrant / Unit',
  other: 'Other',
};


function ProfilePanel({
  analyst,
  onSaved,
}: {
  analyst: ApiAnalyst;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(analyst.name);
  const [title, setTitle] = useState(analyst.title);
  const [sector, setSector] = useState(analyst.sector);
  const [persona, setPersona] = useState(analyst.persona);
  const [coverage, setCoverage] = useState<string[]>(analyst.coverage);
  const [coverageInput, setCoverageInput] = useState('');

  const [sectors, setSectors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync local state when the underlying analyst changes (sidebar refresh).
  useEffect(() => {
    setName(analyst.name);
    setTitle(analyst.title);
    setSector(analyst.sector);
    setPersona(analyst.persona);
    setCoverage(analyst.coverage);
  }, [analyst]);

  useEffect(() => {
    if (editing && sectors.length === 0) {
      getSectors().then(setSectors).catch(() => setSectors([]));
    }
  }, [editing, sectors.length]);

  function startEdit() {
    setError(null);
    setEditing(true);
  }
  function cancelEdit() {
    setName(analyst.name);
    setTitle(analyst.title);
    setSector(analyst.sector);
    setPersona(analyst.persona);
    setCoverage(analyst.coverage);
    setCoverageInput('');
    setError(null);
    setEditing(false);
  }
  function removeTicker(t: string) {
    setCoverage((prev) => prev.filter((x) => x !== t));
  }
  function addTickersFromInput() {
    const toks = coverageInput
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (toks.length === 0) return;
    setCoverage((prev) => Array.from(new Set([...prev, ...toks])));
    setCoverageInput('');
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateAnalyst(analyst.slug, {
        name: name.trim(),
        title: title.trim(),
        sector,
        persona: persona.trim(),
        coverage,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Identity, sector, coverage, and writing voice.</CardDescription>
        </div>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
              <X className="w-3.5 h-3.5" />
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!editing ? (
          <>
            <Field label="Name" value={analyst.name} />
            <Field label="Title" value={analyst.title} />
            <Field label="Sector" value={analyst.sector} />
            <Field label="Hired" value={analyst.hired_at} />
            <div>
              <span className="text-xs text-muted-foreground">Coverage</span>
              {analyst.coverage.length === 0 ? (
                <div className="text-xs text-muted-foreground italic mt-1">No coverage yet.</div>
              ) : (
                <div className="flex flex-wrap gap-1 mt-1">
                  {analyst.coverage.map((t) => (
                    <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Persona</span>
              <p className="text-foreground/90 leading-relaxed mt-1">
                {analyst.persona || <span className="italic text-muted-foreground">No persona set.</span>}
              </p>
            </div>
          </>
        ) : (
          <>
            <EditRow label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
            </EditRow>
            <EditRow label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving}
                placeholder={`Analyst · ${sector}`} />
            </EditRow>
            <EditRow label="Sector">
              <div className="flex flex-wrap gap-1.5">
                {sectors.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSector(s)}
                    disabled={saving}
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
            </EditRow>
            <EditRow label="Coverage">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Add tickers (comma- or space-separated, e.g. NVDA AMD INTC)"
                    value={coverageInput}
                    onChange={(e) => setCoverageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addTickersFromInput(); }
                    }}
                    disabled={saving}
                  />
                  <Button variant="outline" size="sm" onClick={addTickersFromInput} disabled={saving || !coverageInput.trim()}>
                    Add
                  </Button>
                </div>
                {coverage.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">No coverage yet.</div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {coverage.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {t}
                        <button onClick={() => removeTicker(t)} disabled={saving} className="hover:text-primary-foreground">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </EditRow>
            <EditRow label="Persona">
              <Textarea
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                rows={4}
                disabled={saving}
                placeholder="How does this analyst write and reason?"
              />
            </EditRow>
            {error && (
              <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-2">
                <strong>Couldn't save:</strong> {error}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="font-medium">{value || <span className="italic text-muted-foreground">—</span>}</div>
    </div>
  );
}

function EditRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}


// --- Chat right-rail content ----------------------------------------------

/** Top-level sections shown in the Deliverables tab. Order = display order.
 *  Each predicate decides which rows belong to a section; everything that
 *  doesn't match falls into the "Other" bucket. */
const DELIVERABLE_SECTIONS: { id: string; label: string; matches: (d: ApiAnalystDeliverable) => boolean }[] = [
  { id: 'pitch',     label: 'Pitch memos',          matches: (d) => d.path.startsWith('memos/pitch/') },
  { id: 'earnings',  label: 'Earnings reactions',   matches: (d) => d.path.startsWith('memos/earnings-reaction/') },
  { id: 'deep',      label: 'Deep dives',           matches: (d) => d.path.startsWith('memos/deep-dive/') },
  { id: 'maint',     label: 'Maintenance updates', matches: (d) => d.path.startsWith('memos/maintenance/') },
  { id: 'morning',   label: 'Morning briefs',       matches: (d) => d.path.startsWith('memos/morning-brief/') },
];

const STATUS_ORDER: ApiEngagementTask['status'][] = [
  'in-progress', 'pending', 'done', 'review', 'error', 'cancelled',
];

const STATUS_TONE: Record<ApiEngagementTask['status'], string> = {
  pending:        'text-muted-foreground',
  'in-progress':  'text-primary',
  done:           'text-emerald-500',
  review:         'text-amber-500',
  error:          'text-rose-500',
  cancelled:      'text-muted-foreground/70',
};

/** Tasks tab in the chat right rail. Reads live from EngagementContext —
 *  so the moment the dispatcher transitions a task, this re-renders. */
function EngagementTasksRail({ ticker }: { ticker: string | null }) {
  const { engagement, tasks, isLoading, connected, refreshTasks } = useEngagement();
  // Per-stage expand toggle. Defaults closed; the stage currently running
  // auto-opens via the effect below so the PM always sees what's active.
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const toggleStage = (stage: string) => setExpandedStages((prev) => {
    const next = new Set(prev);
    if (next.has(stage)) next.delete(stage); else next.add(stage);
    return next;
  });

  if (!ticker) {
    return (
      <div className="p-4 text-xs text-muted-foreground italic">
        Open or start a memo task to see live dispatcher progress here.
      </div>
    );
  }
  if (!engagement || engagement.ticker !== ticker) {
    return (
      <div className="p-4 text-xs text-muted-foreground italic">
        Waiting for engagement to attach…
      </div>
    );
  }

  // Aggregates
  const byStatus = new Map<ApiEngagementTask['status'], number>();
  const byStage = new Map<string, { done: number; total: number; tasks: ApiEngagementTask[] }>();
  for (const t of tasks) {
    byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
    const s = byStage.get(t.stage) ?? { done: 0, total: 0, tasks: [] };
    s.total += 1;
    if (t.status === 'done') s.done += 1;
    s.tasks.push(t);
    byStage.set(t.stage, s);
  }
  const active = tasks.filter((t) => t.status === 'in-progress');
  const errored = tasks.filter((t) => t.status === 'error');

  // Auto-expand any stage that has an in-progress task so the PM sees it
  // by default. Honour the user's explicit toggle once they've clicked —
  // we don't fight them by re-opening collapsed stages.
  const autoExpandStage = active.length > 0 ? active[0].stage : null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {engagement.ticker} · {tasks.length} tasks
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={cn(
                'inline-block w-1.5 h-1.5 rounded-full',
                connected ? 'bg-emerald-500' : 'bg-muted-foreground/40',
              )}
            />
            <span className="text-[10px] text-muted-foreground">
              {connected ? 'live' : isLoading ? 'loading…' : 'disconnected'}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={refreshTasks} className="h-6 px-2 text-[10px]">
          Refresh
        </Button>
      </div>

      {tasks.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No tasks planned yet.</div>
      ) : (
        <>
          {/* Status counters */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_ORDER.filter((s) => (byStatus.get(s) ?? 0) > 0).map((s) => (
              <span
                key={s}
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border border-border bg-card',
                  STATUS_TONE[s],
                )}
              >
                {byStatus.get(s)} · {s}
              </span>
            ))}
          </div>

          {/* Per-stage progress (expandable — click a row to see its tasks). */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              By stage
            </div>
            <ul className="space-y-1">
              {Array.from(byStage.entries()).map(([stage, { done, total, tasks: stageTasks }]) => {
                const pct = total === 0 ? 0 : Math.round((done / total) * 100);
                const isExpanded = expandedStages.has(stage) || stage === autoExpandStage;
                return (
                  <li key={stage} className="text-[11px]">
                    <button
                      onClick={() => toggleStage(stage)}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          {isExpanded
                            ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                            : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                          <span className="capitalize">{stage}</span>
                        </div>
                        <span className="text-muted-foreground tabular-nums">{done}/{total}</span>
                      </div>
                      <div className="h-1 rounded bg-border mt-0.5 overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                    {isExpanded && (
                      <ul className="mt-1.5 ml-4 space-y-1 border-l border-border pl-2">
                        {stageTasks.map((t) => (
                          <li key={t.id} className="flex items-start gap-1.5">
                            <TaskStatusGlyph status={t.status} />
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-medium truncate" title={t.title}>
                                {t.title}
                              </div>
                              <div className="text-[9px] text-muted-foreground font-mono truncate">
                                {t.skill}
                                {t.finished_at && t.started_at && ` · ${fmtTaskDuration(t.started_at, t.finished_at)}`}
                              </div>
                              {t.status === 'error' && t.error && (
                                <code className="text-[9px] text-rose-500 line-clamp-2 block mt-0.5">
                                  {t.error}
                                </code>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Errors */}
          {errored.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-rose-500 font-semibold mb-1">
                Errors ({errored.length})
              </div>
              <ul className="space-y-1.5">
                {errored.map((t) => (
                  <li key={t.id} className="text-[11px]">
                    <div className="font-medium truncate">{t.title}</div>
                    <code className="text-[10px] text-rose-500 line-clamp-2">{t.error ?? '—'}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Files tab in the chat right rail. Lists intermediate files for the
 *  active engagement (briefs, filings, KPIs, sections, snapshots, …),
 *  grouped by category. Click a row → open the full viewer modal. */
function EngagementFilesRail({
  analyst,
  ticker,
}: {
  analyst: string;
  ticker: string | null;
}) {
  const [files, setFiles] = useState<ApiEngagementFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<ApiEngagementFile | null>(null);
  const { events } = useEngagement();

  // Refetch whenever the engagement's task list mutates — a new artifact
  // is almost always written right around the same time.
  const triggerCount = events.length;
  useEffect(() => {
    if (!ticker) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getEngagementFiles(analyst, ticker)
      .then((r) => { if (!cancelled) setFiles(r.files); })
      .catch(() => { if (!cancelled) setFiles([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [analyst, ticker, triggerCount]);

  if (!ticker) {
    return (
      <div className="p-4 text-xs text-muted-foreground italic">
        Open or start a memo task to browse its research files here.
      </div>
    );
  }

  // Group by category, preserving newest-first order within each group.
  const groups = new Map<string, ApiEngagementFile[]>();
  for (const f of files) {
    const arr = groups.get(f.category) ?? [];
    arr.push(f);
    groups.set(f.category, arr);
  }

  return (
    <div className="p-4 space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
        <span>{ticker} · {files.length} files</span>
        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>
      {files.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">
          No files yet. Run a memo to populate.
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from(groups.entries()).map(([category, items]) => (
            <section key={category}>
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                {category}
              </h4>
              <ul className="space-y-1">
                {items.map((f) => (
                  <li
                    key={f.path}
                    onClick={() => setViewing(f)}
                    className="text-[11px] rounded border border-border hover:border-primary/50 hover:bg-accent/30 px-2 py-1.5 cursor-pointer"
                  >
                    <div className="font-medium truncate">{f.name}</div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <code className="text-[9px] text-muted-foreground truncate">{f.path}</code>
                      <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums">{fmtBytes(f.size)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <EngagementFileViewer
        item={viewing}
        analyst={analyst}
        ticker={ticker}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

function EngagementFileViewer({
  item,
  analyst,
  ticker,
  onClose,
}: {
  item: ApiEngagementFile | null;
  analyst: string;
  ticker: string;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setContent(null);
    setError(null);
    setLoading(true);
    getEngagementArtifact(analyst, ticker, item.path)
      .then((r) => { if (!cancelled) setContent(r.content); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item, analyst, ticker]);

  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title={item ? `${ticker} · ${item.category}` : ''}
      maxWidth="max-w-5xl"
    >
      {item && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <code className="break-all">{item.path}</code>
            <span className="shrink-0">{fmtBytes(item.size)}</span>
          </div>
          <div className="border-t border-border pt-3 max-h-[70vh] overflow-y-auto scrollbar-thin">
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            )}
            {error && <div className="text-xs text-rose-500">{error}</div>}
            {content !== null && <FileContentBody path={item.path} content={content} />}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function DeliverableViewer({
  item,
  analyst,
  onClose,
}: {
  item: ApiAnalystDeliverable | null;
  analyst: string;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setContent(null);
    setError(null);
    setLoading(true);
    getEngagementArtifact(analyst, item.ticker, item.path)
      .then((r) => { if (!cancelled) setContent(r.content); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item, analyst]);

  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title={item ? `${item.ticker} · ${item.category}` : ''}
      maxWidth="max-w-4xl"
    >
      {item && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <code className="break-all">{item.path}</code>
            <span className="shrink-0">{fmtBytes(item.size)}</span>
          </div>
          <div className="border-t border-border pt-3 max-h-[60vh] overflow-y-auto scrollbar-thin">
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            )}
            {error && <div className="text-xs text-rose-500">{error}</div>}
            {content !== null && <FileContentBody path={item.path} content={content} />}
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Renders an artifact's raw text content with the right treatment for the
 *  file type. Used by both the Deliverables viewer (full memos) and the
 *  chat's intermediate-files viewer (briefs, sections, KPI JSON, etc.). */
function FileContentBody({ path, content }: { path: string; content: string }) {
  const lower = path.toLowerCase();

  if (lower.endsWith('.md')) {
    // Marked is sync when no async tokenizers/walkers are registered.
    const html = marked.parse(content, { gfm: true, breaks: false }) as string;
    return (
      <div
        className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-li:my-0.5 prose-code:text-xs prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  if (lower.endsWith('.json')) {
    let pretty = content;
    try {
      pretty = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      // Leave content as-is if it's not valid JSON.
    }
    return (
      <pre className="text-[11px] leading-relaxed font-mono bg-muted/40 rounded-md p-3 overflow-x-auto whitespace-pre">
        {pretty}
      </pre>
    );
  }

  if (lower.endsWith('.jsonl') || lower.endsWith('.ndjson')) {
    // Pretty-print each JSON line individually; preserve order.
    const lines = content.split(/\r?\n/);
    const formatted = lines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        try {
          return JSON.stringify(JSON.parse(trimmed), null, 2);
        } catch {
          return trimmed;
        }
      })
      .join('\n\n');
    return (
      <pre className="text-[11px] leading-relaxed font-mono bg-muted/40 rounded-md p-3 overflow-x-auto whitespace-pre">
        {formatted}
      </pre>
    );
  }

  // Fallback: plain text (logs, .txt, etc.).
  return (
    <pre className="text-xs leading-relaxed whitespace-pre-wrap font-sans">
      {content}
    </pre>
  );
}

function TaskStatusGlyph({ status }: { status: ApiEngagementTask['status'] }) {
  switch (status) {
    case 'done':         return <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />;
    case 'in-progress':  return <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0 mt-0.5" />;
    case 'error':        return <X className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />;
    case 'review':       return <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block shrink-0 mt-1.5" />;
    case 'cancelled':    return <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 inline-block shrink-0 mt-1.5" />;
    default:             return <span className="w-1.5 h-1.5 rounded-full border border-muted-foreground/50 inline-block shrink-0 mt-1.5" />;
  }
}

function fmtTaskDuration(startedIso: string, finishedIso: string): string {
  const ms = new Date(finishedIso).getTime() - new Date(startedIso).getTime();
  if (Number.isNaN(ms) || ms <= 0) return '';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)}m`;
  return `${(m / 60).toFixed(1)}h`;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtRelative(tsMs: number): string {
  const diff = (Date.now() - tsMs) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(tsMs).toLocaleDateString();
}
