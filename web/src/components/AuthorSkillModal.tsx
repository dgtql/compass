/**
 * AuthorSkillModal — upload a new skill (and optionally its references)
 * into ``skills/<slug>/``. Triggered from the Skills library "Author a
 * skill" button.
 *
 * Future: a second tab will let the user distill a skill from a famous
 * person's name (wiki → Claude → SKILL.md). The modal layout already
 * accommodates that with a tab bar at the top.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Upload, FileText, X, Loader2, FilePlus2, AlertCircle, Sparkles, Wand2,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { streamDistillSkill, uploadSkill, type ApiSkill, type SuggestedPack } from '@/lib/api';

type Tab = 'upload' | 'distill';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Fired with the new skill on success so the parent can refresh its list. */
  onCreated?: (skill: ApiSkill) => void;
  /** ``skill`` (default): utility upload only — no pack, no distill.
   *  ``person``: pack-creating upload + distill tab. Used by People tab. */
  mode?: 'skill' | 'person';
};

type RefFile = { name: string; content: string };

const SLUG_RE = /^[a-z][a-z0-9-]{1,63}$/;

export function AuthorSkillModal({ open, onClose, onCreated, mode = 'skill' }: Props) {
  const isPersonMode = mode === 'person';
  const [tab, setTab] = useState<Tab>('upload');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [refs, setRefs] = useState<RefFile[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);

  // Distill tab state.
  const [personName, setPersonName] = useState('');
  const [distilling, setDistilling] = useState(false);
  const [distillError, setDistillError] = useState<string | null>(null);
  const [distillStats, setDistillStats] = useState<{ wikiChars: number } | null>(null);
  /** Stage-by-stage progress reported by the SSE stream. The label is
   *  shown verbatim under the distill form so the user sees what's
   *  happening through the 30–60s SDK call. */
  const [distillStage, setDistillStage] = useState<string>('');
  /** Running count of authored characters, updated on each ``say`` event. */
  const [distillCharCount, setDistillCharCount] = useState<number>(0);
  /** Seconds elapsed since Distill was clicked — drives the elapsed clock. */
  const [distillElapsed, setDistillElapsed] = useState<number>(0);
  /** When a distillation finishes, we carry its suggested pack through to
   *  the upload step so the saved skill comes with a hireable persona. */
  const [pendingPack, setPendingPack] = useState<SuggestedPack | null>(null);
  /** Person-mode upload fields (display name + voice). When the modal is
   *  in person mode and the user is hand-uploading (not distilling),
   *  these populate the pack manifest. */
  const [packDisplayName, setPackDisplayName] = useState('');
  const [packVoice, setPackVoice] = useState('');

  // Elapsed-time ticker — runs only while distilling. Resets on each start.
  useEffect(() => {
    if (!distilling) return;
    const t0 = Date.now();
    setDistillElapsed(0);
    const id = window.setInterval(() => {
      setDistillElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [distilling]);

  // Reset whenever the modal re-opens.
  useEffect(() => {
    if (!open) return;
    setTab('upload');
    setPackDisplayName('');
    setPackVoice('');
    setSlug('');
    setContent('');
    setRefs([]);
    setOverwrite(false);
    setSubmitting(false);
    setError(null);
    setSkipped([]);
    setPersonName('');
    setDistilling(false);
    setDistillError(null);
    setDistillStats(null);
    setDistillStage('');
    setDistillCharCount(0);
    setDistillElapsed(0);
    setPendingPack(null);
  }, [open]);

  const slugValid = useMemo(() => SLUG_RE.test(slug), [slug]);
  // Person-mode manual uploads (no pendingPack from distill) need a name.
  const personFieldsValid = !isPersonMode
    || !!pendingPack
    || packDisplayName.trim().length > 0;
  const canSubmit = slugValid && content.trim().length > 0 && personFieldsValid && !submitting;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setContent(text);
    // If slug is empty, suggest one derived from the filename.
    if (!slug && file.name) {
      const guess = file.name
        .replace(/\.md$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (SLUG_RE.test(guess)) setSlug(guess);
    }
    // Reset the input so re-picking the same file fires onChange.
    e.target.value = '';
  }

  async function handleRefs(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    const next: RefFile[] = await Promise.all(
      files.map(async (f) => ({ name: f.name, content: await f.text() })),
    );
    setRefs((prev) => [...prev, ...next]);
    e.target.value = '';
  }

  function removeRef(name: string) {
    setRefs((prev) => prev.filter((r) => r.name !== name));
  }

  /** Auto-derive a slug from a person's name: "Charlie Munger" → "munger". */
  function slugFromName(name: string): string {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return '';
    const parts = trimmed.split(/\s+/);
    const candidate = parts[parts.length - 1].replace(/[^a-z0-9]/g, '');
    return SLUG_RE.test(candidate) ? candidate : '';
  }

  function handleDistill() {
    if (!personName.trim()) return;
    const targetSlug = slug || slugFromName(personName);
    if (!SLUG_RE.test(targetSlug)) {
      setDistillError('Pick a slug first (or fill in a name we can derive one from).');
      return;
    }
    setDistilling(true);
    setDistillError(null);
    setDistillStats(null);
    setDistillStage('Connecting…');
    setDistillCharCount(0);

    // Streaming via SSE so the user sees real progress through the 30–60s
    // SDK call instead of staring at a spinner. Each event updates the
    // status label below the form (and a running char count once the
    // model starts writing).
    streamDistillSkill(
      { name: personName.trim(), slug: targetSlug },
      {
        onWikiStart: ({ name }) => setDistillStage(`Fetching Wikipedia for ${name}…`),
        onWikiDone: ({ chars }) =>
          setDistillStage(`Wikipedia loaded (${chars.toLocaleString()} chars). Sending to Claude…`),
        onAuthorStart: ({ model }) =>
          setDistillStage(`Claude (${model}) is authoring the SKILL.md…`),
        onSay: ({ total_chars }) => {
          setDistillCharCount(total_chars);
          setDistillStage(`Claude is writing — ${total_chars.toLocaleString()} chars so far…`);
        },
        onAuthorDone: ({ chars }) =>
          setDistillStage(`Authoring complete (${chars.toLocaleString()} chars). Wrapping up…`),
        onDone: (r) => {
          setSlug(r.slug);
          setContent(r.skill_md);
          setDistillStats({ wikiChars: r.wiki_chars });
          setPendingPack(r.suggested_pack);
          setDistillStage('');
          setDistillCharCount(0);
          setDistilling(false);
          // Hop back to the Upload tab so the user reviews + edits + saves.
          setTab('upload');
        },
        onError: (err) => {
          setDistillError(err.message);
          setDistillStage('');
          setDistilling(false);
        },
      },
    );
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSkipped([]);
    try {
      // Pack precedence:
      //   1. ``pendingPack`` from a successful distillation (already has
      //      a generated voice, etc.).
      //   2. Person-mode manual upload — build from the form fields.
      //   3. Skill-mode — no pack.
      let packToSend: SuggestedPack | undefined;
      if (pendingPack) {
        packToSend = pendingPack;
      } else if (isPersonMode && packDisplayName.trim()) {
        packToSend = {
          name: packDisplayName.trim(),
          voice: packVoice.trim(),
        };
      }

      const created = await uploadSkill({
        slug,
        content,
        references: refs,
        overwrite,
        pack: packToSend,
      });
      if (created.skipped_references && created.skipped_references.length > 0) {
        setSkipped(created.skipped_references);
      }
      onCreated?.(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isPersonMode ? 'Add talent' : 'Author a skill'}
      description={
        isPersonMode
          ? "Upload a person's SKILL.md (and their references), or distill their thinking from their Wikipedia page."
          : 'Upload a SKILL.md (and optional reference files). The loader auto-infers `runner: agent` and a Read tool default if the frontmatter is minimal.'
      }
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Tab bar — only shown in person mode where Distill is available.
            Skill mode goes straight to the upload form. */}
        {isPersonMode && (
          <div className="flex gap-1 border-b border-border -mx-6 px-6 -mt-1 pt-1">
            <button
              onClick={() => setTab('upload')}
              className={cn(
                'px-3 py-2 text-sm font-medium transition-colors -mb-px border-b-2 flex items-center gap-1.5',
                tab === 'upload'
                  ? 'text-foreground border-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
            >
              <Upload className="w-3.5 h-3.5" /> Upload SKILL.md
            </button>
            <button
              onClick={() => setTab('distill')}
              className={cn(
                'px-3 py-2 text-sm font-medium transition-colors -mb-px border-b-2 flex items-center gap-1.5',
                tab === 'distill'
                  ? 'text-foreground border-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
            >
              <Wand2 className="w-3.5 h-3.5" /> Distill from a name
            </button>
          </div>
        )}

        {distillStats && tab === 'upload' && (
          <div className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md p-2 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
            <div>
              Distilled from {distillStats.wikiChars.toLocaleString()} chars of Wikipedia.
              {pendingPack && (
                <>
                  {' '}On Author, this also creates a hireable pack
                  (<code className="font-mono">{pendingPack.name}</code>) and a parametric
                  <code className="font-mono"> {slug}-pitch</code> template.
                </>
              )}
              <strong className="ml-1 block mt-0.5">Review and edit below before saving</strong>
              — wiki extracts are biographical, not deep methodology. Treat this as a starting template.
            </div>
          </div>
        )}

        {isPersonMode && tab === 'distill' ? (
          <DistillPanel
            name={personName}
            setName={setPersonName}
            slug={slug}
            setSlug={setSlug}
            distilling={distilling}
            error={distillError}
            slugFromName={slugFromName}
            onDistill={handleDistill}
            stage={distillStage}
            elapsedSec={distillElapsed}
            charCount={distillCharCount}
          />
        ) : (
        <>
        {/* Slug */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Slug <span className="text-muted-foreground/60 normal-case font-normal lowercase">— directory name under skills/</span>
          </label>
          <Input
            placeholder="e.g. munger"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            disabled={submitting}
          />
          {!slugValid && slug && (
            <div className="text-[10px] text-rose-500">
              Lowercase letters, digits, hyphens (2–64 chars). No leading underscore.
            </div>
          )}
        </div>

        {/* Pack metadata — person mode only, hidden when a distillation
            already supplied a suggested pack. */}
        {isPersonMode && !pendingPack && (
          <div className="space-y-3 rounded-md border border-border bg-secondary/30 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 text-primary" />
              Persona (hireable pack)
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Display name
              </label>
              <Input
                placeholder="e.g. Peter Lynch"
                value={packDisplayName}
                onChange={(e) => setPackDisplayName(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Voice <span className="text-muted-foreground/60 normal-case font-normal lowercase">— optional, shapes the chat persona</span>
              </label>
              <Textarea
                placeholder="e.g. Lynch's voice: GARP-leaning, plain English, scuttlebutt-first. Inform, don't advise."
                value={packVoice}
                onChange={(e) => setPackVoice(e.target.value)}
                rows={2}
                disabled={submitting}
              />
            </div>
            <div className="text-[10px] text-muted-foreground italic">
              On Author this creates <code className="font-mono">packs/{slug || '<slug>'}.json</code> and a parametric
              <code className="font-mono"> {slug || '<slug>'}-pitch</code> template so the person is immediately hireable.
            </div>
          </div>
        )}

        {/* SKILL.md content + file picker */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              SKILL.md
            </label>
            <label className={cn(
              'inline-flex items-center gap-1.5 text-[11px] cursor-pointer px-2 py-1 rounded-md border border-border bg-card hover:bg-accent',
              submitting && 'opacity-50 cursor-default',
            )}>
              <Upload className="w-3 h-3" />
              Load from file
              <input
                type="file"
                accept=".md,text/markdown,text/plain"
                onChange={handleFile}
                disabled={submitting}
                className="hidden"
              />
            </label>
          </div>
          <Textarea
            placeholder={'---\nname: my-skill\ndescription: What this skill does.\n---\n\n# my-skill\n\n...'}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            className="font-mono text-[12px]"
            disabled={submitting}
          />
        </div>

        {/* References */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              References <span className="text-muted-foreground/60 normal-case font-normal lowercase">— optional, land under skills/&lt;slug&gt;/references/</span>
            </label>
            <label className={cn(
              'inline-flex items-center gap-1.5 text-[11px] cursor-pointer px-2 py-1 rounded-md border border-border bg-card hover:bg-accent',
              submitting && 'opacity-50 cursor-default',
            )}>
              <FilePlus2 className="w-3 h-3" />
              Add files
              <input
                type="file"
                accept=".md,text/markdown,text/plain"
                multiple
                onChange={handleRefs}
                disabled={submitting}
                className="hidden"
              />
            </label>
          </div>
          {refs.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic border border-dashed border-border rounded-md p-3">
              No reference files yet. Add the markdown reference docs the skill body links to (e.g. <code>references/03-business-moat.md</code>).
            </div>
          ) : (
            <ul className="space-y-1 border border-border rounded-md p-2 max-h-40 overflow-y-auto scrollbar-thin">
              {refs.map((r) => (
                <li key={r.name} className="flex items-center justify-between text-xs">
                  <span className="font-mono inline-flex items-center gap-1.5 min-w-0">
                    <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{r.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      · {Math.ceil(new Blob([r.content]).size / 1024)} KB
                    </span>
                  </span>
                  <button
                    onClick={() => removeRef(r.name)}
                    disabled={submitting}
                    className="text-muted-foreground hover:text-foreground"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Overwrite toggle (only relevant for slug collisions) */}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
            disabled={submitting}
          />
          Overwrite an existing skill at the same slug
        </label>

        {error && (
          <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-2 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              <strong>Couldn't author skill:</strong> {error}
            </div>
          </div>
        )}
        {skipped.length > 0 && (
          <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md p-2">
            Skipped unsafe reference names: {skipped.join(', ')}
          </div>
        )}
        </>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {tab === 'upload'
              ? (
                <>
                  Files land in <code className="font-mono">skills/{slug || '<slug>'}/</code>.
                  {isPersonMode && (
                    <> Also creates <code className="font-mono">packs/{slug || '<slug>'}.json</code> so the persona is hireable.</>
                  )}
                </>
              )
              : <>Wiki → Claude → review &amp; edit in the Upload tab → save.</>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting || distilling}>
              Cancel
            </Button>
            {tab === 'upload' ? (
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Author
              </Button>
            ) : (
              <Button
                onClick={handleDistill}
                disabled={!personName.trim() || distilling}
              >
                {distilling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <Wand2 className="w-3.5 h-3.5" />
                Distill
              </Button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function DistillPanel({
  name,
  setName,
  slug,
  setSlug,
  distilling,
  error,
  slugFromName,
  onDistill,
  stage,
  elapsedSec,
  charCount,
}: {
  name: string;
  setName: (s: string) => void;
  slug: string;
  setSlug: (s: string) => void;
  distilling: boolean;
  error: string | null;
  slugFromName: (s: string) => string;
  onDistill: () => void;
  /** Latest progress message from the SSE stream (e.g. "Fetching wiki…"). */
  stage: string;
  /** Elapsed seconds since Distill was clicked, formatted as `Xs` / `Xm Ys`. */
  elapsedSec: number;
  /** Characters authored so far by Claude — grows during the SDK call. */
  charCount: number;
}) {
  const suggestedSlug = slugFromName(name);

  function fmtElapsed(s: number): string {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  }
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground leading-relaxed bg-secondary/40 border border-border rounded-md p-3">
        <strong className="text-foreground">How this works.</strong> We fetch the
        person's English Wikipedia page, send it to Claude with the bundled
        Buffett skill as the structural template, and Claude authors a SKILL.md
        for them. The result lands in the Upload tab so you can review and edit
        before saving.
        <div className="mt-2 text-[11px] italic">
          Heads-up: wiki articles are biographical, not deep methodology. The
          output will be shape-correct but content-thin compared to a
          hand-curated skill. Treat it as a starting template.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Person's name
          </label>
          <Input
            placeholder="e.g. Charlie Munger"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              // Auto-suggest the slug as the user types, unless they've already
              // edited it manually to something custom.
              const auto = slugFromName(e.target.value);
              if (auto && (!slug || slug === slugFromName(name))) {
                setSlug(auto);
              }
            }}
            disabled={distilling}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Slug <span className="text-muted-foreground/60 normal-case font-normal lowercase">— directory name</span>
          </label>
          <Input
            placeholder={suggestedSlug || 'munger'}
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            disabled={distilling}
          />
          {!SLUG_RE.test(slug) && slug && (
            <div className="text-[10px] text-rose-500">
              Lowercase letters, digits, hyphens (2–64 chars). No leading underscore.
            </div>
          )}
        </div>
      </div>

      {distilling && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
              <span className="font-medium truncate">
                {stage || 'Working…'}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
              {fmtElapsed(elapsedSec)}
            </span>
          </div>
          {charCount > 0 && (
            // Progress bar saturating at 4000 chars (typical SKILL.md size).
            // Doesn't represent true completion, but it moves with output.
            <div className="h-1 rounded bg-border overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(100, (charCount / 4000) * 100)}%` }}
              />
            </div>
          )}
          <p className="text-[10px] text-muted-foreground italic">
            Whole distillation usually takes 30–60s. The slow phase is Claude
            authoring the SKILL.md — wiki fetch is quick.
          </p>
        </div>
      )}

      {error && (
        <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-2 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <strong>Distillation failed:</strong> {error}
            {error.toLowerCase().includes('claude') && (
              <div className="mt-1 italic">
                If OAuth is the issue, run <code>claude /login</code> in a terminal and retry.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
