/**
 * 额度水位条（原 QuotaProgressBar 的类型化后继）。
 *
 * Fill colour follows what is left (≥70 green / ≥30 orange / <30 red);
 * percent === null renders the empty track only.
 * `index` 写入 `--meter-index`，供全页外衣做逐行入场级差；紧凑外衣不消费该变量。
 */

import type { CSSProperties } from 'react';
import { fillStyle } from '@/lib/dither';
import type { DitherColor } from '@/lib/dither';
import type { QuotaClassMap } from '../types';

export const QUOTA_PROGRESS_HIGH_THRESHOLD = 70;
export const QUOTA_PROGRESS_MEDIUM_THRESHOLD = 30;

export interface QuotaMeterProps {
  percent: number | null;
  classes: QuotaClassMap;
  index?: number;
}

// Dithered meter: a sparse dotted track, and a fill that is densest at the
// current level and thins towards empty. Cells are 2px so an 8px bar holds
// four rows of them.
const METER_CELL = 2;

export function QuotaMeter({ percent, classes, index }: QuotaMeterProps) {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const normalized = percent === null ? null : clamp(percent, 0, 100);
  let fillClass = classes.quotaBarFillLow;
  let color: DitherColor = 'red';
  if (normalized === null) {
    fillClass = classes.quotaBarFillMedium;
    color = 'grey';
  } else if (normalized >= QUOTA_PROGRESS_HIGH_THRESHOLD) {
    fillClass = classes.quotaBarFillHigh;
    color = 'green';
  } else if (normalized >= QUOTA_PROGRESS_MEDIUM_THRESHOLD) {
    fillClass = classes.quotaBarFillMedium;
    color = 'orange';
  }
  const widthPercent = Math.round((normalized ?? 0) * 100) / 100;
  const style: CSSProperties & { '--meter-index'?: number } = {
    width: `${widthPercent}%`,
    ...fillStyle('gradient', { color, cell: METER_CELL, edge: 'right', length: 24, to: 0.5 }),
  };
  if (index !== undefined) {
    style['--meter-index'] = index;
  }

  return (
    <div className={classes.quotaBar}>
      <div
        className="absolute inset-0 opacity-60"
        style={fillStyle('dotted', { color: 'grey', cell: METER_CELL })}
        aria-hidden="true"
      />
      <div className={`${classes.quotaBarFill} ${fillClass}`} style={style} />
    </div>
  );
}
