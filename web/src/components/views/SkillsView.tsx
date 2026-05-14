import { useEffect, useMemo, useState } from 'react';
import {
  Library, FileText, BookOpen, BarChart3, Workflow, Plus, LayoutGrid,
  Sparkles, Loader2, Cpu,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getSkills, type ApiSkill } from '@/lib/api';
import { AuthorSkillModal } from '@/components/AuthorSkillModal';
import { SkillDetailModal } from '@/components/SkillDetailModal';

/** Map the backend's ``phase`` to a human-friendly category label + icon.
 *  We keep the same five categories the original mock-driven view used so
 *  the filter row UX is unchanged. */
const PHASE_LABEL = {
  setup:    'Planner',
  ingest:   'Ingestion',
  analyze:  'Analysis',
  compose:  'Memo',
  maintain: 'Workflow',
} as const satisfies Record<ApiSkill['phase'], string>;

const PHASE_ICON: Record<ApiSkill['phase'], React.ComponentType<{ className?: string }>> = {
  setup:    LayoutGrid,
  ingest:   BookOpen,
  analyze:  BarChart3,
  compose:  FileText,
  maintain: Workflow,
};

const PHASE_ORDER: ApiSkill['phase'][] = ['setup', 'ingest', 'analyze', 'compose', 'maintain'];

type FilterPhase = ApiSkill['phase'] | 'all';
type FilterRunner = ApiSkill['runner'] | 'all';

export function SkillsView() {
  const [skills, setSkills] = useState<ApiSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<FilterPhase>('all');
  const [runner, setRunner] = useState<FilterRunner>('all');
  const [authorOpen, setAuthorOpen] = useState(false);
  /** Slug of the skill currently being viewed in the detail modal, or null. */
  const [detailSlug, setDetailSlug] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    setError(null);
    getSkills()
      .then(setSkills)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  // Person-skills (the ones bundled into a persona pack like Buffett or
  // Munger) live in the People tab, not here. The Skills library is the
  // utility-building-blocks catalog: brief authors, ingest fetchers, etc.
  const utilitySkills = useMemo(
    () => skills.filter((s) => s.in_packs.length === 0),
    [skills],
  );

  const filtered = useMemo(() => {
    return utilitySkills.filter((s) => {
      if (phase !== 'all' && s.phase !== phase) return false;
      if (runner !== 'all' && s.runner !== runner) return false;
      return true;
    });
  }, [utilitySkills, phase, runner]);

  const stats = useMemo(() => {
    const counts: Record<ApiSkill['phase'], number> = {
      setup: 0, ingest: 0, analyze: 0, compose: 0, maintain: 0,
    };
    utilitySkills.forEach((s) => { counts[s.phase]++; });
    return counts;
  }, [utilitySkills]);

  const personSkillCount = skills.length - utilitySkills.length;

  return (
    <div className="overflow-y-auto scrollbar-thin h-full">
      <div className="p-8 max-w-6xl mx-auto space-y-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Library className="w-5 h-5 text-primary" /> Skills library
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {loading
                ? 'Loading…'
                : `${utilitySkills.length} utility skill${utilitySkills.length === 1 ? '' : 's'}. `
                  + PHASE_ORDER
                    .filter((p) => stats[p] > 0)
                    .map((p) => `${stats[p]} ${PHASE_LABEL[p].toLowerCase()}`)
                    .join(' · ')}
            </p>
            {personSkillCount > 0 && (
              <p className="text-[11px] text-muted-foreground italic mt-0.5">
                {personSkillCount} persona skill{personSkillCount === 1 ? '' : 's'} live under the <strong>Talent pool</strong> tab.
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setAuthorOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            Author a skill
          </Button>
        </div>

        {error && (
          <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-2">
            Couldn't load skills: {error}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
            Phase
          </span>
          {(['all', ...PHASE_ORDER] as FilterPhase[]).map((p) => (
            <button
              key={p}
              onClick={() => setPhase(p)}
              className={cn(
                'text-xs px-2 py-1 rounded-md font-medium transition-colors capitalize',
                phase === p
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent',
              )}
            >
              {p === 'all' ? 'All' : PHASE_LABEL[p]}
            </button>
          ))}
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold ml-3 mr-1">
            Runner
          </span>
          {(['all', 'agent', 'deterministic'] as FilterRunner[]).map((r) => (
            <button
              key={r}
              onClick={() => setRunner(r)}
              className={cn(
                'text-xs px-2 py-1 rounded-md font-medium transition-colors capitalize',
                runner === r
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent',
              )}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading skills…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">
            No skills match the current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <SkillCard
                key={s.slug}
                skill={s}
                onOpen={() => setDetailSlug(s.slug)}
              />
            ))}
          </div>
        )}
      </div>

      <AuthorSkillModal
        open={authorOpen}
        onClose={() => setAuthorOpen(false)}
        onCreated={() => reload()}
      />
      <SkillDetailModal
        open={detailSlug !== null}
        onClose={() => setDetailSlug(null)}
        slug={detailSlug}
      />
    </div>
  );
}

function SkillCard({ skill: s, onOpen }: { skill: ApiSkill; onOpen: () => void }) {
  const Icon = PHASE_ICON[s.phase];
  return (
    <Card
      className="flex flex-col cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/30"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div>
              <CardTitle className="text-sm">{s.name}</CardTitle>
              <CardDescription className="text-[10px] uppercase tracking-wider mt-0.5">
                {PHASE_LABEL[s.phase]} · {s.runner}
              </CardDescription>
            </div>
          </div>
          {s.in_packs.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-end">
              {s.in_packs.map((packId) => (
                <Badge key={packId} variant="default" className="text-[10px] gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  {packId}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
          {s.description}
        </p>

        {/* needs (inputs) + output (the deliverable) */}
        {(s.needs.length > 0 || s.output) && (
          <div className="flex flex-wrap gap-1">
            {s.needs.map((n) => (
              <span
                key={`in-${n}`}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                title="Needs this artifact category"
              >
                in: {n}
              </span>
            ))}
            {s.output && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                title="Writes this output"
              >
                out: {s.output}
              </span>
            )}
          </div>
        )}

        {/* allowed-tools — what the agent (or the deterministic wrapper) can use */}
        {s.allowed_tools.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mr-1 flex items-center gap-1">
              <Cpu className="w-2.5 h-2.5" /> tools:
            </span>
            {s.allowed_tools.map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-2 border-t border-border text-[10px] text-muted-foreground">
          {s.used_by.length === 0
            ? 'No analysts have wired this in yet.'
            : `Used by ${s.used_by.slice(0, 3).join(', ')}`
              + (s.used_by.length > 3 ? ` +${s.used_by.length - 3} more` : '')}
        </div>
      </CardContent>
    </Card>
  );
}
