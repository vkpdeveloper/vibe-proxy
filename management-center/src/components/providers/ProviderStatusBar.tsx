import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { StatusBarData, StatusBlockDetail } from '@/utils/recentRequests';
import { cn } from '@/lib/utils';

function rateTone(rate: number): string {
  if (rate >= 0.9) return 'bg-success';
  if (rate >= 0.5) return 'bg-warning';
  return 'bg-destructive';
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function formatSuccessRate(rate: number): string {
  const rounded = rate.toFixed(1);
  return `${rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded}%`;
}

interface ProviderStatusBarProps {
  statusData: StatusBarData;
  /** No longer read: the bar carries its own VM Bridge styling. Kept so callers compile. */
  styles?: Record<string, string>;
}

/** Recent request health as a row of small bars, one per time block, plus the success rate. */
export function ProviderStatusBar({ statusData }: ProviderStatusBarProps) {
  const { t } = useTranslation();
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);
  const blocksRef = useRef<HTMLDivElement>(null);

  const hasData = statusData.totalSuccess + statusData.totalFailure > 0;
  const rateClass = !hasData
    ? 'text-faint'
    : statusData.successRate >= 90
      ? 'text-success'
      : statusData.successRate >= 50
        ? 'text-warning'
        : 'text-destructive';

  // Tapping outside closes the tooltip (touch).
  useEffect(() => {
    if (activeTooltip === null) return;
    const handler = (e: PointerEvent) => {
      if (blocksRef.current && !blocksRef.current.contains(e.target as Node)) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [activeTooltip]);

  const handlePointerEnter = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.pointerType === 'mouse') {
      setActiveTooltip(idx);
    }
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') {
      setActiveTooltip(null);
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.pointerType === 'touch') {
      e.preventDefault();
      setActiveTooltip((prev) => (prev === idx ? null : idx));
    }
  }, []);

  const renderTooltip = (detail: StatusBlockDetail, idx: number) => {
    const total = detail.success + detail.failure;
    const count = statusData.blockDetails.length;
    // Edge blocks anchor the tooltip to their side so it stays inside the row.
    const position =
      idx <= 2 ? 'left-0' : idx >= count - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2';
    const timeRange = `${formatTime(detail.startTime)} - ${formatTime(detail.endTime)}`;

    return (
      <div
        className={cn(
          'pointer-events-none absolute bottom-full z-20 mb-2 flex flex-col gap-0.5 rounded-lg bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none',
          position
        )}
      >
        <span className="font-mono text-muted-foreground">{timeRange}</span>
        {total > 0 ? (
          <span className="flex items-center gap-2">
            <span className="text-success">
              {t('status_bar.success_short')} {detail.success}
            </span>
            <span className="text-destructive">
              {t('status_bar.failure_short')} {detail.failure}
            </span>
            <span className="text-muted-foreground">({(detail.rate * 100).toFixed(1)}%)</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{t('status_bar.no_requests')}</span>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-0.5" ref={blocksRef}>
        {statusData.blockDetails.map((detail, idx) => {
          const isIdle = detail.rate === -1;
          const isActive = activeTooltip === idx;

          return (
            <div
              key={idx}
              className="relative flex h-5 min-w-0 flex-1 cursor-default items-center"
              onPointerEnter={(e) => handlePointerEnter(e, idx)}
              onPointerLeave={handlePointerLeave}
              onPointerDown={(e) => handlePointerDown(e, idx)}
            >
              <div
                className={cn(
                  'h-4 w-full rounded-[2px] transition-opacity duration-150',
                  isIdle ? 'bg-accent' : rateTone(detail.rate),
                  activeTooltip !== null && !isActive && 'opacity-50'
                )}
              />
              {isActive && renderTooltip(detail, idx)}
            </div>
          );
        })}
      </div>
      <span className={cn('w-12 shrink-0 text-right font-mono text-xs tabular-nums', rateClass)}>
        {hasData ? formatSuccessRate(statusData.successRate) : '--'}
      </span>
    </div>
  );
}
