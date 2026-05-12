import { useMemo, useState } from 'react';
import { Search, Plus, Hash, Network } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { mockNotes } from '@/mocks/data';

export function KnowledgeView() {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>(mockNotes[0]?.id ?? '');

  const allTags = useMemo(() => {
    const set = new Set<string>();
    mockNotes.forEach((n) => n.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return mockNotes.filter((n) => {
      if (tag && !n.tags.includes(tag)) return false;
      if (!needle) return true;
      return (
        n.title.toLowerCase().includes(needle) ||
        n.body.toLowerCase().includes(needle) ||
        n.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [q, tag]);

  const selected = filtered.find((n) => n.id === selectedId) || filtered[0];

  return (
    <div className="h-full grid grid-cols-[300px_minmax(0,1fr)]">
      {/* Left: search + tags + list */}
      <aside className="border-r border-border overflow-y-auto scrollbar-thin">
        <div className="p-4 space-y-3 sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Knowledge base</h2>
            <Button size="sm" variant="ghost" className="-mr-2">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search notes…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-8 text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {allTags.slice(0, 10).map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors',
                  tag === t
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-accent'
                )}
              >
                <Hash className="inline-block w-2.5 h-2.5 -translate-y-px" />
                {t}
              </button>
            ))}
          </div>
        </div>

        <ul className="px-2 py-2">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground italic">No matches.</li>
          )}
          {filtered.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => setSelectedId(n.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md hover:bg-accent/50',
                  selected?.id === n.id && 'bg-accent text-accent-foreground'
                )}
              >
                <div className="text-sm font-medium line-clamp-1">{n.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {n.body.replace(/\[\[([^\]]+)\]\]/g, '$1').slice(0, 80)}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-muted-foreground">{n.createdAt}</span>
                  <Badge variant="outline" className="text-[9px] uppercase">
                    {n.source}
                  </Badge>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Right: viewer */}
      <main className="overflow-y-auto scrollbar-thin">
        {selected ? (
          <div className="p-8 max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{selected.title}</h1>
                <p className="text-xs text-muted-foreground mt-1">
                  {selected.createdAt} · {selected.source} · {selected.linkCount} link
                  {selected.linkCount === 1 ? '' : 's'}
                </p>
              </div>
              <Button variant="outline" size="sm">
                <Network className="w-3.5 h-3.5" />
                Graph view
              </Button>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>
                  Tags · {selected.tags.map((t) => `#${t}`).join('  ')}
                </CardDescription>
              </CardHeader>
              <div className="px-6 pb-6 prose dark:prose-invert prose-sm max-w-none">
                <p
                  className="leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: selected.body.replace(
                      /\[\[([^\]]+)\]\]/g,
                      '<span class="ev-tag">$1</span>'
                    ),
                  }}
                />
              </div>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Linked notes</CardTitle>
                <CardDescription>Other entries that touch the same entities.</CardDescription>
              </CardHeader>
              <div className="px-6 pb-6 space-y-2">
                {mockNotes
                  .filter((n) => n.id !== selected.id && n.tags.some((t) => selected.tags.includes(t)))
                  .slice(0, 3)
                  .map((n) => (
                    <button
                      key={n.id}
                      onClick={() => setSelectedId(n.id)}
                      className="w-full text-left flex items-center justify-between p-3 rounded-md border border-border hover:bg-accent/30"
                    >
                      <span className="text-sm font-medium">{n.title}</span>
                      <span className="text-xs text-muted-foreground">{n.createdAt}</span>
                    </button>
                  ))}
              </div>
            </Card>
          </div>
        ) : (
          <div className="p-8 text-sm text-muted-foreground">Select a note.</div>
        )}
      </main>
    </div>
  );
}
