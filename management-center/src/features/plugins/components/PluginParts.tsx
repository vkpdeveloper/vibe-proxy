import { useState, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlugSocketIcon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';

/** A plugin's logo on a muted tile, or a plug glyph when it has none or it fails to load. */
export function PluginLogo({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground',
        className
      )}
    >
      {src && !failed ? (
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <HugeiconsIcon icon={PlugSocketIcon} className="size-[18px]" strokeWidth={1.75} />
      )}
    </span>
  );
}

/** An inline error or warning line above a list. */
export function Notice({
  tone,
  children,
  className,
}: {
  tone: 'error' | 'warning';
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'note'}
      className={cn(
        'rounded-lg border px-3 py-2.5 text-[13px]',
        tone === 'error'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-warning/30 bg-warning/10 text-warning',
        className
      )}
    >
      {children}
    </div>
  );
}
