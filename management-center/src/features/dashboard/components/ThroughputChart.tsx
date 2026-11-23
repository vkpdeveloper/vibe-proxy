import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Table01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatPercent } from '@/utils/format';
import { TRAFFIC_BUCKET_MINUTES, type TrafficWindow } from '../types';
import { axisMax } from '../utils';

/** Gridlines including zero, so TICK_COUNT - 1 intervals. */
const TICK_COUNT = 4;

const BUCKET_MS = TRAFFIC_BUCKET_MINUTES * 60_000;

export function ThroughputChart({
  traffic,
  windowLabel,
}: {
  traffic: TrafficWindow;
  windowLabel: string;
}) {
  const { t, i18n } = useTranslation();
  const [showTable, setShowTable] = useState(false);
  const { buckets, totalSuccess, totalFailure, total, peakIndex, peakTotal } = traffic;
  const scaleMax = useMemo(() => axisMax(peakTotal, TICK_COUNT - 1), [peakTotal]);

  // The server labels buckets in its own time zone; show the viewer's clock instead.
  const timeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    [i18n.language]
  );
  const bucketStart = (index: number) =>
    traffic.lastBucketStart - (buckets.length - 1 - index) * BUCKET_MS;
  const startLabel = (index: number) => timeFormat.format(bucketStart(index));
  const rangeLabel = (index: number) =>
    timeFormat.formatRange(bucketStart(index), bucketStart(index) + BUCKET_MS);

  const ticks = Array.from({ length: TICK_COUNT }, (_, index) => {
    const ratio = 1 - index / (TICK_COUNT - 1);
    return { ratio, value: Math.round(scaleMax * ratio) };
  });

  if (buckets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
        <p className="text-sm font-medium">{t('dashboard.traffic_unavailable')}</p>
        <p className="text-sm text-muted-foreground">{t('dashboard.traffic_unavailable_hint')}</p>
      </div>
    );
  }

  const middle = Math.floor((buckets.length - 1) / 2);
  const xTicks = Array.from(new Set([0, middle, buckets.length - 1]));

  return (
    <figure className="flex flex-col">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" aria-hidden="true" />
            {t('stats.success')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
            {t('dashboard.failed_attempts')}
          </span>
        </span>
        <span className="text-faint">{windowLabel}</span>
      </figcaption>

      <div className="flex gap-2 px-4 pt-5">
        <div className="relative w-7 shrink-0 text-xs text-faint" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick.ratio}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(1 - tick.ratio) * 100}%` }}
            >
              {tick.value.toLocaleString()}
            </span>
          ))}
        </div>

        <div className="relative h-36 min-w-0 flex-1">
          {ticks.map((tick) => (
            <span
              key={tick.ratio}
              className="absolute inset-x-0 h-px bg-border/60"
              style={{ top: `${(1 - tick.ratio) * 100}%` }}
              aria-hidden="true"
            />
          ))}
          <div
            className="absolute inset-0 flex items-end gap-[3px]"
            role="img"
            aria-label={t('dashboard.traffic_chart_summary', {
              total,
              success: totalSuccess,
              failed: totalFailure,
              minutes: traffic.windowMinutes,
            })}
          >
            {buckets.map((bucket, index) => {
              const bucketTotal = bucket.success + bucket.failed;
              return (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <div className="group relative flex h-full flex-1 flex-col justify-end">
                      {index === peakIndex && peakTotal > 0 && (
                        <span
                          className="absolute left-1/2 -translate-x-1/2 pb-1 text-xs text-muted-foreground"
                          style={{ bottom: `${Math.min(100, (bucketTotal / scaleMax) * 100)}%` }}
                        >
                          {peakTotal.toLocaleString()}
                        </span>
                      )}
                      {bucketTotal > 0 ? (
                        <div
                          className="flex flex-col gap-px overflow-hidden rounded-[2px] transition-opacity duration-150 ease-out group-hover:opacity-80"
                          style={{ height: `${Math.max(2, (bucketTotal / scaleMax) * 100)}%` }}
                        >
                          {bucket.failed > 0 && (
                            <div
                              className="min-h-px bg-destructive"
                              style={{ flex: bucket.failed }}
                            />
                          )}
                          {bucket.success > 0 && (
                            <div className="bg-success/70" style={{ flex: bucket.success }} />
                          )}
                        </div>
                      ) : (
                        <div className="h-px bg-border" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="flex flex-col gap-0.5">
                    <span>{rangeLabel(index)}</span>
                    <span>
                      {bucket.success.toLocaleString()} {t('stats.success').toLowerCase()}
                      {bucket.failed > 0 &&
                        `, ${bucket.failed.toLocaleString()} ${t('dashboard.failed_attempts').toLowerCase()}`}
                    </span>
                    {bucketTotal > 0 && (
                      <span>{formatPercent((bucket.success / bucketTotal) * 100)}</span>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          {total === 0 && (
            <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
              {t('status_bar.no_requests')}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 px-4 pt-2 pb-3" aria-hidden="true">
        <span className="w-7 shrink-0" />
        <div className="relative h-4 min-w-0 flex-1 text-xs text-faint">
          {xTicks.map((index) => (
            <span
              key={index}
              className="absolute top-0 whitespace-nowrap"
              style={
                index === 0
                  ? { left: 0 }
                  : index === buckets.length - 1
                    ? { right: 0 }
                    : { left: `${((index + 0.5) / buckets.length) * 100}%`, translate: '-50% 0' }
              }
            >
              {startLabel(index)}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t px-2 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground max-sm:h-10"
          aria-expanded={showTable}
          onClick={() => setShowTable((current) => !current)}
        >
          <HugeiconsIcon icon={Table01Icon} data-icon="inline-start" strokeWidth={1.75} />
          {t('dashboard.traffic_table')}
        </Button>
      </div>

      {/* Phones scroll the page instead of a box inside it. */}
      {showTable && (
        <div className="border-t sm:max-h-72 sm:overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">{t('dashboard.traffic_table_window')}</TableHead>
                <TableHead className="text-right">{t('stats.success')}</TableHead>
                <TableHead className="text-right">{t('dashboard.failed_attempts')}</TableHead>
                <TableHead className="px-4 text-right">{t('dashboard.col_rate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs tabular-nums">
              {buckets.map((bucket, index) => {
                const bucketTotal = bucket.success + bucket.failed;
                return (
                  <TableRow key={index}>
                    <TableCell className="px-4 text-muted-foreground">
                      {rangeLabel(index)}
                    </TableCell>
                    <TableCell className="text-right">{bucket.success.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{bucket.failed.toLocaleString()}</TableCell>
                    <TableCell className="px-4 text-right">
                      {bucketTotal > 0 ? formatPercent((bucket.success / bucketTotal) * 100) : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </figure>
  );
}
