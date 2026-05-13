import { useMemo, useState } from 'react';
import { Library, FileText, BookOpen, BarChart3, Workflow, Plus, GitBranch, LayoutGrid } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mockAnalysts, mockSkills } from '@/mocks/data';
import type { Skill } from '@/types/domain';

const CATEGORY_LABEL: Record<Skill['category'], string> = {
  memo: 'Memo',
  analysis: 'Analysis',
  ingestion: 'Ingestion',
  workflow: 'Workflow',
  planner: 'Planner',
};

const CATEGORY_ICON: Record<Skill['category'], React.ComponentType<{ className?: string }>> = {
  memo: FileText,
  analysis: BarChart3,
  ingestion: BookOpen,
  workflow: Workflow,
  planner: LayoutGrid,
};

const STATUS_VARIANT: Record<Skill['status'], 'success' | 'secondary' | 'destructive'> = {
  production: 'success',
  planned: 'secondary',
  retired: 'destructive',
};

export function SkillsView() {
  const [category, setCategory] = useState<Skill['category'] | 'all'>('all');
  const [status, setStatus] = useState<Skill['status'] | 'all'>('all');

  const filtered = useMemo(() => {
    return mockSkills.filter((s) => {
      if (category !== 'all' && s.category !== category) return false;
      if (status !== 'all' && s.status !== status) return false;
      return true;
    });
  }, [category, status]);

  const stats = useMemo(() => {
    const counts = { production: 0, planned: 0, retired: 0 };
    mockSkills.forEach((s) => {
      counts[s.status]++;
    });
    return counts;
  }, []);

  return (
    <div className="overflow-y-auto scrollbar-thin h-full">
      <div className="p-8 max-w-6xl mx-auto space-y-5">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Library className="w-5 h-5 text-primary" /> Skills library
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              The repertoire your analysts can use. {stats.production} live · {stats.planned} planned
              · {stats.retired} retired.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled>
            <Plus className="w-3.5 h-3.5" />
            Author a skill
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
            Category
          </span>
          {(['all', 'memo', 'analysis', 'workflow', 'ingestion'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'text-xs px-2 py-1 rounded-md font-medium transition-colors',
                category === c
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent',
              )}
            >
              {c === 'all' ? 'All' : CATEGORY_LABEL[c]}
            </button>
          ))}
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold ml-3 mr-1">
            Status
          </span>
          {(['all', 'production', 'planned', 'retired'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                'text-xs px-2 py-1 rounded-md font-medium transition-colors capitalize',
                status === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent',
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => {
            const Icon = CATEGORY_ICON[s.category];
            const users = mockAnalysts.filter((a) => s.usedBy.includes(a.slug));
            return (
              <Card key={s.slug} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <CardTitle className="text-sm">{s.name}</CardTitle>
                        <CardDescription className="text-[10px] uppercase tracking-wider mt-0.5">
                          {CATEGORY_LABEL[s.category]}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT[s.status]} className="text-[10px] capitalize">
                      {s.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>

                  <div className="flex flex-wrap gap-1">
                    {s.inputs.map((i) => (
                      <span
                        key={`in-${i}`}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        in: {i}
                      </span>
                    ))}
                    {s.outputs.map((o) => (
                      <span
                        key={`out-${o}`}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                      >
                        out: {o}
                      </span>
                    ))}
                  </div>

                  {s.calls && s.calls.length > 0 && (
                    <div className="border-t border-border pt-2">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
                        <GitBranch className="w-3 h-3" /> Stacks on
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {s.calls.map((c) => (
                          <span
                            key={c}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border border-border"
                          >
                            → {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {s.stages && s.stages.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
                        Stages:
                      </span>
                      {s.stages.map((st) => (
                        <span
                          key={st}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 capitalize"
                        >
                          {st}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto pt-2 border-t border-border flex items-center justify-between">
                    <div className="text-[10px] text-muted-foreground">
                      {users.length
                        ? `Used by ${users.map((u) => u.name.split(' ')[0]).join(', ')}`
                        : 'No analysts have used this yet'}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2"
                      disabled={s.status !== 'production'}
                    >
                      {s.status === 'production' ? 'Run' : 'View'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
