import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import type { QuotaClassMap } from '../types';

/** Manual reset expiries, closed by default: the plan row already shows how many resets are left. */
export function ResetExpirySection({
  title,
  classes,
  children,
}: {
  title: ReactNode;
  classes: QuotaClassMap;
  children: ReactNode;
}) {
  return (
    <details className={classes.codexResetCredits}>
      <summary className={classes.codexResetCreditsTitle}>
        <span className="min-w-0 flex-1">{title}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={1.75}
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform duration-150 ease-out group-open/resets:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      {children}
    </details>
  );
}
