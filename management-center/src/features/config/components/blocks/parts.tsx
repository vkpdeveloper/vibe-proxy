import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Hint } from '@/components/ui/tooltip';

/* Small shared pieces for the rule editors (payload rules, store auth, ICE servers). */

/** One rule: a bordered card with a title and a remove button. Its body is a container,
 *  so editors lay out their rows with @container queries rather than the viewport. */
export function RuleCard({
  title,
  removeLabel,
  onRemove,
  disabled,
  children,
  ...rest
}: {
  title: ReactNode;
  removeLabel: string;
  onRemove: () => void;
  disabled?: boolean;
  children: ReactNode;
  role?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      {...rest}
      className="@container flex flex-col gap-4 rounded-lg border bg-background/60 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium">{title}</span>
        <RemoveButton label={removeLabel} onClick={onRemove} disabled={disabled} />
      </div>
      {children}
    </div>
  );
}

export function RemoveButton({
  label,
  onClick,
  disabled,
  className,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Hint label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className={cn(
          'shrink-0 text-muted-foreground hover:text-destructive max-sm:size-10',
          className
        )}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
      </Button>
    </Hint>
  );
}

export function AddButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <Button
        type="button"
        variant="outline"
        className="max-sm:h-10"
        onClick={onClick}
        disabled={disabled}
      >
        <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
        {children}
      </Button>
    </div>
  );
}

export function BlockLabel({ children }: { children: ReactNode }) {
  return <div className="text-xs font-medium text-muted-foreground">{children}</div>;
}

export function EmptyRules({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}
