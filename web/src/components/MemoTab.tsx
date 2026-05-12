import { useEffect, useState } from 'react';
import { marked } from 'marked';
import { api } from '@/lib/api';
import type { EvidenceRow, MemoDetail, MemoListItem } from '@/types/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type Props = {
  ticker: string | null;
  openedMemoKey: { type: string; date: string } | null;
  refreshNonce: number;
};

const EV_RE = /\[ev#(\d+(?:\s*,\s*ev#\d+)*)\]/g;

export function MemoTab({ ticker, openedMemoKey, refreshNonce }: Props) {
  const [memos, setMemos] = useState<MemoListItem[]>([]);
  const [selected, setSelected] = useState<{ type: string; date: string } | null>(
    openedMemoKey
  );
  const [memo, setMemo] = useState<MemoDetail | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRow | null>(null);
  const [activeEvId, setActiveEvId] = useState<number | null>(null);

  // Load memo list when ticker changes
  useEffect(() => {
    if (!ticker) {
      setMemos([]);
      setSelected(null);
      return;
    }
    api.listMemos(ticker).then((rows) => {
      setMemos(rows);
      if (!selected && rows.length) {
        setSelected({ type: rows[0].type, date: rows[0].date });
      }
    });
  }, [ticker, refreshNonce]);

  // External opener (Dashboard "open memo" click)
  useEffect(() => {
    if (openedMemoKey) setSelected(openedMemoKey);
  }, [openedMemoKey]);

  // Load memo detail when selection changes
  useEffect(() => {
    if (!ticker || !selected) {
      setMemo(null);
      return;
    }
    api.getMemo(ticker, selected.type, selected.date).then(setMemo);
  }, [ticker, selected]);

  async function showEvidence(id: number) {
    setActiveEvId(id);
    setEvidence(null);
    try {
      const ev = await api.getEvidence(id);
      setEvidence(ev);
    } catch (e) {
      setEvidence({
        id,
        doc_id: '',
        ticker: '',
        source: '',
        source_url: null,
        form_type: null,
        line_start: 0,
        line_end: 0,
        retrieved_at: '',
        content: `Failed to load ev#${id}: ${(e as Error).message}`,
      });
    }
  }

  // After the memo HTML is rendered, wire up the ev-tag click handlers.
  useEffect(() => {
    if (!memo) return;
    const root = document.getElementById('memo-body');
    if (!root) return;
    const tags = root.querySelectorAll<HTMLElement>('.ev-tag');
    const handlers: Array<[HTMLElement, () => void]> = [];
    tags.forEach((tag) => {
      const id = parseInt(tag.dataset.evId || '0', 10);
      const fn = () => showEvidence(id);
      tag.addEventListener('click', fn);
      handlers.push([tag, fn]);
    });
    return () => {
      handlers.forEach(([el, fn]) => el.removeEventListener('click', fn));
    };
  }, [memo]);

  const memoHtml = (() => {
    if (!memo) return '';
    const replaced = memo.content.replace(EV_RE, (_match, ids: string) => {
      const numbers = ids.match(/\d+/g) || [];
      return numbers
        .map((n) => `<span class="ev-tag" data-ev-id="${n}">ev#${n}</span>`)
        .join(' ');
    });
    return marked.parse(replaced, { breaks: false }) as string;
  })();

  if (!ticker) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Pick a project to view memos.</div>
    );
  }

  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)_320px] h-full">
      {/* Memo list */}
      <aside className="border-r border-border overflow-y-auto scrollbar-thin">
        <div className="px-4 pt-4 pb-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          Memos
        </div>
        {memos.length === 0 && (
          <div className="px-4 py-2 text-xs text-muted-foreground italic">
            None yet for {ticker}.
          </div>
        )}
        <ul>
          {memos.map((m) => {
            const isActive =
              selected && selected.type === m.type && selected.date === m.date;
            return (
              <li key={`${m.type}-${m.date}`}>
                <button
                  onClick={() => setSelected({ type: m.type, date: m.date })}
                  className={cn(
                    'w-full text-left px-4 py-2 hover:bg-accent/50',
                    isActive && 'bg-accent text-accent-foreground'
                  )}
                >
                  <div className="text-sm font-medium capitalize">{m.type}</div>
                  <div className="text-xs text-muted-foreground">{m.date}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Memo body */}
      <main className="overflow-y-auto scrollbar-thin">
        <div className="px-8 py-4 border-b border-border bg-background/60 sticky top-0 z-10">
          <div className="text-sm text-muted-foreground">
            {memo ? `${memo.ticker} · ${memo.type} memo · ${memo.date}` : 'Select a memo'}
          </div>
          {memo && (
            <div className="text-xs text-muted-foreground mt-1">
              {memo.citations.length} evidence citation{memo.citations.length === 1 ? '' : 's'}
            </div>
          )}
        </div>
        <article
          id="memo-body"
          className="prose dark:prose-invert max-w-3xl px-8 py-6 prose-sm"
          dangerouslySetInnerHTML={{ __html: memoHtml }}
        />
      </main>

      {/* Evidence side panel */}
      <aside className="border-l border-border overflow-y-auto scrollbar-thin bg-background/40">
        <div className="px-4 pt-4 pb-2 sticky top-0 bg-background/95">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            Evidence
          </div>
          <div className="text-sm font-medium mt-1">
            {evidence
              ? <>ev#{evidence.id} <Badge variant="outline" className="ml-1 text-[10px]">{evidence.form_type || '?'}</Badge></>
              : activeEvId
                ? `Loading ev#${activeEvId}…`
                : 'Click any [ev#N] to see the source'}
          </div>
        </div>
        {evidence && (
          <div className="px-4 pb-4 text-sm leading-relaxed">
            <div className="text-xs text-muted-foreground mb-3 space-y-1">
              <div>
                <span className="font-medium text-foreground">Source: </span>
                {evidence.source_url ? (
                  <a
                    href={evidence.source_url}
                    target="_blank"
                    rel="noopener"
                    className="text-primary hover:underline"
                  >
                    {evidence.source} · {evidence.form_type || '?'}
                  </a>
                ) : (
                  <>{evidence.source} · {evidence.form_type || '?'}</>
                )}
              </div>
              <div>
                <span className="font-medium text-foreground">Lines: </span>
                {evidence.line_start}–{evidence.line_end}
              </div>
              <div>
                <span className="font-medium text-foreground">Retrieved: </span>
                {evidence.retrieved_at}
              </div>
            </div>
            <pre className="whitespace-pre-wrap text-xs leading-relaxed bg-muted/40 p-3 rounded-md border border-border">
              {evidence.content}
            </pre>
          </div>
        )}
      </aside>
    </div>
  );
}
