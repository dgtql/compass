import { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain, Check, Loader2, X, AlertCircle, FileText } from 'lucide-react';
import { CitedMarkdown } from '@/components/markdown/CitedMarkdown';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Dialog } from '@/components/ui/dialog';
import { ChatPane } from '@/components/ChatPane';
import {
  getAnalystDeliverables,
  getEngagementArtifact,
  getEngagementFiles,
  getEngagementTasks,
  getJson,
  type ApiAnalystDeliverable,
  type ApiEngagementFile,
  type ApiEngagementTask,
} from '@/lib/api';
import { cn } from '@/lib/utils';

type Tab = 'chat' | 'deliverables' | 'tasks' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'deliverables', label: 'Deliverables' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'profile', label: 'Profile' },
];

/** Synthetic analyst slug all master-agent idea-exploration engagements
 *  land under. Mirrors ``compass.chat_skills.HOUSE_ANALYST_SLUG``. */
const HOUSE_SLUG = 'house';

/** Polling cadence for the right-rail tasks/files panes. Fast enough that
 *  the PM sees task transitions live during a run; slow enough we don't
 *  hammer the API. */
const RAIL_POLL_MS = 2500;

type EngagementListItem = {
  analyst: string;
  ticker: string;
  modified_at: number;
};

export function MasterAgentView() {
  const [tab, setTab] = useState<Tab>('chat');

  return (
    <div className="h-full flex flex-col">
      {/* Header (matches AnalystDetailView's compact header + tab bar) */}
      <div className="px-8 pt-5 pb-3 border-b border-border bg-background/60">
        <div className="flex items-start gap-3">
          <Avatar initials="MA" color="cyan" size="md" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Master agent</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              The PM's right hand. Reads everything; routes work; synthesizes across analysts.
            </p>
          </div>
        </div>

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
                    : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-accent/50',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {tab === 'chat' && (
          <ChatPane
            ownerKey="master"
            counterparty={{ initials: 'MA', color: 'cyan' }}
            counterpartyName="the master agent"
            placeholder="Ask the master agent anything — your pod, your memos, your notes."
            rightRailTabs={({ activeTask }) => {
              // Engagement scoping rule: if the active chat task carries
              // a coverage ticker that starts with IDEA-, that's the
              // engagement we render. Otherwise fall back to the most
              // recently modified ``house`` engagement on disk — handy
              // when the chat task pre-dated the coverage_ticker fix or
              // when the PM is browsing without a fresh active session.
              const ticker = activeTask?.coverageTicker ?? null;
              const pinned = ticker?.startsWith('IDEA-') ? ticker : null;
              return [
                {
                  id: 'tasks',
                  label: 'Tasks',
                  content: <HouseTasksRail pinnedTicker={pinned} />,
                },
                {
                  id: 'files',
                  label: 'Files',
                  content: <HouseFilesRail pinnedTicker={pinned} />,
                },
              ];
            }}
          />
        )}

        {tab === 'deliverables' && <DeliverablesPanel />}
        {tab === 'tasks' && <PodTasksPanel />}

        {tab === 'profile' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-3xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  What the master agent does
                </CardTitle>
                <CardDescription>
                  The PM's right hand — not a single-ticker analyst.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-2">
                <p>• Synthesize across analysts (morning brief, week-in-review).</p>
                <p>• Route ideas to the analyst best positioned to research them.</p>
                <p>• Read your knowledge base; pull relevant notes into answers.</p>
                <p>• Generate trading ideas from a theme — open-web or academic survey.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Right-rail rails (direct-poll, no EngagementContext) ------------------

/** Resolve which house engagement the right rail should render.
 *
 *  Precedence:
 *  1. ``pinnedTicker`` (when the active chat task carries an IDEA-* slug)
 *  2. The most recently modified ``house`` engagement on disk
 *  3. None (rails show a friendly empty state)
 *
 *  We re-poll the engagement list every few seconds so kicking off a new
 *  trading-idea run replaces the pin within a tick.
 */
function useResolvedHouseTicker(pinnedTicker: string | null): string | null {
  const [fallback, setFallback] = useState<string | null>(null);

  useEffect(() => {
    if (pinnedTicker) return; // pin wins; no need to poll
    let cancelled = false;
    const tick = async () => {
      try {
        const list = await getJson<EngagementListItem[]>('/api/engagements');
        if (cancelled) return;
        const house = list
          .filter((e) => e.analyst === HOUSE_SLUG)
          .sort((a, b) => (b.modified_at ?? 0) - (a.modified_at ?? 0));
        setFallback(house[0]?.ticker ?? null);
      } catch {
        // non-fatal — keep last value
      }
    };
    tick();
    const id = window.setInterval(tick, RAIL_POLL_MS * 2);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [pinnedTicker]);

  return pinnedTicker ?? fallback;
}

/** Tasks rail (right side of master-agent chat). Polls
 *  ``/api/engagements/house/<ticker>/tasks`` directly so we don't depend
 *  on the chat task carrying a coverage_ticker. */
function HouseTasksRail({ pinnedTicker }: { pinnedTicker: string | null }) {
  const ticker = useResolvedHouseTicker(pinnedTicker);
  const [tasks, setTasks] = useState<ApiEngagementTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!ticker) {
      setTasks([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await getEngagementTasks(HOUSE_SLUG, ticker);
      setTasks(r.tasks);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await getEngagementTasks(HOUSE_SLUG, ticker);
        if (!cancelled) setTasks(r.tasks);
      } catch {
        /* swallow — keep last */
      }
    };
    tick();
    const id = window.setInterval(tick, RAIL_POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [ticker]);

  if (!ticker) {
    return (
      <div className="p-4 text-xs text-muted-foreground italic">
        Start a Trading-idea or Academic-survey run to see live task progress here.
      </div>
    );
  }

  const inProgress = tasks.filter((t) => t.status === 'in-progress').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const errored = tasks.filter((t) => t.status === 'error');

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {ticker} · {tasks.length} tasks
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {done} done · {inProgress} running
            {errored.length > 0 && ` · ${errored.length} errored`}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} className="h-6 px-2 text-[10px]">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      {tasks.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">
          {loading ? 'Loading…' : 'No tasks planned yet.'}
        </div>
      ) : (
        <ol className="space-y-1.5">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0">{statusGlyph(t.status)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    {t.stage}
                  </span>
                  <span className="font-medium truncate" title={t.title}>{t.title}</span>
                </div>
                <div className="text-[9px] text-muted-foreground font-mono truncate">
                  {t.skill}
                  {t.started_at && t.finished_at && ` · ${fmtDuration(t.started_at, t.finished_at)}`}
                </div>
                {t.status === 'error' && t.error && (
                  <code className="text-[9px] text-rose-500 line-clamp-2 block mt-0.5">{t.error}</code>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {error && <div className="text-[10px] text-rose-500">{error}</div>}
    </div>
  );
}

/** Files rail. Polls the engagement's files endpoint; click a row opens
 *  the artifact viewer modal (markdown gets CitedMarkdown). */
function HouseFilesRail({ pinnedTicker }: { pinnedTicker: string | null }) {
  const ticker = useResolvedHouseTicker(pinnedTicker);
  const [files, setFiles] = useState<ApiEngagementFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<ApiEngagementFile | null>(null);

  useEffect(() => {
    if (!ticker) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      setLoading(true);
      try {
        const r = await getEngagementFiles(HOUSE_SLUG, ticker);
        if (!cancelled) setFiles(r.files);
      } catch {
        /* swallow */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    tick();
    const id = window.setInterval(tick, RAIL_POLL_MS * 2);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [ticker]);

  if (!ticker) {
    return (
      <div className="p-4 text-xs text-muted-foreground italic">
        Start a run to populate research files here.
      </div>
    );
  }

  // Group by category, newest-first within group, output groups on top.
  const groups = new Map<string, ApiEngagementFile[]>();
  for (const f of files) {
    const arr = groups.get(f.category) ?? [];
    arr.push(f);
    groups.set(f.category, arr);
  }
  const orderedGroups = Array.from(groups.entries()).sort(([, a], [, b]) => {
    const aOut = a.some((f) => f.is_output) ? 0 : 1;
    const bOut = b.some((f) => f.is_output) ? 0 : 1;
    if (aOut !== bOut) return aOut - bOut;
    const an = Math.max(...a.map((f) => f.modified_at));
    const bn = Math.max(...b.map((f) => f.modified_at));
    return bn - an;
  });

  return (
    <div className="p-4 space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
        <span>{ticker} · {files.length} files</span>
        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>

      {files.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No files yet.</div>
      ) : (
        <div className="space-y-3">
          {orderedGroups.map(([category, items]) => (
            <section key={category}>
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 flex items-center gap-1.5">
                <span>{category}</span>
                {items.some((f) => f.is_output) && (
                  <span className="text-[9px] px-1.5 py-0 rounded bg-primary/10 text-primary normal-case tracking-normal font-medium">
                    output
                  </span>
                )}
              </h4>
              <ul className="space-y-1">
                {items.map((f) => (
                  <li
                    key={f.path}
                    onClick={() => setViewing(f)}
                    className="text-[11px] rounded border border-border hover:border-primary/50 hover:bg-accent/30 px-2 py-1.5 cursor-pointer"
                  >
                    <div className="font-medium truncate flex items-center gap-1">
                      <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                      {f.name}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <code className="text-[9px] text-muted-foreground truncate">{f.path}</code>
                      <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums">
                        {fmtBytes(f.size)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <FileViewer ticker={ticker} item={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function FileViewer({
  ticker,
  item,
  onClose,
}: {
  ticker: string;
  item: ApiEngagementFile | null;
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
    getEngagementArtifact(HOUSE_SLUG, ticker, item.path)
      .then((r) => { if (!cancelled) setContent(r.content); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item, ticker]);

  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title={item ? `${ticker} · ${item.category}` : ''}
      maxWidth="max-w-4xl"
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
            {content !== null && item.path.toLowerCase().endsWith('.md') && (
              <CitedMarkdown content={content} />
            )}
            {content !== null && !item.path.toLowerCase().endsWith('.md') && (
              <pre className="text-xs whitespace-pre-wrap font-mono">{content}</pre>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

// --- Deliverables tab (top-level, not the right rail) ----------------------

/** Lists every memo the master agent has produced (all live under the
 *  synthetic ``house`` analyst). Newest first; click → open in a modal. */
function DeliverablesPanel() {
  const [items, setItems] = useState<ApiAnalystDeliverable[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<ApiAnalystDeliverable | null>(null);

  const refresh = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const r = await getAnalystDeliverables(HOUSE_SLUG);
        setItems(r.deliverables);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">Deliverables</h2>
          <p className="text-xs text-muted-foreground">
            Master-agent outputs — trading-idea memos, morning briefs, syntheses.
            Newest first.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Refresh
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground italic mt-8 text-center">
          {loading ? 'Loading…' : 'No deliverables yet. Click "Trading idea" on the Chat tab to start one.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((d) => (
            <li
              key={`${d.ticker}/${d.path}`}
              onClick={() => setViewing(d)}
              className="rounded-md border border-border bg-card p-3 hover:shadow-sm hover:border-primary/40 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0">{d.ticker}</Badge>
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
      )}

      <DeliverableViewer item={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function DeliverableViewer({
  item,
  onClose,
}: {
  item: ApiAnalystDeliverable | null;
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
    getEngagementArtifact(HOUSE_SLUG, item.ticker, item.path)
      .then((r) => { if (!cancelled) setContent(r.content); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item]);

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
          <div className="border-t border-border pt-3 max-h-[70vh] overflow-y-auto scrollbar-thin">
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            )}
            {error && <div className="text-xs text-rose-500">{error}</div>}
            {content !== null && item.path.toLowerCase().endsWith('.md') && (
              <CitedMarkdown content={content} />
            )}
            {content !== null && !item.path.toLowerCase().endsWith('.md') && (
              <pre className="text-xs whitespace-pre-wrap font-mono">{content}</pre>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

// --- Pod tasks tab ---------------------------------------------------------

/** Top-level Tasks tab — one row per master-agent engagement. */
function PodTasksPanel() {
  const [items, setItems] = useState<ApiAnalystDeliverable[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAnalystDeliverables(HOUSE_SLUG)
      .then((r) => { if (!cancelled) setItems(r.deliverables); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const byTicker = new Map<string, ApiAnalystDeliverable[]>();
    for (const d of items) {
      const arr = byTicker.get(d.ticker) ?? [];
      arr.push(d);
      byTicker.set(d.ticker, arr);
    }
    return Array.from(byTicker.entries())
      .map(([ticker, deliverables]) => ({
        ticker,
        deliverables,
        latest: Math.max(...deliverables.map((d) => d.modified_at)),
      }))
      .sort((a, b) => b.latest - a.latest);
  }, [items]);

  return (
    <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-5xl mx-auto">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">Tasks</h2>
        <p className="text-xs text-muted-foreground">
          One row per master-agent engagement (idea-exploration runs land under
          a synthetic ``house`` analyst on disk).
        </p>
      </div>
      {grouped.length === 0 ? (
        <div className="text-sm text-muted-foreground italic mt-8 text-center">
          {loading ? 'Loading…' : 'No master-agent engagements yet.'}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {grouped.map(({ ticker, deliverables, latest }) => (
            <li
              key={ticker}
              className="rounded-md border border-border p-3"
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <Badge variant="outline" className="text-[10px] font-mono">{ticker}</Badge>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {fmtRelative(latest * 1000)}
                </span>
              </div>
              <div className="text-sm font-medium">
                {deliverables.length} deliverable{deliverables.length === 1 ? '' : 's'}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {deliverables.map((d) => d.name).join(' · ')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- formatting helpers ----------------------------------------------------

function statusGlyph(status: ApiEngagementTask['status']) {
  switch (status) {
    case 'done':         return <Check className="w-3 h-3 text-emerald-500" />;
    case 'in-progress':  return <Loader2 className="w-3 h-3 text-primary animate-spin" />;
    case 'error':        return <X className="w-3 h-3 text-rose-500" />;
    case 'review':       return <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block mt-1" />;
    case 'cancelled':    return <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 inline-block mt-1" />;
    default:             return <span className="w-1.5 h-1.5 rounded-full border border-muted-foreground/50 inline-block mt-1" />;
  }
}

function fmtDuration(startedIso: string, finishedIso: string): string {
  const ms = new Date(finishedIso).getTime() - new Date(startedIso).getTime();
  if (Number.isNaN(ms) || ms <= 0) return '';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${(s / 60).toFixed(1)}m`;
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

// AlertCircle is referenced indirectly by some imports — keep the import so
// future error states don't ship without an icon, and so tree-shaking
// doesn't rewrite the bundle on a follow-up edit.
void AlertCircle;
