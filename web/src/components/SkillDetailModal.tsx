/**
 * SkillDetailModal — full skill view, opened from a Skills library card.
 *
 * Fetches ``/api/skills/{slug}`` so the modal can render the SKILL.md body
 * (markdown), reference filenames, frontmatter, and provenance (which
 * analysts use it + which packs ship it). The list endpoint omits ``body``
 * and ``references`` to keep listings light; we pay the round-trip on
 * card click only.
 */

import { useEffect, useState } from 'react';
import { marked } from 'marked';
import {
  Library, Loader2, AlertCircle, FileText, Sparkles, Cpu, Users, FolderOpen,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getSkill, type ApiSkillDetail } from '@/lib/api';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Skill slug to load. ``null`` while no skill is selected. */
  slug: string | null;
};

const PHASE_LABEL: Record<ApiSkillDetail['phase'], string> = {
  setup:    'Planner',
  ingest:   'Ingestion',
  analyze:  'Analysis',
  compose:  'Memo',
  maintain: 'Workflow',
};

export function SkillDetailModal({ open, onClose, slug }: Props) {
  const [skill, setSkill] = useState<ApiSkillDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !slug) {
      setSkill(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSkill(slug)
      .then((s) => { if (!cancelled) setSkill(s); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, slug]);

  const html = skill ? (marked.parse(skill.body, { gfm: true, breaks: false }) as string) : '';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={skill?.name ?? slug ?? 'Skill'}
      description={skill ? `${PHASE_LABEL[skill.phase]} · ${skill.runner} runner` : ''}
      maxWidth="max-w-4xl"
    >
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground italic py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading skill…
        </div>
      )}
      {error && (
        <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-2 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>Couldn't load skill: {error}</div>
        </div>
      )}

      {skill && (
        <div className="space-y-4">
          {/* Description (full, not truncated) */}
          {skill.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {skill.description}
            </p>
          )}

          {/* Frontmatter chips */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            <Field label="Phase" value={PHASE_LABEL[skill.phase]} />
            <Field label="Runner" value={skill.runner} />
            <Field label="Model" value={skill.model ?? '—'} />
            <Field label="Max turns" value={String(skill.max_turns)} />
          </div>

          {/* needs + output + allowed-tools */}
          {(skill.needs.length > 0 || skill.output || skill.allowed_tools.length > 0) && (
            <div className="space-y-2 text-xs border-t border-border pt-3">
              {skill.needs.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Needs
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {skill.needs.map((n) => (
                      <span
                        key={n}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {skill.output && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Output
                  </span>
                  <code className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    {skill.output}
                  </code>
                </div>
              )}
              {skill.allowed_tools.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                    <Cpu className="w-2.5 h-2.5" /> Allowed tools
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {skill.allowed_tools.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Provenance: which packs ship it, which analysts use it */}
          {(skill.in_packs.length > 0 || skill.used_by.length > 0) && (
            <div className="border-t border-border pt-3 space-y-2 text-xs">
              {skill.in_packs.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span className="text-muted-foreground">Ships in pack(s):</span>
                  {skill.in_packs.map((p) => (
                    <Badge key={p} variant="default" className="text-[10px]">{p}</Badge>
                  ))}
                </div>
              )}
              {skill.used_by.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Users className="w-3 h-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Used by:</span>
                  <span className="font-mono text-[11px]">{skill.used_by.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* References */}
          {skill.references.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 flex items-center gap-1">
                <FolderOpen className="w-3 h-3" /> References
                <span className="font-normal normal-case lowercase text-muted-foreground/60">
                  ({skill.references.length} file{skill.references.length === 1 ? '' : 's'})
                </span>
              </div>
              <ul className="space-y-0.5">
                {skill.references.map((r) => (
                  <li key={r} className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                    <FileText className="w-3 h-3 shrink-0" />
                    <span className="truncate">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* SKILL.md body — the actual content */}
          <div className="border-t border-border pt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1">
              <Library className="w-3 h-3" /> SKILL.md body
            </div>
            <div
              className={cn(
                'prose prose-sm dark:prose-invert max-w-none',
                'prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-li:my-0.5',
                // ``pre`` (fenced code block) — the plugin's default is a
                // dark terminal-style background that's unreadable in
                // light mode when our inline-code override fights it.
                // Pin to theme-aware tokens so light + dark both work.
                'prose-pre:bg-muted prose-pre:text-foreground prose-pre:border prose-pre:border-border prose-pre:rounded-md',
                // Inline code chips — same muted bg so when this applies
                // to ``pre > code`` it's invisible against the matching
                // pre background (no double-inset look).
                'prose-code:text-xs prose-code:bg-muted prose-code:text-foreground prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
                'prose-table:my-3 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1',
                'prose-hr:my-3',
              )}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>

          {/* Disk path footer */}
          <div className="border-t border-border pt-3 text-[10px] text-muted-foreground font-mono">
            On disk: <span className="break-all">{skill.path}</span>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-xs font-medium capitalize mt-0.5">{value}</div>
    </div>
  );
}
