import { useState, useCallback, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskAnswers, AskQuestion } from '@/types/domain';

type Props = {
  requestId: string;
  questions: AskQuestion[];
  /** When the PM answers, the panel calls this with their answers. */
  onSubmit: (requestId: string, answers: AskAnswers) => void;
  /** Already-submitted answers; if present, the panel renders read-only. */
  answers?: AskAnswers;
};

export function AskUserQuestionPanel({ requestId, questions, onSubmit, answers }: Props) {
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Map<number, Set<string>>>(() => new Map());
  const [otherTexts, setOtherTexts] = useState<Map<number, string>>(() => new Map());
  const [otherActive, setOtherActive] = useState<Map<number, boolean>>(() => new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);
  const readOnly = answers != null;

  useEffect(() => {
    if (!readOnly && !otherActive.get(step)) containerRef.current?.focus();
  }, [step, otherActive, readOnly]);
  useEffect(() => {
    if (otherActive.get(step)) otherInputRef.current?.focus();
  }, [otherActive, step]);

  const toggleOption = useCallback((qIdx: number, label: string, multi: boolean) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const cur = new Set(next.get(qIdx) ?? []);
      if (multi) {
        cur.has(label) ? cur.delete(label) : cur.add(label);
      } else {
        cur.clear();
        cur.add(label);
        setOtherActive((p) => {
          const n = new Map(p);
          n.set(qIdx, false);
          return n;
        });
      }
      next.set(qIdx, cur);
      return next;
    });
  }, []);

  const toggleOther = useCallback((qIdx: number, multi: boolean) => {
    setOtherActive((prev) => {
      const next = new Map(prev);
      const was = next.get(qIdx) ?? false;
      next.set(qIdx, !was);
      if (!multi && !was)
        setSelections((p) => {
          const n = new Map(p);
          n.set(qIdx, new Set());
          return n;
        });
      return next;
    });
  }, []);

  const buildAnswers = useCallback((): AskAnswers => {
    const result: AskAnswers = {};
    questions.forEach((q, i) => {
      const sel = Array.from(selections.get(i) ?? []);
      const isOther = otherActive.get(i) ?? false;
      const otherText = (otherTexts.get(i) ?? '').trim();
      if (isOther && otherText) sel.push(otherText);
      if (sel.length) result[q.question] = sel.join(', ');
    });
    return result;
  }, [questions, selections, otherActive, otherTexts]);

  const handleSubmit = () => onSubmit(requestId, buildAnswers());

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (readOnly || e.target instanceof HTMLInputElement) return;
      const q = questions[step];
      if (!q) return;
      const multi = q.multiSelect ?? false;
      const num = parseInt(e.key);
      if (!isNaN(num) && num >= 1 && num <= q.options.length) {
        e.preventDefault();
        toggleOption(step, q.options[num - 1].label, multi);
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        toggleOther(step, multi);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        step === questions.length - 1 ? handleSubmit() : setStep((s) => s + 1);
      }
    },
    [step, questions, toggleOption, toggleOther, readOnly],
  );

  if (!questions.length) return null;
  const total = questions.length;
  const isSingle = total === 1;
  const q = questions[step];
  const multi = q.multiSelect ?? false;
  const selected = selections.get(step) ?? new Set<string>();
  const isOtherOn = otherActive.get(step) ?? false;
  const isLast = step === total - 1;
  const isFirst = step === 0;
  const hasCurrentSelection =
    selected.size > 0 || (isOtherOn && (otherTexts.get(step) ?? '').trim().length > 0);

  return (
    <div
      ref={containerRef}
      tabIndex={readOnly ? -1 : 0}
      onKeyDown={handleKeyDown}
      className="w-full outline-none mt-2"
    >
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary via-cyan-400 to-teal-400" />

        <div className="px-4 pt-3.5 pb-2">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="relative flex-shrink-0">
              <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                <HelpCircle className="w-3.5 h-3.5 text-primary" />
              </div>
              {!readOnly && (
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground">
                {readOnly ? 'You answered' : 'Analyst needs your input'}
              </span>
              {q.header && (
                <span className="inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                  {q.header}
                </span>
              )}
            </div>
            {!isSingle && (
              <span className="text-[10px] tabular-nums text-muted-foreground flex-shrink-0">
                {step + 1}/{total}
              </span>
            )}
          </div>

          {!isSingle && (
            <div className="flex items-center gap-1 mb-2">
              {questions.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStep(i)}
                  className={cn(
                    'h-[3px] rounded-full transition-all duration-300',
                    i === step
                      ? 'w-5 bg-primary'
                      : i < step
                        ? 'w-2.5 bg-primary/50'
                        : 'w-2.5 bg-muted',
                  )}
                />
              ))}
            </div>
          )}

          <p className="text-sm leading-snug font-medium text-foreground">{q.question}</p>
          {multi && !readOnly && (
            <span className="text-[10px] text-muted-foreground">Select all that apply</span>
          )}
        </div>

        <div
          className="px-4 pb-2 max-h-48 overflow-y-auto scrollbar-thin"
          role={multi ? 'group' : 'radiogroup'}
        >
          <div className="space-y-1">
            {q.options.map((opt, optIdx) => {
              const isSelected = readOnly
                ? answers?.[q.question]?.includes(opt.label) ?? false
                : selected.has(opt.label);
              return (
                <button
                  key={opt.label}
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggleOption(step, opt.label, multi)}
                  className={cn(
                    'group w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-150',
                    isSelected
                      ? 'border-primary/40 bg-primary/10 ring-1 ring-primary/20'
                      : 'border-border hover:border-foreground/20 hover:bg-accent/40',
                    readOnly && 'cursor-default',
                  )}
                >
                  <kbd
                    className={cn(
                      'flex-shrink-0 w-5 h-5 rounded text-[10px] font-mono flex items-center justify-center transition-all',
                      isSelected
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'bg-muted text-muted-foreground border border-border',
                    )}
                  >
                    {optIdx + 1}
                  </kbd>
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        'text-[13px] leading-tight',
                        isSelected ? 'text-foreground font-medium' : 'text-foreground/80',
                      )}
                    >
                      {opt.label}
                    </div>
                    {opt.description && (
                      <div className="text-[11px] leading-snug text-muted-foreground">
                        {opt.description}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}

            {!readOnly && (
              <button
                type="button"
                onClick={() => toggleOther(step, multi)}
                className={cn(
                  'group w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all',
                  isOtherOn
                    ? 'border-primary/40 bg-primary/10 ring-1 ring-primary/20'
                    : 'border-dashed border-border hover:border-foreground/20 hover:bg-accent/40',
                )}
              >
                <kbd
                  className={cn(
                    'flex-shrink-0 w-5 h-5 rounded text-[10px] font-mono flex items-center justify-center',
                    isOtherOn
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-muted text-muted-foreground border border-border',
                  )}
                >
                  0
                </kbd>
                <span
                  className={cn(
                    'text-[13px]',
                    isOtherOn ? 'text-foreground font-medium' : 'text-muted-foreground',
                  )}
                >
                  Other…
                </span>
              </button>
            )}

            {isOtherOn && (
              <div className="pl-[30px] pr-0.5">
                <input
                  ref={otherInputRef}
                  type="text"
                  value={otherTexts.get(step) ?? ''}
                  onChange={(e) =>
                    setOtherTexts((prev) => {
                      const n = new Map(prev);
                      n.set(step, e.target.value);
                      return n;
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      isLast ? handleSubmit() : setStep((s) => s + 1);
                    }
                    e.stopPropagation();
                  }}
                  placeholder="Type your answer…"
                  className="w-full text-[13px] rounded-lg bg-muted/60 text-foreground px-3 py-1.5 outline-none ring-1 ring-border focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                />
              </div>
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              Use number keys to select · Enter to advance
            </span>
            <div className="flex items-center gap-1.5">
              {!isSingle && !isFirst && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="inline-flex items-center gap-0.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-foreground/80 hover:bg-accent"
                >
                  ← Back
                </button>
              )}
              {isLast ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!hasCurrentSelection && !Object.keys(buildAnswers()).length}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Submit{' '}
                  <span className="text-[9px] opacity-70 font-mono ml-0.5">Enter</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  Next <span className="text-[9px] opacity-70 font-mono ml-0.5">Enter</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
