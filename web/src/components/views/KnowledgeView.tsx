/**
 * KnowledgeView — interactive graph of the PM's research history.
 *
 * The graph is a derived view over ``data/engagements/`` (see
 * ``compass/graph_mem.py``). Four node kinds:
 *
 *   * memo    — a written deliverable (pitch, earnings, idea, …)
 *   * ticker  — a covered company (NVDA, MSFT, …)
 *   * theme   — a master-agent trading-idea exploration (IDEA-…)
 *   * analyst — who wrote the memo
 *
 * Four edge kinds:
 *
 *   * wrote     — analyst → memo (muted)
 *   * covers    — memo → ticker (blue)
 *   * explores  — memo → theme  (violet)
 *   * cites     — memo → memo   (orange, dashed) ← the interesting one
 *
 * The backend computes (x, y) coordinates with a clustered radial layout
 * so the frontend just renders. Selecting a node opens a detail panel on
 * the right; memos can be opened inline (full markdown view).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeProps,
  applyNodeChanges,
  Handle,
  Position,
  type NodeProps,
  MarkerType,
  BaseEdge,
  getSimpleBezierPath,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Loader2, FileText, Hash, User, Building2, X, ExternalLink, Quote } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getKnowledgeGraph,
  getEngagementArtifact,
  type ApiGraphNode,
  type ApiGraphEdge,
  type ApiKnowledgeGraph,
} from '@/lib/api';

// ---------------------------------------------------------------------------
// Color tokens — kept here so node + edge styling stays in sync
// ---------------------------------------------------------------------------

const KIND_TONE = {
  memo:    { bg: 'bg-card',                 border: 'border-amber-500/40',  text: 'text-foreground',                    accent: 'text-amber-600 dark:text-amber-400',  icon: FileText },
  ticker:  { bg: 'bg-sky-500/10',           border: 'border-sky-500/50',    text: 'text-sky-700 dark:text-sky-300',     accent: 'text-sky-600 dark:text-sky-400',      icon: Building2 },
  theme:   { bg: 'bg-violet-500/10',        border: 'border-violet-500/50', text: 'text-violet-700 dark:text-violet-300', accent: 'text-violet-600 dark:text-violet-400', icon: Hash },
  analyst: { bg: 'bg-muted',                border: 'border-border',        text: 'text-foreground',                    accent: 'text-muted-foreground',               icon: User },
} as const;

const EDGE_STROKE = {
  wrote:    'rgb(148 163 184 / 0.4)',     // slate-400/40
  covers:   'rgb(14 165 233 / 0.55)',     // sky-500/55
  explores: 'rgb(139 92 246 / 0.55)',     // violet-500/55
  cites:    'rgb(249 115 22 / 0.85)',     // orange-500/85 — louder; this is the interesting one
} as const;

// ---------------------------------------------------------------------------
// Custom node renderers
// ---------------------------------------------------------------------------

type KnowledgeNodeData = {
  node: ApiGraphNode;
  isSelected: boolean;
  isFocused: boolean;   // selected OR neighbor-of-selected (highlights the cluster)
  isDimmed: boolean;    // not on the selected node's neighborhood
};

function MemoNode({ data }: NodeProps<KnowledgeNodeData>) {
  const tone = KIND_TONE.memo;
  const memo = data.node;
  const memoType = memo.data.memo_type ?? 'memo';
  return (
    <div
      className={cn(
        'group relative w-[220px] rounded-lg border shadow-sm px-3 py-2 transition-all',
        tone.bg, tone.border,
        data.isSelected && 'ring-2 ring-amber-500 ring-offset-1 ring-offset-background',
        data.isDimmed && 'opacity-30',
        !data.isDimmed && 'hover:shadow-md',
      )}
      title={memo.title}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-1 !h-1" />
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
      <div className="flex items-start gap-2">
        <FileText className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', tone.accent)} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            {memoType}
          </div>
          <div className="text-xs font-medium leading-snug mt-0.5 line-clamp-2">
            {memo.label}
          </div>
        </div>
      </div>
    </div>
  );
}

function TickerNode({ data }: NodeProps<KnowledgeNodeData>) {
  const tone = KIND_TONE.ticker;
  return (
    <div
      className={cn(
        'relative rounded-full border-2 px-4 py-2 shadow-sm transition-all',
        tone.bg, tone.border, tone.text,
        data.isSelected && 'ring-2 ring-sky-500 ring-offset-2 ring-offset-background',
        data.isDimmed && 'opacity-30',
      )}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-1 !h-1" />
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
      <div className="flex items-center gap-1.5">
        <Building2 className={cn('w-3.5 h-3.5', tone.accent)} />
        <span className="text-sm font-mono font-semibold tracking-wide">{data.node.label}</span>
      </div>
    </div>
  );
}

function ThemeNode({ data }: NodeProps<KnowledgeNodeData>) {
  const tone = KIND_TONE.theme;
  return (
    <div
      className={cn(
        'relative rounded-md border-2 px-3 py-2 shadow-sm max-w-[220px] transition-all',
        tone.bg, tone.border, tone.text,
        data.isSelected && 'ring-2 ring-violet-500 ring-offset-1 ring-offset-background',
        data.isDimmed && 'opacity-30',
      )}
      title={data.node.title}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-1 !h-1" />
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
      <div className="flex items-center gap-1.5">
        <Hash className={cn('w-3.5 h-3.5 shrink-0', tone.accent)} />
        <span className="text-xs font-medium leading-tight line-clamp-2">{data.node.label}</span>
      </div>
    </div>
  );
}

function AnalystNode({ data }: NodeProps<KnowledgeNodeData>) {
  const tone = KIND_TONE.analyst;
  return (
    <div
      className={cn(
        'relative rounded-full border px-3 py-1.5 shadow-sm transition-all',
        tone.bg, tone.border, tone.text,
        data.isSelected && 'ring-2 ring-foreground/40 ring-offset-1 ring-offset-background',
        data.isDimmed && 'opacity-30',
      )}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-1 !h-1" />
      <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
      <div className="flex items-center gap-1.5">
        <User className={cn('w-3 h-3', tone.accent)} />
        <span className="text-[11px] font-medium">{data.node.label}</span>
      </div>
    </div>
  );
}

const NODE_TYPES = {
  memo: MemoNode,
  ticker: TickerNode,
  theme: ThemeNode,
  analyst: AnalystNode,
};

// ---------------------------------------------------------------------------
// Custom edge — colored by kind, dashed for ``cites``
// ---------------------------------------------------------------------------

function KnowledgeEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd,
}: EdgeProps<{ kind: ApiGraphEdge['kind']; dimmed?: boolean; focused?: boolean }>) {
  const kind = data?.kind ?? 'wrote';
  const dimmed = data?.dimmed ?? false;
  const focused = data?.focused ?? false;
  const [path] = getSimpleBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const stroke = EDGE_STROKE[kind];
  const isCite = kind === 'cites';
  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={{
        stroke,
        strokeWidth: focused ? 2.5 : isCite ? 1.6 : 1.2,
        strokeDasharray: isCite ? '6 4' : undefined,
        opacity: dimmed ? 0.06 : focused ? 1 : 0.65,
        transition: 'opacity 200ms, stroke-width 200ms',
      }}
    />
  );
}

const EDGE_TYPES = { knowledge: KnowledgeEdge };

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

type FilterState = {
  showTickers: boolean;
  showThemes: boolean;
  showAnalysts: boolean;
  showCites: boolean;
};

const DEFAULT_FILTERS: FilterState = {
  showTickers: true,
  showThemes: true,
  showAnalysts: true,
  showCites: true,
};

export function KnowledgeView() {
  const [graph, setGraph] = useState<ApiKnowledgeGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [query, setQuery] = useState('');
  const [nodes, setNodes] = useState<Node<KnowledgeNodeData>[]>([]);

  // --- fetch ---------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getKnowledgeGraph()
      .then((g) => { if (!cancelled) { setGraph(g); setError(null); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // --- visibility + selection neighborhood --------------------------------

  /** Set of node ids that should be visible given the current filter state. */
  const visibleIds = useMemo(() => {
    if (!graph) return new Set<string>();
    const ids = new Set<string>();
    const needle = query.trim().toLowerCase();
    for (const n of graph.nodes) {
      if (n.kind === 'ticker' && !filters.showTickers) continue;
      if (n.kind === 'theme' && !filters.showThemes) continue;
      if (n.kind === 'analyst' && !filters.showAnalysts) continue;
      if (needle) {
        const hay = (n.label + ' ' + n.title + ' ' + (n.data.first_paragraph ?? '')).toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      ids.add(n.id);
    }
    return ids;
  }, [graph, filters, query]);

  /** Neighborhood of selected node (1-hop, plus the selected node itself). */
  const neighborhood = useMemo(() => {
    if (!graph || !selectedId) return null;
    const hood = new Set<string>([selectedId]);
    for (const e of graph.edges) {
      if (e.source === selectedId) hood.add(e.target);
      if (e.target === selectedId) hood.add(e.source);
    }
    return hood;
  }, [graph, selectedId]);

  // --- rebuild reactflow nodes whenever inputs change ----------------------

  useEffect(() => {
    if (!graph) { setNodes([]); return; }
    const rfNodes: Node<KnowledgeNodeData>[] = graph.nodes
      .filter((n) => visibleIds.has(n.id))
      .map((n) => ({
        id: n.id,
        type: n.kind,
        position: { x: n.x, y: n.y },
        data: {
          node: n,
          isSelected: n.id === selectedId,
          isFocused: neighborhood?.has(n.id) ?? false,
          isDimmed: neighborhood ? !neighborhood.has(n.id) : false,
        },
        draggable: true,
        selectable: true,
      }));
    setNodes(rfNodes);
    // Note: we deliberately do *not* depend on `nodes` here to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, visibleIds, selectedId, neighborhood]);

  const edges: Edge[] = useMemo(() => {
    if (!graph) return [];
    return graph.edges
      .filter((e) => {
        if (e.kind === 'cites' && !filters.showCites) return false;
        // Drop edges whose endpoints are filtered out.
        return visibleIds.has(e.source) && visibleIds.has(e.target);
      })
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'knowledge',
        data: {
          kind: e.kind,
          focused: !!neighborhood && (neighborhood.has(e.source) && neighborhood.has(e.target)
                                       && (e.source === selectedId || e.target === selectedId)),
          dimmed: !!neighborhood && !(neighborhood.has(e.source) && neighborhood.has(e.target)),
        },
        markerEnd: e.kind === 'cites' ? { type: MarkerType.ArrowClosed, color: EDGE_STROKE.cites, width: 14, height: 14 } : undefined,
      }));
  }, [graph, visibleIds, filters.showCites, neighborhood, selectedId]);

  // --- callbacks -----------------------------------------------------------

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  const selectedNode = useMemo(() => {
    if (!graph || !selectedId) return null;
    return graph.nodes.find((n) => n.id === selectedId) ?? null;
  }, [graph, selectedId]);

  // Edges that touch the selected node, grouped by direction — used by the
  // side panel to render "Cites" / "Cited by" / "Related ideas" lists.
  const incidentEdges = useMemo(() => {
    if (!graph || !selectedId) return { outgoing: [], incoming: [] };
    return {
      outgoing: graph.edges.filter((e) => e.source === selectedId),
      incoming: graph.edges.filter((e) => e.target === selectedId),
    };
  }, [graph, selectedId]);

  // --- render --------------------------------------------------------------

  return (
    <div className="h-full flex flex-col">
      {/* Header: title + filter row */}
      <div className="border-b border-border px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Knowledge graph</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every memo, theme, and ticker on disk — connected.
            {graph && (
              <span className="ml-1.5">
                {graph.stats.memo_count} memos · {graph.stats.ticker_count} tickers ·
                {' '}{graph.stats.theme_count} themes ·
                {' '}{graph.stats.cite_count} cross-memo cites
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            className="h-8 px-3 text-xs rounded-md bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary w-44"
          />
          <FilterPill on={filters.showTickers} onToggle={() => setFilters((f) => ({ ...f, showTickers: !f.showTickers }))} icon={Building2} label="Tickers" tone="sky" />
          <FilterPill on={filters.showThemes} onToggle={() => setFilters((f) => ({ ...f, showThemes: !f.showThemes }))} icon={Hash} label="Themes" tone="violet" />
          <FilterPill on={filters.showAnalysts} onToggle={() => setFilters((f) => ({ ...f, showAnalysts: !f.showAnalysts }))} icon={User} label="Analysts" tone="slate" />
          <FilterPill on={filters.showCites} onToggle={() => setFilters((f) => ({ ...f, showCites: !f.showCites }))} icon={Quote} label="Cites" tone="orange" />
        </div>
      </div>

      {/* Canvas + side panel */}
      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative bg-muted/20">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading graph…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-destructive text-sm px-8 text-center">
              Failed to load graph: {error}
            </div>
          )}
          {!loading && !error && graph && graph.nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground text-sm text-center gap-2 px-8">
              <FileText className="w-8 h-8 opacity-50" />
              <div>No memos yet. Run a workflow from the Master agent or an analyst, then come back.</div>
            </div>
          )}
          {graph && graph.nodes.length > 0 && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodesChange={onNodesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              minZoom={0.15}
              maxZoom={2.0}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ type: 'knowledge' }}
            >
              <Background gap={20} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeStrokeWidth={2}
                nodeColor={(n: Node<KnowledgeNodeData>) => {
                  const k = n.data?.node?.kind;
                  if (k === 'memo') return 'rgb(245 158 11)';
                  if (k === 'ticker') return 'rgb(14 165 233)';
                  if (k === 'theme') return 'rgb(139 92 246)';
                  return 'rgb(148 163 184)';
                }}
                style={{ background: 'rgb(0 0 0 / 0.04)' }}
              />
              <LegendOverlay />
            </ReactFlow>
          )}
        </div>

        {/* Side panel */}
        <aside className="border-l border-border overflow-y-auto scrollbar-thin">
          {selectedNode ? (
            <NodeDetail
              node={selectedNode}
              graph={graph!}
              incoming={incidentEdges.incoming}
              outgoing={incidentEdges.outgoing}
              onSelectNode={setSelectedId}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <EmptyPanel stats={graph?.stats ?? null} />
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side panel: empty state + per-node detail
// ---------------------------------------------------------------------------

function EmptyPanel({ stats }: { stats: ApiKnowledgeGraph['stats'] | null }) {
  return (
    <div className="p-6 text-sm text-muted-foreground">
      <h3 className="text-foreground font-semibold mb-2">How to read this</h3>
      <ul className="space-y-2 text-xs leading-relaxed">
        <li className="flex items-start gap-2">
          <Building2 className="w-3.5 h-3.5 mt-0.5 text-sky-500 shrink-0" />
          <span><span className="text-sky-600 dark:text-sky-400 font-semibold">Tickers</span> are tradable names you've researched. The hub.</span>
        </li>
        <li className="flex items-start gap-2">
          <Hash className="w-3.5 h-3.5 mt-0.5 text-violet-500 shrink-0" />
          <span><span className="text-violet-600 dark:text-violet-400 font-semibold">Themes</span> are master-agent trading-idea explorations.</span>
        </li>
        <li className="flex items-start gap-2">
          <FileText className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
          <span><span className="text-amber-600 dark:text-amber-400 font-semibold">Memos</span> orbit the ticker / theme they belong to.</span>
        </li>
        <li className="flex items-start gap-2">
          <User className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <span><span className="text-foreground font-semibold">Analysts</span> sit in the inner ring, pointing at the memos they wrote.</span>
        </li>
        <li className="flex items-start gap-2">
          <Quote className="w-3.5 h-3.5 mt-0.5 text-orange-500 shrink-0" />
          <span><span className="text-orange-600 dark:text-orange-400 font-semibold">Orange dashed lines</span> are cross-memo citations — that's where ideas reuse prior work.</span>
        </li>
      </ul>
      {stats && (
        <div className="mt-6 pt-4 border-t border-border space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Library size</div>
          <div className="text-xs flex justify-between"><span>Memos</span><span className="font-mono">{stats.memo_count}</span></div>
          <div className="text-xs flex justify-between"><span>Tickers</span><span className="font-mono">{stats.ticker_count}</span></div>
          <div className="text-xs flex justify-between"><span>Themes</span><span className="font-mono">{stats.theme_count}</span></div>
          <div className="text-xs flex justify-between"><span>Analysts</span><span className="font-mono">{stats.analyst_count}</span></div>
          <div className="text-xs flex justify-between text-orange-600 dark:text-orange-400">
            <span>Cross-memo cites</span><span className="font-mono">{stats.cite_count}</span>
          </div>
        </div>
      )}
      <p className="mt-6 text-xs text-muted-foreground italic">Click a node for details.</p>
    </div>
  );
}

function NodeDetail({
  node, graph, incoming, outgoing, onSelectNode, onClose,
}: {
  node: ApiGraphNode;
  graph: ApiKnowledgeGraph;
  incoming: ApiGraphEdge[];
  outgoing: ApiGraphEdge[];
  onSelectNode: (id: string) => void;
  onClose: () => void;
}) {
  const lookupNode = (id: string) => graph.nodes.find((n) => n.id === id);

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {node.kind}
          </div>
          <h2 className="text-base font-semibold leading-snug mt-1 break-words">{node.title}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></Button>
      </div>

      {node.kind === 'memo' && <MemoDetailBody node={node} />}
      {node.kind === 'ticker' && <TickerDetailBody node={node} />}
      {node.kind === 'theme' && <ThemeDetailBody node={node} />}
      {node.kind === 'analyst' && <AnalystDetailBody node={node} />}

      {/* Connections — split by edge kind so the panel reads as a narrative. */}
      <ConnectionsBlock
        title="Cites"
        edges={outgoing.filter((e) => e.kind === 'cites')}
        directionLookup={(e) => lookupNode(e.target)}
        onSelectNode={onSelectNode}
        color="text-orange-600 dark:text-orange-400"
      />
      <ConnectionsBlock
        title="Cited by"
        edges={incoming.filter((e) => e.kind === 'cites')}
        directionLookup={(e) => lookupNode(e.source)}
        onSelectNode={onSelectNode}
        color="text-orange-600 dark:text-orange-400"
      />
      <ConnectionsBlock
        title="Covers / explores"
        edges={[...outgoing.filter((e) => e.kind === 'covers' || e.kind === 'explores'), ...incoming.filter((e) => e.kind === 'covers' || e.kind === 'explores')]}
        directionLookup={(e) => lookupNode(e.source === node.id ? e.target : e.source)}
        onSelectNode={onSelectNode}
      />
      <ConnectionsBlock
        title={node.kind === 'analyst' ? 'Wrote' : 'Author'}
        edges={[...outgoing.filter((e) => e.kind === 'wrote'), ...incoming.filter((e) => e.kind === 'wrote')]}
        directionLookup={(e) => lookupNode(e.source === node.id ? e.target : e.source)}
        onSelectNode={onSelectNode}
      />
    </div>
  );
}

function MemoDetailBody({ node }: { node: ApiGraphNode }) {
  const [content, setContent] = useState<string | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);

  const analyst = node.data.analyst ?? '';
  const engagement = node.data.engagement_key ?? '';
  const rel = node.data.rel_path ?? '';
  const isThemeEngagement = engagement.toUpperCase().startsWith('IDEA-');

  useEffect(() => {
    setContent(null); setBodyError(null);
  }, [node.id]);

  const onOpenInline = () => {
    if (content !== null || loadingBody) return;
    setLoadingBody(true);
    getEngagementArtifact(analyst, engagement, rel)
      .then((r) => setContent(r.content))
      .catch((e: Error) => setBodyError(e.message))
      .finally(() => setLoadingBody(false));
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase">{node.data.memo_type}</Badge>
          {node.data.modified_at && (
            <span>{new Date(node.data.modified_at * 1000).toLocaleString()}</span>
          )}
        </div>
        <div className="font-mono text-[10px] break-all opacity-70">
          {isThemeEngagement ? 'house' : analyst}/{engagement}/{rel}
        </div>
      </div>

      {node.data.first_paragraph && (
        <p className="text-xs leading-relaxed text-foreground/80">
          {node.data.first_paragraph}
          {node.data.first_paragraph.length === 280 && '…'}
        </p>
      )}

      {content === null ? (
        <Button size="sm" variant="outline" onClick={onOpenInline} disabled={loadingBody} className="w-full">
          {loadingBody ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
          {loadingBody ? 'Loading…' : 'Open memo'}
        </Button>
      ) : (
        <div className="max-h-[420px] overflow-y-auto scrollbar-thin rounded-md border border-border bg-background p-3">
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-sans">{content}</pre>
        </div>
      )}
      {bodyError && <div className="text-xs text-destructive">{bodyError}</div>}
    </div>
  );
}

function TickerDetailBody({ node }: { node: ApiGraphNode }) {
  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <div>
        <span className="font-mono text-base font-semibold text-sky-600 dark:text-sky-400">{node.data.ticker}</span>
      </div>
      <p>Click an orbiting memo to see what's been written. The same ticker may be covered by multiple analysts — they share this node.</p>
    </div>
  );
}

function ThemeDetailBody({ node }: { node: ApiGraphNode }) {
  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <div className="font-mono text-[10px] break-all opacity-70">{node.data.theme_key}</div>
      <p>Master-agent trading-idea exploration. Each theme produces a survey, an existing-memos inventory, and a trading-idea memo.</p>
    </div>
  );
}

function AnalystDetailBody({ node }: { node: ApiGraphNode }) {
  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <div className="font-mono text-[10px] opacity-70">{node.data.slug}</div>
      <p>Memos this analyst has authored, grouped below.</p>
    </div>
  );
}

function ConnectionsBlock({
  title, edges, directionLookup, onSelectNode, color,
}: {
  title: string;
  edges: ApiGraphEdge[];
  directionLookup: (e: ApiGraphEdge) => ApiGraphNode | undefined;
  onSelectNode: (id: string) => void;
  color?: string;
}) {
  if (edges.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className={cn('text-[10px] uppercase tracking-wider font-semibold', color ?? 'text-muted-foreground')}>
        {title} <span className="opacity-60">({edges.length})</span>
      </div>
      <ul className="space-y-1">
        {edges.map((e) => {
          const tgt = directionLookup(e);
          if (!tgt) return null;
          const Icon = KIND_TONE[tgt.kind].icon;
          return (
            <li key={e.id}>
              <button
                onClick={() => onSelectNode(tgt.id)}
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent/50 flex items-center gap-2 transition-colors"
              >
                <Icon className={cn('w-3 h-3 shrink-0', KIND_TONE[tgt.kind].accent)} />
                <span className="line-clamp-1">{tgt.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter pill + legend overlay
// ---------------------------------------------------------------------------

function FilterPill({
  on, onToggle, icon: Icon, label, tone,
}: {
  on: boolean;
  onToggle: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: 'sky' | 'violet' | 'slate' | 'orange';
}) {
  const onColor =
    tone === 'sky' ? 'bg-sky-500/10 border-sky-500/50 text-sky-700 dark:text-sky-300' :
    tone === 'violet' ? 'bg-violet-500/10 border-violet-500/50 text-violet-700 dark:text-violet-300' :
    tone === 'orange' ? 'bg-orange-500/10 border-orange-500/50 text-orange-700 dark:text-orange-300' :
    'bg-muted border-border text-foreground';
  return (
    <button
      onClick={onToggle}
      className={cn(
        'h-7 px-2.5 text-[11px] rounded-full border inline-flex items-center gap-1 transition-colors',
        on ? onColor : 'bg-transparent border-border text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

function LegendOverlay() {
  // Floating legend top-left so the canvas doesn't need a separate row.
  return (
    <div className="absolute top-3 left-3 z-10 rounded-md border border-border bg-background/90 backdrop-blur-sm p-2.5 text-[10px] space-y-1 shadow-sm">
      <LegendRow color={EDGE_STROKE.cites} label="cites" dashed />
      <LegendRow color={EDGE_STROKE.covers} label="covers" />
      <LegendRow color={EDGE_STROKE.explores} label="explores" />
      <LegendRow color={EDGE_STROKE.wrote} label="wrote" />
    </div>
  );
}

function LegendRow({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="22" height="6">
        <line
          x1="0" y1="3" x2="22" y2="3"
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
