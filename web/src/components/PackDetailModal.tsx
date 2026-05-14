/**
 * PackDetailModal — full talent-pool persona view.
 *
 * Renders the pack the user clicked: voice (verbatim, no truncation),
 * each workflow with its description, the skill toolkit, and a primary
 * Hire CTA. The pack object is passed in directly because the Talent
 * pool already has it from ``GET /api/packs`` — no extra fetch.
 */

import { Sparkles, GitBranch, UserPlus, Workflow } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import type { ApiPack } from '@/lib/api';

type Props = {
  open: boolean;
  onClose: () => void;
  pack: ApiPack | null;
  onHire?: (packId: string) => void;
};

export function PackDetailModal({ open, onClose, pack, onHire }: Props) {
  if (!pack) {
    return (
      <Dialog open={open} onClose={onClose} title="Persona" maxWidth="max-w-3xl">
        <div className="text-sm text-muted-foreground italic">No persona selected.</div>
      </Dialog>
    );
  }

  const initials = pack.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '??';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={pack.name}
      description={`${pack.title} · ${pack.sector_hint}`}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Hero — avatar + identity */}
        <div className="flex items-start gap-3">
          <Avatar
            initials={initials}
            color={pack.avatar_color || 'cyan'}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-medium">{pack.name}</span>
              <Badge variant="default" className="text-[10px] gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                {pack.id}
              </Badge>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {pack.title} · sector hint: {pack.sector_hint}
            </div>
          </div>
        </div>

        {/* Voice — the persona's chat voice */}
        {pack.voice && (
          <div className="text-sm text-muted-foreground leading-relaxed italic border-l-2 border-primary/40 pl-3">
            "{pack.voice}"
          </div>
        )}

        {/* Skill toolkit */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-primary" /> Skills toolkit
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pack.skills.map((s) => (
              <span
                key={s}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary"
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Workflows — full descriptions, not truncated */}
        {pack.workflows.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              <Workflow className="w-2.5 h-2.5" /> Workflows
              <span className="font-normal normal-case lowercase text-muted-foreground/60">
                ({pack.workflows.length})
              </span>
            </div>
            <ul className="space-y-2">
              {pack.workflows.map((wf) => (
                <li
                  key={wf.command}
                  className="rounded-md border border-border bg-card p-3 space-y-1"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{wf.name}</span>
                    <code className="text-[10px] text-muted-foreground font-mono">
                      {wf.command}
                    </code>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {wf.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Default template */}
        {pack.default_template && (
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 border-t border-border pt-3">
            <GitBranch className="w-3 h-3" />
            Default workflow: <code className="font-mono">{pack.default_template}</code>
          </div>
        )}

        {/* Hire CTA */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            Hire from <code className="font-mono">packs/{pack.id}.json</code>.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => onHire?.(pack.id)}>
              <UserPlus className="w-3.5 h-3.5" />
              Hire
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
