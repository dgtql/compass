/**
 * Talent pool — the personas (packs) the PM can hire from when creating
 * an analyst. Reads ``GET /api/packs``. Each pack is a curated or
 * distilled persona bundle: skills + workflows + voice + defaults.
 * Clicking "Hire" deep-links to the Hire modal pre-filled with that pack.
 *
 * Compared to the Skills tab (raw building blocks) and Data tab (corpus
 * inventory), Talent pool is the *who* — the menu of personalities the
 * PM can put onto their pod. Adding talent (upload a person's SKILL.md
 * or distill from a name) creates a new entry here.
 */

import { useEffect, useState } from 'react';
import { Users, Loader2, Sparkles, UserPlus, GitBranch, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { getPacks, type ApiPack } from '@/lib/api';
import { AuthorSkillModal } from '@/components/AuthorSkillModal';
import { PackDetailModal } from '@/components/PackDetailModal';

type Props = {
  /** Triggered when the PM clicks "Hire" on a pack — App.tsx opens the
   *  Hire modal (it already supports a pack-id selector). */
  onHireFromPack?: (packId: string) => void;
};

export function PeopleView({ onHireFromPack }: Props) {
  const [packs, setPacks] = useState<ApiPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  /** Pack currently being viewed in the detail modal, or null. */
  const [detailPack, setDetailPack] = useState<ApiPack | null>(null);

  const reload = () => {
    setLoading(true);
    setError(null);
    getPacks()
      .then((r) => setPacks(r.packs))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  return (
    <div className="overflow-y-auto scrollbar-thin h-full">
      <div className="p-8 max-w-6xl mx-auto space-y-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Talent pool
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {loading
                ? 'Loading…'
                : `${packs.length} persona${packs.length === 1 ? '' : 's'} ready to hire. `
                  + 'Each bundles a skill + voice + named workflows the analyst will run.'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            Add talent
          </Button>
        </div>

        {error && (
          <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-2">
            Couldn't load people: {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading personas…
          </div>
        ) : packs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No personas yet. Click <strong>Add talent</strong> above to upload a person's
              SKILL.md or distill one from a Wikipedia page.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {packs.map((p) => (
              <PackCard
                key={p.id}
                pack={p}
                onHire={() => onHireFromPack?.(p.id)}
                onOpen={() => setDetailPack(p)}
              />
            ))}
          </div>
        )}
      </div>

      <AuthorSkillModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => reload()}
        mode="person"
      />
      <PackDetailModal
        open={detailPack !== null}
        onClose={() => setDetailPack(null)}
        pack={detailPack}
        onHire={(packId) => {
          setDetailPack(null);
          onHireFromPack?.(packId);
        }}
      />
    </div>
  );
}

function PackCard({
  pack, onHire, onOpen,
}: { pack: ApiPack; onHire: () => void; onOpen: () => void }) {
  // Initials from the pack name — same convention as analyst avatars.
  const initials = pack.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '??';

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
        <div className="flex items-start gap-3">
          <Avatar
            initials={initials}
            color={pack.avatar_color || 'cyan'}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">{pack.name}</CardTitle>
            <CardDescription className="text-[11px] mt-0.5 truncate">
              {pack.title}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        {pack.voice && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4 italic">
            "{pack.voice}"
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mr-1 flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" /> skills:
          </span>
          {pack.skills.map((s) => (
            <span
              key={s}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary"
            >
              {s}
            </span>
          ))}
        </div>

        {pack.workflows.length > 0 && (
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
              <GitBranch className="w-2.5 h-2.5" /> workflows
            </div>
            <ul className="space-y-0.5">
              {pack.workflows.map((wf) => (
                <li key={wf.command} className="text-[11px] flex items-start gap-1.5">
                  <Badge variant="outline" className="text-[9px] font-mono shrink-0 mt-0.5">
                    {wf.name}
                  </Badge>
                  <span className="text-muted-foreground line-clamp-2">{wf.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto pt-2 border-t border-border flex items-center justify-end">
          <Button
            variant="default"
            size="sm"
            onClick={(e) => {
              // Don't bubble — clicking Hire shouldn't ALSO open the detail modal.
              e.stopPropagation();
              onHire();
            }}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Hire
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
