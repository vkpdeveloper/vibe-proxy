import { useState, type HTMLAttributes, type PropsWithChildren, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';

interface FormSectionProps extends HTMLAttributes<HTMLDetailsElement> {
  label: ReactNode;
  hint?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (event: React.SyntheticEvent<HTMLDetailsElement>) => void;
  flush?: boolean;
}

/** A collapsible bordered group for optional form settings, built on native details. */
export function FormSection({
  label,
  hint,
  defaultOpen = false,
  open,
  onToggle,
  flush,
  children,
  className,
  ...rest
}: PropsWithChildren<FormSectionProps>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const resolvedOpen = open ?? uncontrolledOpen;

  return (
    <details
      className={cn('group/collapsible overflow-hidden rounded-xl border bg-card', className)}
      open={resolvedOpen}
      onToggle={(event) => {
        if (open === undefined) {
          setUncontrolledOpen(event.currentTarget.open);
        }
        onToggle?.(event);
      }}
      {...rest}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-sm font-medium transition-colors select-none outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="min-w-0">{label}</span>
          {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={1.75}
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-open/collapsible:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className={cn('border-t', !flush && 'p-3.5')}>{children}</div>
    </details>
  );
}
