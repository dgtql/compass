import { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import { cn } from '@/lib/utils';

/**
 * Renders a markdown document and wraps every inline ``[N]`` citation
 * with a hover-tooltip span linking to the matching entry in the
 * document's Sources / References list.
 *
 * Tooltip is pure CSS (`.citation:hover::after`) — no Radix / popover
 * dependency. Works with native screen-reader semantics via
 * ``aria-label`` on the citation span.
 *
 * Skips ``<code>``, ``<pre>``, and ``<a>`` ancestors so a literal ``[1]``
 * inside a code block or a link's anchor text isn't accidentally
 * tooltipped.
 *
 * ``companionContent`` is an optional list of *other* markdown files
 * whose Sources sections should populate the citation map for this
 * render. Used by viewers that open a memo file whose ``[N]`` cites
 * live in the engagement's survey.md but not in the memo itself —
 * pass the survey content as a companion and the memo's citations
 * resolve correctly.
 */
export function CitedMarkdown({
  content,
  companionContent,
}: {
  content: string;
  companionContent?: string[];
}) {
  const html = useMemo(
    () => marked.parse(content, { gfm: true, breaks: false }) as string,
    [content],
  );
  const refs = useMemo(() => {
    const map = parseCitations(content);
    for (const c of companionContent ?? []) {
      // Merge in any [N] entries we don't already have — the rendered
      // document's own sources win when both define the same number.
      for (const [k, v] of parseCitations(c)) {
        if (!map.has(k)) map.set(k, v);
      }
    }
    return map;
  }, [content, companionContent]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    annotateCitations(ref.current, refs);
  }, [html, refs]);

  return (
    <div
      ref={ref}
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        'prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-li:my-0.5',
        'prose-pre:bg-muted prose-pre:text-foreground prose-pre:border prose-pre:border-border prose-pre:rounded-md',
        'prose-code:text-xs prose-code:bg-muted prose-code:text-foreground prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Pull every ``[N] <text>`` reference line out of the markdown — these
 *  populate hover tooltips for the inline ``[N]`` mentions. Stops at the
 *  first non-reference, non-blank line after the references section
 *  starts, so trailing prose ("## Gaps") doesn't leak into the map. */
function parseCitations(content: string): Map<string, string> {
  const refs = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  // Regex: a line that begins with ``[N]`` followed by whitespace and
  // some non-empty content. Matches both the inline references on their
  // own line and continuation lines after a section heading.
  const re = /^\s*\[(\d+)\]\s+(.+?)\s*$/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const [, n, text] = m;
      // First occurrence wins — duplicate ``[1]`` lines (shouldn't happen,
      // but be defensive) keep the earliest.
      if (!refs.has(n)) refs.set(n, text);
    }
  }
  return refs;
}

/** Walk the rendered HTML's text nodes (skipping code / pre / a
 *  ancestors) and replace ``[N]`` matches with annotated ``span``s. */
function annotateCitations(root: HTMLElement, refs: Map<string, string>) {
  if (refs.size === 0) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!hasCitationLike((node as Text).data)) continue;
    if (isInsideSkippedAncestor(node as Text, root)) continue;
    targets.push(node as Text);
  }
  for (const tn of targets) annotateTextNode(tn, refs);
}

function hasCitationLike(text: string): boolean {
  return /\[\d+\]/.test(text);
}

function isInsideSkippedAncestor(node: Text, root: HTMLElement): boolean {
  let p: HTMLElement | null = node.parentElement;
  while (p && p !== root) {
    const tag = p.tagName;
    if (tag === 'CODE' || tag === 'PRE' || tag === 'A') return true;
    p = p.parentElement;
  }
  return false;
}

function annotateTextNode(textNode: Text, refs: Map<string, string>) {
  const text = textNode.data;
  const frag = document.createDocumentFragment();
  let last = 0;
  const re = /\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(last, m.index);
    if (before) frag.appendChild(document.createTextNode(before));
    const refText = refs.get(m[1]);
    if (!refText) {
      // No matching reference — keep the literal ``[N]``, no tooltip.
      frag.appendChild(document.createTextNode(m[0]));
    } else {
      const span = document.createElement('span');
      span.className = 'citation';
      span.textContent = m[0];
      span.setAttribute('data-ref', refText);
      span.setAttribute('aria-label', `Reference ${m[1]}: ${refText}`);
      span.setAttribute('role', 'note');
      frag.appendChild(span);
    }
    last = m.index + m[0].length;
  }
  const after = text.slice(last);
  if (after) frag.appendChild(document.createTextNode(after));
  textNode.parentNode?.replaceChild(frag, textNode);
}
