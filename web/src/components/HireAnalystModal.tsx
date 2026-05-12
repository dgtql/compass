import { useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { mockUniverse } from '@/mocks/data';

type Props = {
  open: boolean;
  onClose: () => void;
};

const SECTORS = ['Technology', 'Energy', 'Financials', 'Consumer', 'Healthcare', 'Industrials'];

export function HireAnalystModal({ open, onClose }: Props) {
  const [name, setName] = useState('');
  const [sector, setSector] = useState<string | null>(null);
  const [persona, setPersona] = useState('');
  const [coverage, setCoverage] = useState<Set<string>>(new Set());

  const suggestedTickers = useMemo(() => {
    if (!sector) return [];
    return mockUniverse.filter((t) => t.sector === sector).slice(0, 12);
  }, [sector]);

  function toggle(t: string) {
    setCoverage((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Hire a new analyst"
      description="Define their identity, sector, and coverage. They'll start producing work as soon as you assign a task."
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Name
            </label>
            <Input
              placeholder="e.g. Maria Chen"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Sector specialty
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SECTORS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSector(sector === s ? null : s)}
                  className={cn(
                    'text-xs px-2 py-1 rounded-md font-medium transition-colors',
                    sector === s
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-accent'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Coverage
            </label>
            {sector && (
              <span className="text-[10px] text-muted-foreground">
                {coverage.size} selected · {suggestedTickers.length} suggested
              </span>
            )}
          </div>
          {!sector ? (
            <div className="text-xs text-muted-foreground italic border border-dashed border-border rounded-md p-3">
              Pick a sector to see suggested tickers from your universe.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 p-3 border border-border rounded-md max-h-32 overflow-y-auto scrollbar-thin">
              {suggestedTickers.map((t) => {
                const selected = coverage.has(t.symbol);
                return (
                  <button
                    key={t.symbol}
                    onClick={() => toggle(t.symbol)}
                    className={cn(
                      'text-xs font-mono px-2 py-1 rounded-md border transition-colors',
                      selected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border hover:bg-accent'
                    )}
                  >
                    {t.symbol}
                  </button>
                );
              })}
            </div>
          )}
          {coverage.size > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {Array.from(coverage).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                >
                  {t}
                  <button onClick={() => toggle(t)} className="hover:text-primary-foreground">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Persona <span className="text-muted-foreground/60 normal-case font-normal lowercase">— optional, but shapes the analyst's writing voice</span>
          </label>
          <Textarea
            placeholder="e.g. Quantitative-leaning semis specialist. Treats every thesis as a supply-chain question first. Plain English, no superlatives."
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            <Sparkles className="inline-block w-3 h-3 mr-1 -translate-y-px text-primary" />
            <em>Mock: this isn't wired up yet. The analyst entity ships in slice 12.</em>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onClose} disabled={!name.trim() || !sector}>
              Hire
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
