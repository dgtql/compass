import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { Brain, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Dialog } from '@/components/ui/dialog';
import { ChatPane } from '@/components/ChatPane';
import {
  EngagementFilesRail,
  EngagementTasksRail,
} from '@/components/views/AnalystDetailView';
import {
  getAnalystDeliverables,
  getEngagementArtifact,
  type ApiAnalystDeliverable,
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
              // Idea-exploration tasks file under ``house`` with an
              // IDEA-<slug> ticker. Once we file the chat task with that
              // coverage_ticker, the live rails light up using the same
              // EngagementContext pipeline analysts use.
              const ticker = activeTask?.coverageTicker ?? null;
              const isIdea = ticker?.startsWith('IDEA-') ?? false;
              const analyst = isIdea ? HOUSE_SLUG : null;
              return [
                {
                  id: 'tasks',
                  label: 'Tasks',
                  content: <EngagementTasksRail ticker={ticker} />,
                },
                {
                  id: 'files',
                  label: 'Files',
                  content: analyst
                    ? <EngagementFilesRail analyst={analyst} ticker={ticker} />
                    : (
                      <div className="p-4 text-xs text-muted-foreground italic">
                        Open or start an idea-exploration task to browse its files here.
                      </div>
                    ),
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

// --- Deliverables tab ------------------------------------------------------

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

      <DeliverableViewer
        item={viewing}
        onClose={() => setViewing(null)}
      />
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
              <div
                className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-4 prose-headings:mb-2"
                dangerouslySetInnerHTML={{ __html: marked.parse(content, { gfm: true, breaks: false }) as string }}
              />
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

/** A flat list of every idea-exploration engagement and its task state.
 *  Right now we surface engagements (one row each); a future slice can
 *  expand to per-task drill-down. */
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

  // Group deliverables by ticker (= one engagement) so each row represents
  // one idea-exploration run rather than each individual memo file.
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
