/**
 * WorkflowDetailModal — visual DAG view of a planner template.
 *
 * Loads ``GET /api/templates/{name}/tasks`` and renders the result via
 * React Flow. Nodes are color-coded by stage (setup / ingest / analyze /
 * compose / maintain — matches the existing card phase colors). Edges
 * are the task ``depends_on`` arrows.
 *
 * v1 is visual-only:
 *
 *   * Drag nodes to lay them out — positions persist in ``localStorage``
 *     keyed by template name so the layout survives a re-open.
 *   * Click a node → right-side panel shows that task's full detail
 *     (skill, params, output path, dependencies).
 *   * Pan / zoom / minimap via React Flow's built-in controls.
 *
 * Editing (rewiring edges, adding/removing nodes, changing params) is
 * intentionally NOT here. Editing requires templates-as-manifests on the
 * backend — that's the next slice. The "Editor mode" affordance shows a
 * toast pointing at this fact.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeChange,
  applyNodeChanges,
  Handle,
  Position,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getTemplateTasks, type ApiTemplateTask } from '@/lib/api';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Template slug to render. Null = closed. */
  templateName: string | null;
  /** Display name shown in the header (e.g. "Full Pitch" for a pack
   *  workflow, falls back to the slug for generic templates). */
  displayName?: string;
};

/** The five stages we lay out, in order — same vocabulary the cards use. */
const STAGES = ['setup', 'ingest', 'analyze', 'compose', 'maintain'] as const;
type Stage = typeof STAGES[number];

/** Tailwind tone per stage. Matches the WorkflowsView card colors. */
const STAGE_TONE: Record<Stage, { dot: string; ring: string; label: string }> = {
  setup:    { dot: 'bg-muted-foreground',  ring: 'ring-muted-foreground/40',  label: 'text-muted-foreground' },
  ingest:   { dot: 'bg-sky-500',           ring: 'ring-sky-500/50',           label: 'text-sky-600 dark:text-sky-400' },
  analyze:  { dot: 'bg-violet-500',        ring: 'ring-violet-500/50',        label: 'text-violet-600 dark:text-violet-400' },
  compose:  { dot: 'bg-primary',           ring: 'ring-primary/50',           label: 'text-primary' },
  maintain: { dot: 'bg-emerald-500',       ring: 'ring-emerald-500/50',       label: 'text-emerald-600 dark:text-emerald-400' },
};

const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  STAGES.map((s, i) => [s, i]),
);

/** Layout constants — chosen to fit a couple of tasks per lane comfortably
 *  without auto-scrolling. The DAG fans out left→right by stage. */
const LANE_X = 260;       // horizontal stride per stage
const NODE_Y = 100;       // vertical stride within a lane
const ORIGIN_X = 40;
const ORIGIN_Y = 60;

const LS_KEY = (name: string) => `compass:workflow-layout:${name}`;

// ---------------------------------------------------------------------------
// Custom node component — a small card with stage chip + skill name
// ---------------------------------------------------------------------------

type TaskNodeData = {
  task: ApiTemplateTask;
  selected: boolean;
};

function TaskNode({ data, selected }: NodeProps<TaskNodeData>) {
  const stage = (data.task.stage as Stage) ?? 'setup';
  const tone = STAGE_TONE[stage] ?? STAGE_TONE.setup;
  return (
    <div
      className={cn(
        'relative bg-card border border-border rounded-lg shadow-sm w-[220px] px-3 py-2 transition-all',
        'hover:shadow-md',
        (selected || data.selected) && 'ring-2 ring-offset-1 ring-offset-background',
        (selected || data.selected) && tone.ring,
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn('w-1.5 h-1.5 rounded-full', tone.dot)} />
        <span className={cn('text-[9px] uppercase tracking-wider font-semibold', tone.label)}>
          {stage}
        </span>
      </div>
      <div className="text-xs font-medium leading-tight truncate" title={data.task.title}>
        {data.task.title}
      </div>
      <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate" title={data.task.skill}>
        {data.task.skill}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
    </div>
  );
}

const nodeTypes = { taskNode: TaskNode };

// ---------------------------------------------------------------------------
// Layout — bin tasks by stage and arrange in vertical lanes
// ---------------------------------------------------------------------------

function defaultLayout(tasks: ApiTemplateTask[]): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const byStage: Record<string, ApiTemplateTask[]> = {};
  for (const t of tasks) {
    const stage = STAGES.includes(t.stage as Stage) ? t.stage : 'compose';
    (byStage[stage] ||= []).push(t);
  }
  for (const stage of STAGES) {
    const lane = byStage[stage] ?? [];
    lane.forEach((task, idx) => {
      positions[task.id] = {
        x: ORIGIN_X + STAGE_INDEX[stage] * LANE_X,
        y: ORIGIN_Y + idx * NODE_Y,
      };
    });
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function WorkflowDetailModal({ open, onClose, templateName, displayName }: Props) {
  const [tasks, setTasks] = useState<ApiTemplateTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node<TaskNodeData>[]>([]);

  // ---- Esc to close --------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // ---- Fetch tasks when the template changes -------------------------------
  useEffect(() => {
    if (!open || !templateName) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTasks([]);
    setSelectedId(null);
    getTemplateTasks(templateName)
      .then((r) => { if (!cancelled) setTasks(r.tasks); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, templateName]);

  // ---- Build initial nodes + edges from tasks ------------------------------
  useEffect(() => {
    if (tasks.length === 0 || !templateName) {
      setNodes([]);
      return;
    }
    // Restore any saved positions; default-layout the rest.
    const layout = defaultLayout(tasks);
    let saved: Record<string, { x: number; y: number }> = {};
    try {
      const raw = window.localStorage.getItem(LS_KEY(templateName));
      if (raw) saved = JSON.parse(raw);
    } catch { /* ignore */ }

    setNodes(tasks.map((t) => ({
      id: t.id,
      type: 'taskNode',
      position: saved[t.id] ?? layout[t.id] ?? { x: 0, y: 0 },
      data: { task: t, selected: false },
    })));
  }, [tasks, templateName]);

  // ---- Edges derived from depends_on (no state — recompute each render) ----
  const edges: Edge[] = useMemo(() => {
    const out: Edge[] = [];
    for (const t of tasks) {
      for (const dep of t.depends_on) {
        out.push({
          id: `${dep}->${t.id}`,
          source: dep,
          target: t.id,
          type: 'smoothstep',
          animated: false,
          style: { stroke: 'hsl(var(--muted-foreground))', strokeOpacity: 0.5 },
        });
      }
    }
    return out;
  }, [tasks]);

  // ---- Node drag — persist positions to localStorage -----------------------
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => {
      const next = applyNodeChanges(changes, prev);
      // After any position change, persist the full layout.
      const dragged = changes.some((c) => c.type === 'position');
      if (dragged && templateName) {
        const positions: Record<string, { x: number; y: number }> = {};
        next.forEach((n) => { positions[n.id] = { x: n.position.x, y: n.position.y }; });
        try {
          window.localStorage.setItem(LS_KEY(templateName), JSON.stringify(positions));
        } catch { /* ignore quota / disabled storage */ }
      }
      return next;
    });
  }, [templateName]);

  // ---- Selected task lookup ------------------------------------------------
  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedId) ?? null,
    [tasks, selectedId],
  );

  // ---- Reflect selection on nodes so the custom node can ring itself -------
  const decoratedNodes = useMemo(
    () => nodes.map((n) => ({
      ...n,
      data: { ...n.data, selected: n.id === selectedId },
    })),
    [nodes, selectedId],
  );

  // ---- Reset layout to defaults --------------------------------------------
  const resetLayout = useCallback(() => {
    if (!templateName) return;
    try { window.localStorage.removeItem(LS_KEY(templateName)); } catch { /* ignore */ }
    const layout = defaultLayout(tasks);
    setNodes(tasks.map((t) => ({
      id: t.id,
      type: 'taskNode',
      position: layout[t.id] ?? { x: 0, y: 0 },
      data: { task: t, selected: false },
    })));
  }, [tasks, templateName]);

  if (!open || !templateName) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative w-full max-w-6xl h-[85vh] bg-card text-card-foreground rounded-lg border border-border shadow-lg flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight truncate">
              {displayName || templateName}
            </h2>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
              {templateName} · {tasks.length} task{tasks.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-[10px]">view only</Badge>
            <Button variant="outline" size="sm" onClick={resetLayout} disabled={tasks.length === 0}>
              Reset layout
            </Button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body — flow on the left, optional detail panel on the right */}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 relative">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/40 z-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-3 max-w-md">
                  <strong>Couldn't load template:</strong> {error}
                </div>
              </div>
            )}
            {!loading && !error && tasks.length > 0 && (
              <ReactFlow
                nodes={decoratedNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onNodeClick={(_, n) => setSelectedId(n.id)}
                onPaneClick={() => setSelectedId(null)}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                nodesDraggable
                nodesConnectable={false}
                edgesUpdatable={false}
                edgesFocusable={false}
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={20} size={1} className="!bg-muted/30" />
                <Controls
                  showInteractive={false}
                  className="!bg-card !border-border !shadow-sm"
                />
                <MiniMap
                  pannable
                  zoomable
                  nodeStrokeWidth={2}
                  className="!bg-card !border !border-border !rounded-md"
                />
              </ReactFlow>
            )}

            {/* Footer tip — clarify that editing isn't wired yet */}
            <div className="absolute bottom-2 left-2 right-2 pointer-events-none flex justify-center">
              <div className="text-[10px] text-muted-foreground bg-card/90 border border-border rounded px-2 py-1 backdrop-blur-sm">
                Drag nodes to lay them out · click a node for detail · editing the pipeline shape lands with manifest templates
              </div>
            </div>
          </div>

          {/* Right detail panel */}
          {selectedTask && (
            <aside className="w-[300px] shrink-0 border-l border-border overflow-y-auto scrollbar-thin bg-background/40">
              <NodeDetail task={selectedTask} onClose={() => setSelectedId(null)} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node detail side panel
// ---------------------------------------------------------------------------

function NodeDetail({ task, onClose }: { task: ApiTemplateTask; onClose: () => void }) {
  const stage = (task.stage as Stage) ?? 'setup';
  const tone = STAGE_TONE[stage] ?? STAGE_TONE.setup;
  const hasParams = task.params && Object.keys(task.params).length > 0;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={cn('w-1.5 h-1.5 rounded-full', tone.dot)} />
            <span className={cn('text-[9px] uppercase tracking-wider font-semibold', tone.label)}>
              {stage}
            </span>
          </div>
          <h3 className="text-sm font-semibold leading-tight">{task.title}</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
          aria-label="Close detail"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <Field label="Task id">
        <code className="text-[11px] font-mono">{task.id}</code>
      </Field>

      <Field label="Skill">
        <code className="text-[11px] font-mono">{task.skill}</code>
      </Field>

      {task.description && (
        <Field label="Description">
          <p className="text-[11px] text-foreground/80 leading-relaxed">{task.description}</p>
        </Field>
      )}

      {hasParams && (
        <Field label="Params">
          <pre className="text-[10px] font-mono bg-muted/40 rounded-md p-2 border border-border overflow-x-auto">
            {JSON.stringify(task.params, null, 2)}
          </pre>
        </Field>
      )}

      {task.artifact_path && (
        <Field label="Output">
          <code className="text-[10px] font-mono block break-all">{task.artifact_path}</code>
        </Field>
      )}

      <Field label="Depends on">
        {task.depends_on.length === 0 ? (
          <span className="text-[11px] italic text-muted-foreground">— (root)</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {task.depends_on.map((dep) => (
              <code
                key={dep}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              >
                {dep}
              </code>
            ))}
          </div>
        )}
      </Field>

      <Field label="Priority · Type">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{task.priority}</Badge>
          <Badge variant="outline" className="text-[10px]">{task.task_type}</Badge>
        </div>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      {children}
    </div>
  );
}
