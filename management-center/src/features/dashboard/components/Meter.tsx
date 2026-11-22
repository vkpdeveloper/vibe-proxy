import { cn } from '@/lib/utils';
import { toneForSuccessRate, type MeterTone } from '../utils';

const TONE_FILL: Record<MeterTone | 'neutral', string> = {
  good: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-destructive',
  idle: 'bg-faint',
  neutral: 'bg-foreground/50',
};

interface MeterProps {
  /** 0-100; null means there is nothing to measure yet */
  value: number | null;
  /** Severity colour. Defaults to the success-rate scale; `neutral` is for shares, not health. */
  tone?: MeterTone | 'neutral';
  ariaLabel: string;
  className?: string;
}

/** A thin bar meter, like VM Bridge's resource meters. The number beside it carries the value. */
export function Meter({ value, tone, ariaLabel, className }: MeterProps) {
  const clamped = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('h-1 overflow-hidden rounded-full bg-accent', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(clamped)}
      aria-label={ariaLabel}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none',
          TONE_FILL[tone ?? toneForSuccessRate(value)]
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
