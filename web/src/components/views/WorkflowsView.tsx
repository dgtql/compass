/**
 * Workflows — read-only catalog of planner templates.
 *
 * Reads ``GET /api/templates/detail`` and renders one card per template.
 * Two visible groups: **generic** (pitch-memo / earnings-reaction /
 * maintenance-refresh / deep-dive — no owning pack) and **persona-bound**
 * (everything emitted by a pack: buffett-pitch, munger-pitch, …).
 *
 * Intentionally no "Run" button — runs still go through chat or the Hire
 * flow. This is a catalog so the PM can see what pipelines exist and
 * what each one does without spelunking through the planner code.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Workflow as WorkflowIcon, Loader2, Sparkles, GitBranch, FileOutput,
  LayoutGrid, BookOpen, BarChart3, FileText, Wrench,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getWorkflows, type ApiWorkflow } from '@/lib/api';

const PHASE_ICON: Record<ApiWorkflow['phases'][number], React.ComponentType<{ className?: string }>> = {
  setup:    LayoutGrid,
  ingest:   BookOpen,
  analyze:  BarChart3,
  compose:  FileText,
  maintain: Wrench,
};

const PHASE_TONE: Record<ApiWorkflow['phases'][number], string> = {
  setup:    'text-muted-foreground',
  ingest:   'text-sky-500',
  analyze:  'text-violet-500',
  compose:  'text-primary',
  maintain: 'text-emerald-500',
};

export function WorkflowsView() {
  const [workflows, setWorkflows] = useState<ApiWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWorkflows()
      .then((r) => { if (!cancelled) setWorkflows(r.workflows); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const { generic, byPack } = useMemo(() => {
    const generic: ApiWorkflow[] = [];
    const byPack: Record<string, ApiWorkflow[]> = {};
    for (const wf of workflows) {
      if (!wf.pack_id) {
        generic.push(wf);
      } else {
        (byPack[wf.pack_id] = byPack[wf.pack_id] ?? []).push(wf);
      }
    }
    return { generic, byPack };
  }, [workflows]);

  return (
    <div className="overflow-y-auto scrollbar-thin h-full">
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <WorkflowIcon className="w-5 h-5 text-primary" /> Workflows
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading
              ? 'Loading…'
              : `${workflows.length} pipeline${workflows.length === 1 ? '' : 's'} available.
                  ${generic.length} generic, ${workflows.length - generic.length} persona-bound.`}
          </p>
          <p className="text-[11px] text-muted-foreground italic mt-1">
            Catalog view — to run, start from chat or hire an analyst whose pack carries the workflow.
          </p>
        </div>

        {error && (
          <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-2">
            Couldn't load workflows: {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {generic.length > 0 && (
              <section className="space-y-3">
                <SectionHeader
                  title="Generic"
                  subtitle="Persona-agnostic templates. Reach these from chat with a non-pack analyst, or from the CLI."
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {generic.map((wf) => (
                    <WorkflowCard key={wf.name} wf={wf} />
                  ))}
                </div>
              </section>
            )}

            {Object.entries(byPack).map(([packId, packWorkflows]) => (
              <section key={packId} className="space-y-3">
                <SectionHeader
                  title={packWorkflows[0]?.pack_name ?? packId}
                  subtitle={`Workflows from the ${packId} pack. Hire the persona from Talent pool to use them.`}
                  badge={packId}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {packWorkflows.map((wf) => (
                    <WorkflowCard key={wf.name} wf={wf} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  title, subtitle, badge,
}: { title: string; subtitle: string; badge?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {badge && (
          <Badge variant="default" className="text-[10px] gap-1">
            <Sparkles className="w-2.5 h-2.5" />
            {badge}
          </Badge>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  );
}

function WorkflowCard({ wf }: { wf: ApiWorkflow }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm truncate">{wf.display_name}</CardTitle>
            <CardDescription className="text-[10px] font-mono mt-0.5 truncate">
              {wf.name}
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-[10px] tabular-nums shrink-0">
            {wf.task_count} task{wf.task_count === 1 ? '' : 's'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-2.5 text-xs">
        {wf.description && (
          <p className="text-muted-foreground leading-relaxed line-clamp-3">
            {wf.description}
          </p>
        )}

        {/* Phases — coloured pills showing which stages this template hits */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
            Phases
          </span>
          {wf.phases.map((p) => {
            const Icon = PHASE_ICON[p];
            return (
              <span
                key={p}
                className={cn(
                  'inline-flex items-center gap-0.5 text-[10px] capitalize',
                  PHASE_TONE[p],
                )}
              >
                <Icon className="w-2.5 h-2.5" />
                {p}
              </span>
            );
          })}
        </div>

        {/* Skills — bounded list so a 19-task deep-dive doesn't blow up the card */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mr-1 flex items-center gap-1">
            <GitBranch className="w-2.5 h-2.5" /> Skills
          </span>
          {wf.skills.slice(0, 6).map((s) => (
            <span
              key={s}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
            >
              {s}
            </span>
          ))}
          {wf.skills.length > 6 && (
            <span className="text-[10px] text-muted-foreground">+{wf.skills.length - 6}</span>
          )}
        </div>

        {wf.final_output && (
          <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground mt-auto pt-2 border-t border-border">
            <FileOutput className="w-3 h-3 shrink-0 mt-0.5 text-primary" />
            <code className="font-mono break-all">{wf.final_output}</code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
