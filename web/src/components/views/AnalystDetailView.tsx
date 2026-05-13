import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Download, LineChart, FileText, Plus, Pencil, Check, X, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn, fmtElapsed } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import { ChatPane } from '@/components/ChatPane';
import { TaskProgressRail } from '@/components/chat/TaskProgressRail';
import { mockCoverages } from '@/mocks/pipeline';
import {
  mockMemos,
  mockTasks,
} from '@/mocks/data';
import {
  getSectors,
  lookupTickers,
  updateAnalyst,
  type ApiAnalyst,
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

type Tab = 'chat' | 'coverage' | 'memos' | 'tasks' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'memos', label: 'Memos' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'profile', label: 'Profile' },
];

export function AnalystDetailView({ slug, analysts, onOpenCoverage, onAnalystUpdated }: Props) {
  const [tab, setTab] = useState<Tab>('chat');
  const analyst = useMemo(() => analysts.find((a) => a.slug === slug), [slug, analysts]);
  const memos = useMemo(() => mockMemos.filter((m) => m.analystSlug === slug), [slug]);
  const tasks = useMemo(() => mockTasks.filter((t) => t.analystSlug === slug), [slug]);

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
              // Progress tab is scoped to the selected chat task: when the
              // PM clicks a different task on the left, the rail re-renders
              // against that task's coverage pipeline (if any).
              const coverage = activeTask?.coverageTicker
                ? mockCoverages.find((c) => c.ticker === activeTask.coverageTicker)
                : undefined;
              const openCount = coverage
                ? coverage.tasks.filter(
                    (t) => t.status === 'pending' || t.status === 'in-progress',
                  ).length
                : 0;
              return [
                {
                  id: 'current',
                  label: 'Current',
                  content: (
                    <AnalystRightRail analyst={analyst} memos={memos} tasks={tasks} />
                  ),
                },
                {
                  id: 'progress',
                  label: 'Progress',
                  badge: openCount > 0 ? openCount : undefined,
                  content: <TaskProgressRail task={activeTask} />,
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

        {tab === 'memos' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-5xl mx-auto">
            <ul className="space-y-3">
              {memos.length === 0 && (
                <li className="text-sm text-muted-foreground italic">No memos yet.</li>
              )}
              {memos.map((m) => (
                <li
                  key={m.id}
                  className="rounded-md border border-border bg-card p-4 hover:shadow-sm cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{m.title}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {m.date}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{m.excerpt}</p>
                  <div className="text-[10px] text-muted-foreground mt-2">
                    {m.citationCount} citations ·{' '}
                    <span className="capitalize">{m.type.replace('-', ' ')}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'tasks' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-5xl mx-auto">
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-md border border-border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtElapsed(t.durationSec)} · {t.createdAt}
                    </div>
                  </div>
                  <Badge
                    variant={
                      t.status === 'done'
                        ? 'success'
                        : t.status === 'running'
                          ? 'warning'
                          : 'destructive'
                    }
                    className="text-[10px]"
                  >
                    {t.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

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


function AnalystRightRail({
  analyst,
  memos,
  tasks,
}: {
  analyst: ApiAnalyst;
  memos: typeof mockMemos;
  tasks: typeof mockTasks;
}) {
  return (
    <div className="p-4 space-y-4">
      {analyst.current_focus && (
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Working on
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="spinner shrink-0" />
              <span className="font-medium">{analyst.current_focus}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Quick tasks
          </CardTitle>
          <CardDescription className="text-xs">
            Fire-and-forget; output flows into your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-1.5">
          <Button variant="outline" size="sm" className="w-full justify-start text-xs">
            <Download className="w-3 h-3" />
            Fetch latest 10-K
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start text-xs">
            <Download className="w-3 h-3" />
            Fetch latest 10-Q
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start text-xs">
            <LineChart className="w-3 h-3" />
            Yahoo snapshot
          </Button>
          <Button variant="default" size="sm" className="w-full justify-start text-xs">
            <FileText className="w-3 h-3" />
            Generate pitch memo
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start text-xs">
            <Plus className="w-3 h-3" />
            New task…
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Persona</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-5">
            {analyst.persona}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Recent work</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {memos.slice(0, 3).map((m) => (
            <div key={m.id} className="text-xs">
              <div className="font-medium truncate">{m.title}</div>
              <div className="text-muted-foreground">{m.date}</div>
            </div>
          ))}
          {tasks.slice(0, 2).map((t) => (
            <div
              key={t.id}
              className="text-xs flex items-center justify-between"
            >
              <span className="truncate">{t.description}</span>
              <Badge
                variant={
                  t.status === 'done'
                    ? 'success'
                    : t.status === 'running'
                      ? 'warning'
                      : 'secondary'
                }
                className="text-[9px] uppercase shrink-0"
              >
                {t.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
