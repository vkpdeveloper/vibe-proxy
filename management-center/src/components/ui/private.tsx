import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Private values, like email addresses and base URLs, stay blurred until clicked, so the dashboard
 * is safe on a shared screen. An inline span keeps the parent's truncation working.
 */
export function Private({ children, className }: { children: ReactNode; className?: string }) {
  const [shown, setShown] = useState(false);
  const toggle = () => setShown((current) => !current);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={shown}
      title={shown ? 'Click to hide' : 'Click to show'}
      className={cn(
        'cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !shown && 'blur-[5px] select-none',
        className
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle();
      }}
    >
      {children}
    </span>
  );
}
