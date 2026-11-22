import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, CheckmarkCircle02Icon, Loading03Icon } from '@hugeicons/core-free-icons';
import type { ConnectivityState } from './useConnectivityTest';

export function ConnectivityStatusIcon({ state }: { state: ConnectivityState }) {
  if (state === 'loading') {
    return (
      <HugeiconsIcon
        icon={Loading03Icon}
        strokeWidth={1.75}
        aria-hidden="true"
        className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
      />
    );
  }
  if (state === 'success') {
    return (
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        strokeWidth={1.75}
        aria-hidden="true"
        className="size-4 shrink-0 text-success"
      />
    );
  }
  if (state === 'error') {
    return (
      <HugeiconsIcon
        icon={Alert02Icon}
        strokeWidth={1.75}
        aria-hidden="true"
        className="size-4 shrink-0 text-destructive"
      />
    );
  }
  return null;
}
