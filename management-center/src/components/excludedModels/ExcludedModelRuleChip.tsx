import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';

/**
 * A chip for one excluded model, shaped by where the exclusion comes from:
 *
 * - `exact`    solid primary tint: a model the user picked, removable.
 * - `wildcard` dashed: a model a wildcard rule covers. No remove button, since removing it
 *              means editing that rule; a button here would promise something it cannot do.
 * - `unknown`  dashed and faint: an exact rule for a model the catalog does not list (for
 *              example a retired model id), removable.
 */
export type ExcludedModelChipVariant = 'exact' | 'wildcard' | 'unknown';

export interface ExcludedModelRuleChipProps {
  label: string;
  variant?: ExcludedModelChipVariant;
  /** Secondary note, such as the rule that produced the chip. */
  detail?: string;
  /** Leave out to render no remove button. */
  onRemove?: () => void;
  removeAriaLabel?: string;
  disabled?: boolean;
  title?: string;
}

const VARIANT_CLASS: Record<ExcludedModelChipVariant, string> = {
  exact: 'border-primary/40 bg-primary/10 text-foreground',
  wildcard: 'border-dashed border-primary/35 text-muted-foreground',
  unknown: 'border-dashed border-input text-faint',
};

/** The wrapping row for chips, so each consumer does not rewrite the flex-wrap. */
export function ExcludedModelChipRow({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap gap-1.5">{children}</div>;
}

export function ExcludedModelRuleChip({
  label,
  variant = 'exact',
  detail,
  onRemove,
  removeAriaLabel,
  disabled = false,
  title,
}: ExcludedModelRuleChipProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-full border pl-2.5 font-mono text-[11px]',
        onRemove ? 'pr-0.5' : 'pr-2.5',
        VARIANT_CLASS[variant]
      )}
      title={title ?? (detail ? `${label} (${detail})` : label)}
    >
      <span className="truncate">{label}</span>
      {detail ? <span className="shrink-0 text-[10px] text-faint">{detail}</span> : null}
      {onRemove ? (
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onRemove}
          disabled={disabled}
          aria-label={removeAriaLabel ?? label}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
        </button>
      ) : null}
    </span>
  );
}
