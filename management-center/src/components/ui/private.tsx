import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Private values, like email addresses and base URLs, stay blurred until clicked, so the dashboard
 * is safe on a shared screen. As an inline block it inherits the parent's wrapping: in a truncated
 * parent it draws its own "…", which is blurred with the value, and elsewhere it wraps as before.
 * The vertical padding, cancelled by negative margins, makes the tap target 40px tall or more
 * without moving the text.
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
        'relative -my-3 inline-block max-w-full cursor-pointer overflow-hidden rounded-sm py-3 align-top text-ellipsis outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
