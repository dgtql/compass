import { cn } from '@/lib/utils';

const COLOR_BG: Record<string, string> = {
  cyan: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  rose: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

type Props = {
  initials: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export function Avatar({ initials, color = 'cyan', size = 'md', className }: Props) {
  const sizeClass =
    size === 'sm'
      ? 'w-7 h-7 text-[10px]'
      : size === 'lg'
        ? 'w-12 h-12 text-base'
        : 'w-9 h-9 text-xs';
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold tracking-wide shrink-0',
        COLOR_BG[color] || COLOR_BG.cyan,
        sizeClass,
        className
      )}
    >
      {initials}
    </div>
  );
}
