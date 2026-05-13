import { Sparkles, FileText, X } from 'lucide-react';
import { useState } from 'react';

type Props = {
  /** Headline shown in the banner. */
  title: string;
  /** Supporting line under the headline. */
  body: string;
  /** Label on the primary button. */
  cta: string;
  /** Template prompt that gets injected into the composer when clicked. */
  template: string;
  onInject: (text: string) => void;
};

export function OnboardingBanner({ title, body, cta, template, onInject }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-3 relative">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{body}</p>
          <button
            onClick={() => onInject(template)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
          >
            <FileText className="w-3 h-3" />
            {cta}
          </button>
        </div>
      </div>
    </div>
  );
}
