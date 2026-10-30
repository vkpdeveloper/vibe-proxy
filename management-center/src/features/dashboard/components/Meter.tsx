import { fillStyle } from '@/lib/dither';
import type { DitherColor } from '@/lib/dither';
import { toneForSuccessRate, type MeterTone } from '../utils';
import styles from './Meter.module.scss';

const TONE_COLORS: Record<MeterTone, DitherColor> = {
  good: 'green',
  warning: 'orange',
  critical: 'red',
  idle: 'grey',
};

const METER_CELL = 2;

interface MeterProps {
  /** 0–100；null 表示窗口内无请求 */
  value: number | null;
  tone?: MeterTone;
  /** Overrides the tone colour, for meters that show a share rather than health. */
  color?: DitherColor;
  ariaLabel: string;
  className?: string;
}

/**
 * Dithered bar meter: the fill colour carries severity, and the track is a
 * sparse dotted run of the same colour so the state reads along the whole bar.
 */
export function Meter({ value, tone, color: colorOverride, ariaLabel, className }: MeterProps) {
  const color = colorOverride ?? TONE_COLORS[tone ?? toneForSuccessRate(value)];
  const clamped = value === null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div
      className={[styles.track, className].filter(Boolean).join(' ')}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(clamped)}
      aria-label={ariaLabel}
    >
      <div
        className="absolute inset-0 opacity-70"
        style={fillStyle('dotted', { color, cell: METER_CELL })}
      />
      <div
        className={styles.fill}
        style={{
          width: `${clamped}%`,
          ...fillStyle('gradient', { color, cell: METER_CELL, edge: 'right', length: 24, to: 0.5 }),
        }}
      />
    </div>
  );
}
