import { useId, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import { ProviderLogo } from '@/features/providers/components/ProviderLogo';
import type { ProviderFlowState } from '../hooks/useOAuthFlows';

type FlowStatus = NonNullable<ProviderFlowState['status']>;

const STATUS_DOT: Record<FlowStatus, string> = {
  waiting: 'bg-primary',
  success: 'bg-success',
  error: 'bg-destructive',
};

export interface ProviderTileProps {
  label: string;
  /** Accessible name when it differs from the visible label (must contain it). */
  name?: string;
  caption: ReactNode;
  icon?: string;
  /** Its dialog is open or a sign-in is waiting. */
  active?: boolean;
  status?: FlowStatus;
  statusLabel?: string;
  /** Extra control before the plus, kept above the stretched click target. */
  aside?: ReactNode;
  onOpen: () => void;
}

/**
 * A provider tile: the whole tile opens its sign-in dialog. The caption names the sign-in
 * method and switches to the live status while a sign-in runs, so progress stays visible
 * after the dialog closes.
 */
export function ProviderTile({
  label,
  name,
  caption,
  icon,
  active = false,
  status,
  statusLabel,
  aside,
  onOpen,
}: ProviderTileProps) {
  const captionId = useId();

  return (
    <div
      className={cn(
        'relative flex min-w-0 items-center gap-3 rounded-xl border p-2.5 transition-colors duration-150 ease-out hover:bg-muted/50',
        'has-[[aria-haspopup]:focus-visible]:border-ring has-[[aria-haspopup]:focus-visible]:ring-3 has-[[aria-haspopup]:focus-visible]:ring-ring/50',
        // On phones the tiles are rows of one grouped list (see OAuthPage).
        'max-sm:rounded-none max-sm:border-x-0 max-sm:border-t-0 max-sm:px-4 max-sm:last:border-b-0 max-sm:has-[[aria-haspopup]:focus-visible]:ring-inset',
        active && 'border-primary/20 bg-primary/10 hover:bg-primary/10 max-sm:border-border',
        icon === undefined && 'pl-3.5'
      )}
    >
      {icon !== undefined && <ProviderLogo src={icon} className="size-9 rounded-lg" />}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button
          type="button"
          className="cursor-pointer truncate text-left text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-xl max-sm:after:rounded-none"
          onClick={onOpen}
          aria-label={name}
          aria-haspopup="dialog"
          aria-describedby={captionId}
        >
          {label}
        </button>
        <span id={captionId} className="truncate text-sm text-muted-foreground">
          {status && statusLabel ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[status])}
                aria-hidden="true"
              />
              <span className={cn('truncate', status === 'error' && 'text-destructive')}>
                {statusLabel}
              </span>
            </span>
          ) : (
            caption
          )}
        </span>
      </div>
      {aside && <div className="relative z-10 shrink-0">{aside}</div>}
      <HugeiconsIcon
        icon={Add01Icon}
        strokeWidth={1.75}
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}
