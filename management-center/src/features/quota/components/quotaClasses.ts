import { buttonVariants } from '@/components/ui/button';
import type { QuotaClassMap } from '../types';

/** Tailwind styling for every provider quota body (the typed contract lives in ../types). */
export const quotaClasses: QuotaClassMap = {
  quotaRow: 'flex min-w-0 flex-col gap-2',
  quotaRowHeader: 'flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1',
  quotaLabel: 'flex min-w-0 flex-col gap-0.5',
  quotaModel: 'min-w-0 truncate text-sm font-medium',
  quotaDescription: 'text-xs text-muted-foreground',
  quotaMeta:
    'flex min-w-0 flex-wrap items-baseline gap-x-2 font-mono text-xs text-muted-foreground tabular-nums',
  quotaPercent: 'font-medium text-foreground',
  quotaReset: 'text-muted-foreground',
  quotaResetCycle:
    '-mx-1 cursor-pointer rounded-sm px-1 text-muted-foreground transition-colors duration-150 ease-out outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
  quotaResetRelative: "text-muted-foreground before:mr-2 before:text-faint before:content-['·']",
  quotaResetRelativeSoon: 'text-warning',
  quotaAmount: 'font-mono text-xs font-medium text-muted-foreground tabular-nums',
  quotaMessage: 'text-sm text-muted-foreground',
  codexPlan: 'flex flex-wrap items-center gap-1.5',
  codexPlanItem:
    'inline-flex h-6 items-center gap-1.5 rounded-4xl bg-secondary px-2.5 text-xs font-medium whitespace-nowrap',
  codexPlanLabel: 'font-normal text-muted-foreground',
  codexPlanValue: 'text-foreground',
  premiumPlanValue: 'text-warning',
  elitePlanValue: 'text-primary',
  codexResetCredits: 'flex flex-col divide-y rounded-lg border',
  codexResetCreditsTitle: 'px-3 py-2 text-xs text-muted-foreground',
  codexResetCreditRow: 'flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm',
  codexResetCreditRowSoon: 'bg-warning/5',
  codexResetCreditLabel: 'min-w-0 flex-1 basis-48',
  codexResetCreditTime: 'font-mono text-xs text-muted-foreground tabular-nums',
  codexResetCreditUse: buttonVariants({ variant: 'outline', size: 'xs' }),
  codexResetCreditsError: 'text-xs text-warning',
  antigravityQuotaGroup: 'flex flex-col gap-3',
  antigravityQuotaGroupHeader: 'flex flex-col gap-0.5',
  antigravityQuotaGroupTitle: 'text-xs font-medium text-muted-foreground',
  antigravityQuotaGroupDescription: 'text-xs text-faint',
  quotaBar: 'relative h-1 w-full overflow-hidden rounded-full bg-muted',
  quotaBarFill:
    'h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none',
  quotaBarFillHigh: 'bg-success',
  quotaBarFillMedium: 'bg-warning',
  quotaBarFillLow: 'bg-destructive',
};
