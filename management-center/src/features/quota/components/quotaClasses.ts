import { buttonVariants } from '@/components/ui/button';
import type { QuotaClassMap } from '../types';

/**
 * Tailwind styling for every provider quota body (the typed contract lives in ../types).
 * `max-sm:` variants tune the phone layout only: plan chips flatten to plain label/value text,
 * reset expiries move to the card's foot and descriptions drop. Reset expiries are divider rows
 * on every width, never a box inside the card. Phone text keeps the line height it had as
 * `text-xs max-sm:text-[13px]` (text-xs's ratio, about 17px at 13px).
 *
 * Phone window rows are a two-column grid: the header and its meta use `display: contents`,
 * so the label and percent share the first line, the bar spans the row, and the reset line
 * (`order-last`, see QuotaResetLabel) sits under the bar at full width.
 */
export const quotaClasses: QuotaClassMap = {
  quotaRow:
    'flex min-w-0 flex-col gap-2 max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-baseline max-sm:gap-x-3',
  quotaRowHeader:
    'flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 max-sm:contents max-sm:[&>div]:contents',
  quotaLabel: 'flex min-w-0 flex-col gap-0.5',
  quotaModel: 'min-w-0 truncate text-sm font-medium',
  quotaDescription: 'text-[13px] text-muted-foreground max-sm:hidden',
  // Standalone metas (not inside a row header) span the phone grid.
  quotaMeta:
    'flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px] text-muted-foreground max-sm:col-span-2 max-sm:leading-[calc(1/0.75)]',
  quotaPercent:
    'font-medium text-foreground max-sm:justify-self-end max-sm:text-sm max-sm:font-semibold',
  quotaReset: 'text-muted-foreground',
  // The after: box gives the 16px-tall text a 32px hit area without moving the layout.
  quotaResetCycle:
    'relative -mx-1 cursor-pointer rounded-sm px-1 text-muted-foreground after:absolute after:inset-x-0 after:-inset-y-2 transition-colors duration-150 ease-out outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
  quotaResetRelative:
    "text-muted-foreground before:mr-2 before:text-faint before:content-['·'] max-sm:col-start-2 max-sm:justify-self-end",
  // Reset lines take the meter's colour for what is left, never for how soon they reset.
  quotaResetMedium: 'text-warning',
  quotaResetLow: 'text-destructive',
  quotaAmount:
    'text-[13px] font-medium text-muted-foreground max-sm:col-span-2 max-sm:leading-[calc(1/0.75)]',
  quotaMessage: 'text-sm text-muted-foreground',
  codexPlan: 'flex flex-wrap items-center gap-1.5 max-sm:gap-x-3 max-sm:gap-y-1',
  codexPlanItem:
    'inline-flex h-6 items-center gap-1.5 rounded-4xl bg-secondary px-2.5 text-[13px] font-medium whitespace-nowrap max-sm:h-auto max-sm:bg-transparent max-sm:px-0 max-sm:leading-[calc(1/0.75)]',
  codexPlanLabel: 'font-normal text-muted-foreground',
  codexPlanValue: 'text-foreground',
  // Phones keep every plan name neutral; a coloured name there read as a warning.
  premiumPlanValue: 'text-warning max-sm:text-foreground',
  elitePlanValue: 'text-primary max-sm:text-foreground',
  codexResetCredits:
    'group/resets flex flex-col divide-y border-y max-sm:order-last max-sm:-mb-2 max-sm:border-b-0',
  // Closed, the summary is the only visible child, so drop the divider it would draw above the hidden rows.
  codexResetCreditsTitle:
    'flex min-h-9 cursor-pointer list-none items-center gap-2 py-2 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:min-h-10 max-sm:leading-[calc(1/0.75)] [details:not([open])>&]:border-b-0 [&::-webkit-details-marker]:hidden',
  // Phone rows stack the label over its expiry, with the Use button on the right.
  codexResetCreditRow:
    'flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-0.5',
  codexResetCreditRowSoon: 'bg-warning/5',
  codexResetCreditLabel: 'min-w-0 flex-1 basis-48',
  codexResetCreditTime:
    'text-[13px] text-muted-foreground max-sm:col-start-1 max-sm:leading-[calc(1/0.75)]',
  codexResetCreditUse: buttonVariants({
    variant: 'outline',
    size: 'xs',
    className:
      'max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1 max-sm:h-10 max-sm:px-3.5 sm:h-8 sm:px-3 sm:text-[13px]',
  }),
  codexResetCreditsError: 'text-xs text-warning',
  antigravityQuotaGroup: 'flex flex-col gap-3',
  antigravityQuotaGroupHeader: 'flex flex-col gap-0.5',
  antigravityQuotaGroupTitle: 'text-xs font-medium text-muted-foreground',
  antigravityQuotaGroupDescription: 'text-xs text-faint max-sm:hidden',
  quotaBar: 'relative h-1 w-full overflow-hidden rounded-full bg-muted max-sm:col-span-2',
  quotaBarFill:
    'h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none',
  quotaBarFillHigh: 'bg-success',
  quotaBarFillMedium: 'bg-warning',
  quotaBarFillLow: 'bg-destructive',
};
