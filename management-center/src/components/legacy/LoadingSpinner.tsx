import { HugeiconsIcon } from '@hugeicons/react';
import { Loading03Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';

/** Shown only while something loads, so the spin stops once it unmounts. */
export function LoadingSpinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('inline-flex text-muted-foreground', className)}
    >
      <HugeiconsIcon
        icon={Loading03Icon}
        size={size}
        strokeWidth={1.75}
        className="animate-spin motion-reduce:animate-none"
      />
    </span>
  );
}
