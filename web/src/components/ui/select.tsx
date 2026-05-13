import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A styled native <select>. Lighter than a custom popover — keyboard /
 * screen-reader behavior is free, and it sits cleanly inside a chat
 * composer without competing for click handling.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative inline-flex">
    <select
      ref={ref}
      className={cn(
        'appearance-none h-8 pl-2 pr-7 rounded-md border border-input bg-background text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
  </div>
));
Select.displayName = 'Select';
