/**
 * Quota meter: a thin track whose fill colour follows what is left
 * (>=70 success / >=30 warning / <30 destructive). `null` renders the empty track.
 */

import { cn } from '@/lib/utils';
import type { QuotaClassMap } from '../types';

export const QUOTA_PROGRESS_HIGH_THRESHOLD = 70;
export const QUOTA_PROGRESS_MEDIUM_THRESHOLD = 30;

export interface QuotaMeterProps {
  percent: number | null;
  classes: QuotaClassMap;
  /** Row position, kept for callers; the plain meter has no staggered entrance. */
  index?: number;
}

export function QuotaMeter({ percent, classes }: QuotaMeterProps) {
  const normalized = percent === null ? null : Math.min(100, Math.max(0, percent));
  const fillClass =
    normalized === null || normalized >= QUOTA_PROGRESS_HIGH_THRESHOLD
      ? classes.quotaBarFillHigh
      : normalized >= QUOTA_PROGRESS_MEDIUM_THRESHOLD
        ? classes.quotaBarFillMedium
        : classes.quotaBarFillLow;
  const width = Math.round((normalized ?? 0) * 100) / 100;

  return (
    <div className={classes.quotaBar}>
      <div className={cn(classes.quotaBarFill, fillClass)} style={{ width: `${width}%` }} />
    </div>
  );
}
