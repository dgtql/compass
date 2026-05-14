import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Tailwind max-width class */
  maxWidth?: string;
};

/** Minimal modal — no Radix dependency; matches the reference's "keep it lean" guidance. */
export function Dialog({ open, onClose, title, description, children, maxWidth = 'max-w-lg' }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          'relative w-full bg-card text-card-foreground rounded-lg border border-border shadow-lg',
          // Cap height so the modal always fits the viewport; flex column
          // so the header is sticky-feeling and the body scrolls.
          'max-h-[90vh] flex flex-col',
          maxWidth
        )}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
        {(title || description) && (
          <div className="px-6 pt-5 pb-3 border-b border-border shrink-0">
            {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
        )}
        <div className="p-6 overflow-y-auto scrollbar-thin">{children}</div>
      </div>
    </div>
  );
}
