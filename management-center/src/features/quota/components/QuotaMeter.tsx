/**
 * Quota meter: a thin track whose fill colour follows what is left
 * (>=30 success / >=10 warning / <10 destructive). Amber starts late on purpose: most
 * accounts sit well under 70% most of the week, and an always-amber page stops warning.
 * `null` renders the empty track.
 */

import { cn } from '@/lib/utils';
import type { QuotaClassMap } from '../types';

export const QUOTA_PROGRESS_HIGH_THRESHOLD = 30;
export const QUOTA_PROGRESS_MEDIUM_THRESHOLD = 10;

/** How much is left, on the meter's scale; unknown counts as high so it never warns. */
export function quotaLevel(percent: number | null | undefined): 'high' | 'medium' | 'low' {
  if (percent == null || percent >= QUOTA_PROGRESS_HIGH_THRESHOLD) return 'high';
  return percent >= QUOTA_PROGRESS_MEDIUM_THRESHOLD ? 'medium' : 'low';
}

export interface QuotaMeterProps {
  percent: number | null;
  classes: QuotaClassMap;
  /** Row position, kept for callers; the plain meter has no staggered entrance. */
  index?: number;
}

export function QuotaMeter({ percent, classes }: QuotaMeterProps) {
  const normalized = percent === null ? null : Math.min(100, Math.max(0, percent));
  const fillClass = {
    high: classes.quotaBarFillHigh,
    medium: classes.quotaBarFillMedium,
    low: classes.quotaBarFillLow,
  }[quotaLevel(normalized)];
  const width = Math.round((normalized ?? 0) * 100) / 100;

  return (
    <div className={classes.quotaBar}>
      <div className={cn(classes.quotaBarFill, fillClass)} style={{ width: `${width}%` }} />
    </div>
  );
}
