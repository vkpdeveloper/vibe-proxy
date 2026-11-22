import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  ChartHistogramIcon,
  CheckmarkCircle02Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Page, Section } from '@/components/layout/Page';
import { Meter } from '@/features/dashboard/components/Meter';
import { toneForSuccessRate, type MeterTone } from '@/features/dashboard/utils';
import { cn } from '@/lib/utils';
import { usageCostsApi, type UsageBreakdown, type UsageCostReport } from '@/services/api';
import { useAuthStore } from '@/stores';

type Range = '7d' | '30d' | 'month' | 'all';
type Dimension = 'client' | 'provider' | 'account' | 'model' | 'auth';

const RANGES: Range[] = ['7d', '30d', 'month', 'all'];
const DIMENSIONS: Dimension[] = ['client', 'provider', 'account', 'model', 'auth'];
/** Keep the date axis legible: at most this many labels regardless of range. */
const MAX_DATE_LABELS = 6;
const DASH = '-';

const TONE_TEXT: Record<MeterTone, string> = {
  good: 'text-success',
  warning: 'text-warning',
  critical: 'text-destructive',
  idle: 'text-muted-foreground',
};

const RANGE_META: Record<Range, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
  all: 'All time',
};

const DIMENSION_LABELS: Record<Dimension, string> = {
  client: 'Client keys',
  provider: 'Providers',
  account: 'Accounts',
  model: 'Models',
  auth: 'Credential type',
};

const compactNumber = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function formatTokens(value: number): string {
  return compactNumber.format(value || 0);
}

function formatMoney(value: number, currency = 'USD'): string {
  const digits = value >= 100 ? 2 : value >= 1 ? 3 : 5;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(value || 0);
}

function dateParams(range: Range): { from?: string } {
  if (range === 'all') return {};
  const now = new Date();
  const from = new Date(now);
  if (range === '7d') from.setDate(from.getDate() - 6);
  if (range === '30d') from.setDate(from.getDate() - 29);
  if (range === 'month') from.setDate(1);
  return { from: from.toISOString().slice(0, 10) };
}

function breakdownRows(report: UsageCostReport | null, dimension: Dimension): UsageBreakdown[] {
  if (!report) return [];
  if (dimension === 'client') return report.by_client_key ?? [];
  if (dimension === 'provider') return report.by_provider ?? [];
  if (dimension === 'account') return report.by_account ?? [];
  if (dimension === 'model') return report.by_provider_model ?? [];
  return report.by_auth_type ?? [];
}

function coverageTone(coverage: number): MeterTone {
  if (coverage >= 99) return 'good';
  if (coverage >= 90) return 'warning';
  return 'critical';
}

function Stat({
  label,
  value,
  hint,
  valueClassName,
  children,
}: {
  label: string;
  value: string;
  hint: string;
  valueClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-card p-4">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-2xl tracking-tight tabular-nums', valueClassName)}>
        {value}
      </span>
      {children}
      <span className="text-xs text-faint">{hint}</span>
    </div>
  );
}

export function UsagePage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const [range, setRange] = useState<Range>('30d');
  const [dimension, setDimension] = useState<Dimension>('client');
  const [report, setReport] = useState<UsageCostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (connectionStatus !== 'connected') return;
    setLoading(true);
    setError('');
    try {
      setReport(await usageCostsApi.getReport(dateParams(range)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load usage accounting.');
    } finally {
      setLoading(false);
    }
  }, [connectionStatus, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => breakdownRows(report, dimension), [dimension, report]);

  const daily = report?.daily ?? [];
  const unpricedModels = report?.unpriced_models ?? [];
  const currency = report?.currency ?? 'USD';
  const maxRowCost = Math.max(...rows.map((row) => row.estimated_usd), 0);
  const maxDailyCost = Math.max(...daily.map((day) => day.estimated_usd), 0);
  const peakIndex = daily.findIndex((day) => day.estimated_usd === maxDailyCost);
  const dateLabelStep = Math.max(1, Math.ceil(daily.length / MAX_DATE_LABELS));
  const pricedCoverage = report?.totals.successful
    ? (report.totals.priced_requests / report.totals.successful) * 100
    : 100;
  const observedInput = report
    ? report.totals.input_tokens + report.totals.cached_tokens + report.totals.cache_write_tokens
    : 0;
  const cacheShare =
    report && observedInput ? (report.totals.cached_tokens / observedInput) * 100 : 0;
  const failed = report?.totals.failed ?? 0;
  const successRate = report?.totals.requests
    ? (report.totals.successful / report.totals.requests) * 100
    : null;

  return (
    <>
      <Page
        title={t('usage.title', { defaultValue: 'Usage & spend' })}
        actions={
          <Button
            variant="outline"
            size="lg"
            className="h-9"
            onClick={() => void load()}
            disabled={loading}
          >
            <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" strokeWidth={1.75} />
            {t('common.refresh', { defaultValue: 'Refresh' })}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={range}
              onValueChange={(value) => value && setRange(value as Range)}
              aria-label="Usage date range"
            >
              {RANGES.map((value) => (
                <ToggleGroupItem key={value} value={value} className="h-9 px-3">
                  {value === 'month'
                    ? t('usage.month', { defaultValue: 'Month' })
                    : value === 'all'
                      ? 'All'
                      : value.toUpperCase()}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
              <span>{RANGE_META[range]}</span>
              <span className="text-faint" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-xs text-foreground">
                {report ? `${report.totals.requests.toLocaleString()} requests` : 'Loading'}
              </span>
              {failed > 0 && (
                <>
                  <span className="text-faint" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono text-xs text-destructive">
                    {failed.toLocaleString()} failed
                  </span>
                </>
              )}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive"
            >
              <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0" strokeWidth={1.75} />
              {error}
            </div>
          )}

          <section
            aria-busy={loading}
            className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4"
          >
            <div className="col-span-2 flex min-w-0 flex-col gap-1.5 bg-card p-4 sm:col-span-4">
              <span className="text-[13px] text-muted-foreground">
                {t('usage.estimated_value', { defaultValue: 'Estimated API value' })}
              </span>
              <span className="font-mono text-4xl tracking-tight tabular-nums">
                {report ? formatMoney(report.totals.estimated_usd, report.currency) : DASH}
              </span>
              <span className="text-xs text-faint">
                {t('usage.rates_as_of', { defaultValue: 'Public API rates as of' })}{' '}
                {report?.pricing_as_of || DASH}
              </span>
            </div>
            <Stat
              label={t('usage.total_tokens', { defaultValue: 'Total tokens' })}
              value={report ? formatTokens(report.totals.total_tokens) : DASH}
              hint={
                report
                  ? `${formatTokens(report.totals.input_tokens)} in, ${formatTokens(report.totals.output_tokens)} out`
                  : DASH
              }
            />
            <Stat
              label={t('usage.requests', { defaultValue: 'Requests' })}
              value={report?.totals.requests.toLocaleString() ?? DASH}
              valueClassName={report ? undefined : 'text-muted-foreground'}
              hint={
                report
                  ? `${report.totals.successful.toLocaleString()} successful, ${failed.toLocaleString()} failed`
                  : DASH
              }
            >
              {report && successRate !== null && (
                <span
                  className={cn('font-mono text-xs', TONE_TEXT[toneForSuccessRate(successRate)])}
                >
                  {successRate.toFixed(1)}%
                </span>
              )}
            </Stat>
            <Stat
              label={t('usage.pricing_coverage', { defaultValue: 'Pricing coverage' })}
              value={report ? `${pricedCoverage.toFixed(1)}%` : DASH}
              hint={`${report?.totals.unpriced_requests ?? 0} unpriced requests`}
            >
              <Meter
                value={report ? pricedCoverage : null}
                tone={report ? coverageTone(pricedCoverage) : 'idle'}
                ariaLabel="Pricing coverage"
              />
            </Stat>
            <Stat
              label={t('usage.cache_share', { defaultValue: 'Cached input share' })}
              value={report ? `${cacheShare.toFixed(1)}%` : DASH}
              hint={report ? `${formatTokens(report.totals.cached_tokens)} cached tokens` : DASH}
            />
          </section>
        </div>

        <Section
          title={t('usage.daily_spend', { defaultValue: 'Daily estimated spend' })}
          actions={<span className="font-mono text-xs text-faint">UTC</span>}
        >
          <div className="overflow-hidden rounded-xl border bg-card">
            {daily.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                {loading ? 'Loading usage' : 'New usage will appear here automatically.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2 px-4 pt-8 pb-3">
                <div className="relative h-40">
                  {[0, 0.5, 1].map((ratio) => (
                    <span
                      key={ratio}
                      className="absolute inset-x-0 h-px bg-border/60"
                      style={{ top: `${ratio * 100}%` }}
                      aria-hidden="true"
                    />
                  ))}
                  <div className="absolute inset-0 flex items-end gap-[3px]">
                    {daily.map((day, index) => {
                      const label = `${day.date}: ${formatMoney(day.estimated_usd, currency)}`;
                      const height = Math.max(
                        2,
                        (day.estimated_usd / Math.max(maxDailyCost, 0.000001)) * 100
                      );
                      return (
                        <Tooltip key={day.date}>
                          <TooltipTrigger asChild>
                            <div
                              className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
                              role="img"
                              aria-label={label}
                            >
                              {index === peakIndex && maxDailyCost > 0 && (
                                <span
                                  className={cn(
                                    'absolute pb-1 font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums',
                                    index > daily.length / 2 ? 'right-0' : 'left-0'
                                  )}
                                  style={{ bottom: `${height}%` }}
                                >
                                  {formatMoney(day.estimated_usd, currency)}
                                </span>
                              )}
                              <div
                                className={cn(
                                  'rounded-[2px] transition-colors duration-150 ease-out',
                                  index === peakIndex
                                    ? 'bg-primary'
                                    : 'bg-primary/50 group-hover:bg-primary/80'
                                )}
                                style={{ height: `${height}%` }}
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="flex flex-col gap-0.5 font-mono">
                            <span>{day.date}</span>
                            <span>{formatMoney(day.estimated_usd, currency)}</span>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
                <div
                  className="flex justify-between font-mono text-[11px] text-faint"
                  aria-hidden="true"
                >
                  {daily
                    .filter((_, index) => index % dateLabelStep === 0 || index === daily.length - 1)
                    .map((day) => (
                      <span key={day.date}>{day.date.slice(5)}</span>
                    ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        <Section title={t('usage.breakdown', { defaultValue: 'Cost breakdown' })}>
          <div className="-mx-1 overflow-x-auto px-1">
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={dimension}
              onValueChange={(value) => value && setDimension(value as Dimension)}
              aria-label="Breakdown dimension"
            >
              {DIMENSIONS.map((value) => (
                <ToggleGroupItem key={value} value={value} className="h-9 gap-2 px-3">
                  {DIMENSION_LABELS[value]}
                  <span className="font-mono text-xs text-muted-foreground">
                    {breakdownRows(report, value).length}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 text-xs font-normal text-muted-foreground">
                    Name
                  </TableHead>
                  <TableHead className="text-right text-xs font-normal text-muted-foreground max-sm:hidden">
                    Requests
                  </TableHead>
                  <TableHead className="text-right text-xs font-normal text-muted-foreground max-md:hidden">
                    Input
                  </TableHead>
                  <TableHead className="text-right text-xs font-normal text-muted-foreground max-md:hidden">
                    Output
                  </TableHead>
                  <TableHead className="text-right text-xs font-normal text-muted-foreground">
                    Tokens
                  </TableHead>
                  <TableHead className="px-4 text-right text-xs font-normal text-muted-foreground">
                    Est. value
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No usage recorded for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="max-w-0 px-4 whitespace-normal sm:max-w-56">
                        <div className="flex min-w-0 flex-col gap-1.5 py-0.5">
                          <span className="truncate text-[13px]" title={row.key}>
                            {row.key}
                          </span>
                          <Meter
                            className="max-w-40"
                            value={maxRowCost ? (row.estimated_usd / maxRowCost) * 100 : 0}
                            tone="neutral"
                            ariaLabel={`${row.key} share of the top spend`}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums max-sm:hidden">
                        {row.requests.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums max-md:hidden">
                        {formatTokens(row.input_tokens)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums max-md:hidden">
                        {formatTokens(row.output_tokens)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                        {formatTokens(row.total_tokens)}
                      </TableCell>
                      <TableCell className="px-4 text-right font-mono text-xs tabular-nums">
                        {formatMoney(row.estimated_usd, report?.currency)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Section>

        {unpricedModels.length > 0 && (
          <Section
            title="Models needing a price"
            actions={<Badge variant="secondary">{unpricedModels.length}</Badge>}
          >
            <p className="-mt-2 text-[13px] text-muted-foreground">
              These tokens remain in totals but are excluded from the dollar estimate.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {unpricedModels.map((item) => (
                <li key={`${item.provider}:${item.model}`}>
                  <Badge variant="secondary" className="gap-1.5 font-normal">
                    <span className="font-mono">{item.model}</span>
                    <span className="text-muted-foreground">
                      {formatTokens(item.tokens)} tokens
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <div className="flex flex-col gap-2">
          <Item variant="outline">
            <ItemMedia variant="icon">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.75} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>What this amount means</ItemTitle>
              <ItemDescription className="line-clamp-none">
                It is the public API equivalent of the observed tokens, including cache and
                long-context rates. OAuth subscriptions and negotiated discounts may make the amount
                on your invoice different.
              </ItemDescription>
            </ItemContent>
          </Item>
          <Item variant="outline">
            <ItemMedia variant="icon">
              <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.75} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Historical recovery</ItemTitle>
              <ItemDescription className="line-clamp-none">
                {report?.historical.notice || 'Existing logs are scanned when accounting starts.'}{' '}
                {report
                  ? `${report.historical.imported_usage_records} detailed records imported; ${report.historical.uncostable_legacy_rows.toLocaleString()} legacy requests lacked billing fields.`
                  : ''}
              </ItemDescription>
            </ItemContent>
          </Item>
        </div>
      </Page>
    </>
  );
}

export function UsagePageError() {
  useRouteError();

  return (
    <Page title="Usage & spend">
      <Empty className="border border-dashed" role="alert">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={ChartHistogramIcon} strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle>We couldn't display usage right now.</EmptyTitle>
          <EmptyDescription>
            Your usage ledger is safe. Reload the page to request a fresh report.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="lg" className="px-4" onClick={() => window.location.reload()}>
            <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" strokeWidth={1.75} />
            Reload usage
          </Button>
        </EmptyContent>
      </Empty>
    </Page>
  );
}
