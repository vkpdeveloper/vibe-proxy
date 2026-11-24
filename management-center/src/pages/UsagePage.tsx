import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useRouteError, useSearchParams } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ChartHistogramIcon,
  InformationCircleIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { EmailPrivacyText } from '@/components/common/EmailPrivacyText';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Page, Section } from '@/components/layout/Page';
import { usePhone } from '@/components/layout/pageBar';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { Meter } from '@/features/dashboard/components/Meter';
import {
  niceCeil,
  providerLabel,
  toneForSuccessRate,
  type MeterTone,
} from '@/features/dashboard/utils';
import { cn } from '@/lib/utils';
import {
  clientApiKeysApi,
  usageCostsApi,
  type UsageBreakdown,
  type UsageCostReport,
} from '@/services/api';
import { useAuthStore } from '@/stores';
import { formatCompactNumber, formatDateValue } from '@/utils/format';

const RANGES = ['today', '7d', '30d', 'month', 'all'] as const;
type Range = (typeof RANGES)[number];
type Dimension = 'client' | 'provider' | 'account' | 'model' | 'auth';
/** A chart bar: one day, or one week (Monday to Sunday, UTC) on long ranges. */
type Bar = { start: string; end: string; usd: number };

const DEFAULT_RANGE: Range = '30d';
const DIMENSIONS: Dimension[] = ['client', 'provider', 'account', 'model', 'auth'];
/** Keep the date axis legible: at most this many labels regardless of range. */
const MAX_DATE_LABELS = 6;
const MAX_DATE_LABELS_PHONE = 4;
/** Past this many days a bar per day gets too thin to see or tap, so bars become weeks. */
const MAX_DAILY_BARS = 60;
const DASH = '-';
const ALL_KEYS = 'all';

const isRange = (value: string | null): value is Range => RANGES.some((range) => range === value);

const RANGE_LABELS: Record<Range, string> = {
  today: 'Today',
  '7d': '7D',
  '30d': '30D',
  month: 'Month',
  all: 'All',
};

/** The report's days are UTC dates (YYYY-MM-DD). */
const utcDay = (date: string) => new Date(`${date}T00:00:00Z`);
const todayUtc = () => new Date().toISOString().slice(0, 10);

/** Every UTC date from `from` to `to`, inclusive. */
function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (const day = utcDay(from); day <= utcDay(to); day.setUTCDate(day.getUTCDate() + 1)) {
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

/** Monday of the UTC week holding `date`. */
function weekStart(date: string): string {
  const day = utcDay(date);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/** A bar per day, or per week once there are too many days. */
function toBars(days: { date: string; usd: number }[]): Bar[] {
  if (days.length <= MAX_DAILY_BARS) {
    return days.map(({ date, usd }) => ({ start: date, end: date, usd }));
  }
  const weeks = new Map<string, Bar>();
  for (const { date, usd } of days) {
    const start = weekStart(date);
    const week = weeks.get(start);
    if (week) {
      week.usd += usd;
      week.end = date;
    } else {
      weeks.set(start, { start, end: date, usd });
    }
  }
  return [...weeks.values()];
}

/** Evenly spaced label positions that always include the first and last day. */
function labelIndexes(count: number, max: number): number[] {
  if (count <= 1) return count === 1 ? [0] : [];
  const labels = Math.min(count, max);
  return Array.from({ length: labels }, (_, index) =>
    Math.round((index * (count - 1)) / (labels - 1))
  );
}

/** "1 request", "2 requests"; `compact` gives "5.7K requests". */
function plural(value: number, one: string, many = `${one}s`, compact = false): string {
  const number = compact ? formatCompactNumber(value) : value.toLocaleString();
  return `${number} ${value === 1 ? one : many}`;
}

const TONE_TEXT: Record<MeterTone, string> = {
  good: 'text-success',
  warning: 'text-warning',
  critical: 'text-destructive',
  idle: 'text-muted-foreground',
};

const RANGE_META: Record<Range, string> = {
  today: 'Today',
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

function formatMoneyCompact(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumSignificantDigits: 3,
  }).format(value);
}

function formatMoney(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

/** A static loading block (no shimmer), sized like the text it stands in for. */
function Placeholder({ className }: { className?: string }) {
  return <span aria-hidden className={cn('block rounded-md bg-accent', className)} />;
}

function Stat({
  label,
  value,
  hint,
  pending,
  hintClassName,
  valueClassName,
  className,
  children,
}: {
  className?: string;
  label: string;
  value: string;
  hint: ReactNode;
  /** The first report is still loading. */
  pending?: boolean;
  hintClassName?: string;
  valueClassName?: string;
  /** Sits between the value and the hint, such as a meter. */
  children?: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 bg-card p-4', className)}>
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {pending ? (
        <>
          <Placeholder className="my-1 h-6 w-20" />
          <Placeholder className={cn('h-3 w-28', hintClassName)} />
        </>
      ) : (
        <>
          <span className={cn('text-2xl font-medium tracking-tight', valueClassName)}>{value}</span>
          {children}
          <span className={cn('text-xs text-faint', hintClassName)}>{hint}</span>
        </>
      )}
    </div>
  );
}

/** A breakdown row's name; with `pick` it is a button stretched over the whole row. */
function RowName({
  row,
  label,
  pick,
  onPick,
  className,
}: {
  row: UsageBreakdown;
  /** Display name for the row's key, such as "Claude" for the provider id "claude". */
  label: (key: string) => string;
  pick?: string;
  onPick: (key: string) => void;
  className?: string;
}) {
  if (!pick) {
    // Model rows come keyed "claude / claude-opus-5-5"; the provider only adds something when the
    // model name doesn't already carry it, and then it reads as secondary text.
    const model = row.provider ? row.model : undefined;
    const provider =
      model && row.provider && !model.toLowerCase().includes(row.provider.toLowerCase())
        ? providerLabel(row.provider, row.provider)
        : undefined;
    return (
      // Account and auth file rows are keyed by email: blur it like every other page, and keep it
      // out of the native title.
      <span
        className={cn('flex min-w-0 items-baseline gap-1.5', className)}
        title={row.key.includes('@') ? undefined : row.key}
      >
        <EmailPrivacyText className="min-w-0 truncate" text={model ?? label(row.key)} />
        {provider && <span className="shrink-0 text-xs text-muted-foreground">{provider}</span>}
      </span>
    );
  }
  return (
    <button
      type="button"
      title={row.key}
      onClick={() => onPick(pick)}
      className={cn(
        'min-w-0 cursor-pointer truncate text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset',
        className
      )}
    >
      {row.key}
    </button>
  );
}

export function UsagePage() {
  const { t, i18n } = useTranslation();
  const phone = usePhone();
  const navigate = useNavigate();
  // API keys links here with this state; going back returns to that card.
  const fromApiKeys = (useLocation().state as { from?: string } | null)?.from === 'api-keys';
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  // The range and key filter live in the URL (#/usage?range=today&key=<client key id>) so other
  // pages can link to a view.
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeParam = searchParams.get('range');
  const range = isRange(rangeParam) ? rangeParam : DEFAULT_RANGE;
  const clientKey = searchParams.get('key') || ALL_KEYS;
  // The range swaps the view in place; changing the key (picker or a row) adds a history entry,
  // so back returns to the previous key.
  const setParam = (name: 'range' | 'key', value: string | null, replace = true) =>
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (value === null) next.delete(name);
        else next.set(name, value);
        return next;
      },
      { replace }
    );
  const setRange = (value: Range) => setParam('range', value === DEFAULT_RANGE ? null : value);
  // The breakdown follows the key filter (keys for all keys, models for one) until the user picks
  // one. A picked "Client keys" can't show one key, so that falls back to models meanwhile.
  const [chosenDimension, setDimension] = useState<Dimension | null>(null);
  const dimension =
    chosenDimension && (chosenDimension !== 'client' || clientKey === ALL_KEYS)
      ? chosenDimension
      : clientKey === ALL_KEYS
        ? 'client'
        : 'model';
  // A picked bar belongs to the range and key it was picked in; changing either drops it.
  const scope = `${range}:${clientKey}`;
  const [picked, setPicked] = useState<{ scope: string; start: string } | null>(null);
  const pickedStart = picked?.scope === scope ? picked.start : null;
  const [keyOptions, setKeyOptions] = useState<UsageBreakdown[]>([]);
  const [report, setReport] = useState<UsageCostReport | null>(null);
  // The range and key the shown report belongs to; figures dim while a new one loads.
  const [reportScope, setReportScope] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Drops responses that arrive after a newer range or key was picked.
  const latestRequest = useRef(0);
  const top = useRef<HTMLDivElement>(null);
  const keyPicker = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (connectionStatus !== 'connected') return;
    const request = ++latestRequest.current;
    setLoading(true);
    setError('');
    try {
      const next = await usageCostsApi.getReport({
        ...dateParams(range),
        ...(clientKey === ALL_KEYS ? {} : { client_key_id: clientKey }),
      });
      if (request !== latestRequest.current) return;
      setReport(next);
      setReportScope(`${range}:${clientKey}`);
      // A filtered report only lists the chosen key, so the picker keeps the last full list
      // (adding the chosen key when the page opened already filtered).
      const listed = next.by_client_key.filter((row) => row.client_key_id);
      if (clientKey === ALL_KEYS) {
        setKeyOptions(listed);
      } else {
        setKeyOptions((options) =>
          options.some((row) => row.client_key_id === clientKey) ? options : [...options, ...listed]
        );
      }
    } catch (loadError) {
      if (request !== latestRequest.current) return;
      setError(loadError instanceof Error ? loadError.message : 'Unable to load usage accounting.');
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [clientKey, connectionStatus, range]);

  useEffect(() => {
    void load();
  }, [load]);
  // Desktop reloads from the top bar; phones keep the page's own button.
  useHeaderRefresh(load);

  // The picker lists every key from the key list: a filtered report only names the chosen one, and
  // a key with no usage in range appears in no report.
  const [keyList, setKeyList] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    let cancelled = false;
    clientApiKeysApi
      .list()
      .then(({ keys }) => {
        if (!cancelled) setKeyList(keys.map((key) => ({ id: key.id, name: key.name })));
      })
      .catch(() => {
        if (!cancelled) setKeyList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionStatus]);
  // Reports can still name keys the list no longer has (deleted ones with past usage).
  const keyChoices = useMemo(() => {
    const names = new Map(keyList?.map((key) => [key.id, key.name]));
    for (const row of keyOptions) {
      if (row.client_key_id && !names.has(row.client_key_id)) {
        names.set(row.client_key_id, row.client_key || row.key);
      }
    }
    return names;
  }, [keyList, keyOptions]);

  const rows = useMemo(() => breakdownRows(report, dimension), [dimension, report]);

  const daily = report?.daily ?? [];
  const unpricedModels = report?.unpriced_models ?? [];
  const currency = report?.currency ?? 'USD';
  const maxRowCost = Math.max(...rows.map((row) => row.estimated_usd), 0);
  const today = todayUtc();
  // Every day of the range, zero where nothing was spent, so a key that started mid-range still
  // draws from the range start.
  const spendByDay = new Map(daily.map((day) => [day.date, day.estimated_usd]));
  const firstDay = [dateParams(range).from, daily[0]?.date]
    .filter((day): day is string => Boolean(day))
    .sort()[0];
  const chartDays =
    daily.length > 0 && firstDay
      ? eachDay(firstDay, daily.at(-1)!.date > today ? daily.at(-1)!.date : today).map((date) => ({
          date,
          usd: spendByDay.get(date) ?? 0,
        }))
      : [];
  const bars = toBars(chartDays);
  const weekly = bars.length < chartDays.length;
  const maxBarCost = Math.max(...bars.map((bar) => bar.usd), 0);
  // Two even steps up to a round top, like Home's chart.
  const scaleMax = maxBarCost > 0 ? niceCeil(maxBarCost / 2) * 2 : 1;
  // The tapped bar, else the one holding today, else the latest in the range.
  const pickedIndex = bars.findIndex((bar) => bar.start === pickedStart);
  const todayIndex = bars.findIndex((bar) => bar.start <= today && today <= bar.end);
  const selectedIndex =
    pickedIndex >= 0 ? pickedIndex : todayIndex >= 0 ? todayIndex : bars.length - 1;
  const selectedBar = bars.at(selectedIndex);
  const shortDay = new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const longDay = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const barLabels = labelIndexes(bars.length, phone ? MAX_DATE_LABELS_PHONE : MAX_DATE_LABELS);
  const barLabel = (bar: Bar) => {
    if (bar.start <= today && today <= bar.end) return weekly ? 'This week' : 'Today';
    if (weekly) return `Week of ${shortDay.format(utcDay(bar.start))}`;
    return longDay.format(utcDay(bar.start));
  };
  const pickBar = (index: number) => {
    const bar = bars[Math.min(bars.length - 1, Math.max(0, index))];
    if (bar) setPicked({ scope, start: bar.start });
  };
  // The whole chart is one target: a tap or drag picks the bar under the finger.
  const pickBarAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pickBar(Math.floor(((event.clientX - rect.left) / rect.width) * bars.length));
  };
  const stepBar = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === 'ArrowLeft'
        ? selectedIndex - 1
        : event.key === 'ArrowRight'
          ? selectedIndex + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? bars.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    pickBar(next);
  };
  const pending = loading && !report;
  const stale = report !== null && reportScope !== scope;
  const pricedCoverage = report?.totals.successful
    ? (report.totals.priced_requests / report.totals.successful) * 100
    : 100;
  const unpriced = report?.totals.unpriced_requests ?? 0;
  // One unpriced request in thousands still rounds to 100.0%, which reads as none.
  const coverageLabel =
    unpriced > 0 && pricedCoverage >= 99.95 ? 'Over 99.9%' : `${pricedCoverage.toFixed(1)}%`;
  // Providers disagree on whether input_tokens already includes cache reads, so adding the
  // fields double counts. Total minus output is the whole input side for both conventions.
  const inputSide = report
    ? Math.max(
        report.totals.total_tokens - report.totals.output_tokens,
        report.totals.cached_tokens
      )
    : 0;
  const cacheShare = report && inputSide ? (report.totals.cached_tokens / inputSide) * 100 : 0;
  const pickKey = (value: string) => setParam('key', value === ALL_KEYS ? null : value, false);
  // A row sits far down the page; going back up shows the totals the tap just filtered. The row's
  // button goes away with the view, so focus moves to the picker that now names the key.
  const pickKeyFromRow = (value: string) => {
    pickKey(value);
    keyPicker.current?.focus({ preventScroll: true });
    let scroller = top.current?.parentElement;
    while (scroller && scroller.scrollTop === 0) scroller = scroller.parentElement;
    scroller?.scrollTo({ top: 0 });
  };
  // Provider rows are keyed by id; show the names Home uses.
  const unknownProvider = t('dashboard.provider_unknown');
  const rowLabel = (key: string) =>
    dimension === 'provider' ? providerLabel(key, unknownProvider) : key;
  // Client key rows filter the page to that key when tapped.
  const drillable = dimension === 'client' && clientKey === ALL_KEYS;
  const keyOf = (row: UsageBreakdown) => (drillable ? row.client_key_id : undefined);
  // Until the key list arrives the picker says so, rather than flashing the raw key id.
  const keyName = keyChoices.get(clientKey) ?? (keyList ? clientKey : 'Loading…');
  const failed = report?.totals.failed ?? 0;
  const successRate = report?.totals.requests
    ? (report.totals.successful / report.totals.requests) * 100
    : null;
  const empty = report?.totals.requests === 0;
  // With one key picked, a breakdown by key is that key alone.
  const dimensions =
    clientKey === ALL_KEYS ? DIMENSIONS : DIMENSIONS.filter((value) => value !== 'client');
  // The quickest way out of an empty view: a wider range first, then every key.
  // Plain words for the server's history notice.
  const historyNotes = report && (
    <>
      {report.historical.imported_usage_records > 0 && (
        <p>
          {`${plural(report.historical.imported_usage_records, 'older request was', 'older requests were')} recovered from detailed logs and are included.`}
        </p>
      )}
      {report.historical.uncostable_legacy_rows > 0 && (
        <p>
          {`${plural(report.historical.uncostable_legacy_rows, 'older request was', 'older requests were')} logged without token counts. They aren't included in any of these totals.`}
        </p>
      )}
    </>
  );
  const widen =
    range !== 'all'
      ? { label: 'Show all time', apply: () => setRange('all') }
      : clientKey !== ALL_KEYS
        ? { label: 'Show all keys', apply: () => pickKey(ALL_KEYS) }
        : null;

  return (
    <>
      <Page
        wide
        // Phones use the nav's short name, with or without a back button.
        title={phone ? t('nav_short.usage') : t('usage.title', { defaultValue: 'Usage & spend' })}
        onBack={fromApiKeys ? () => navigate(-1) : undefined}
        actions={
          phone && (
            <Button
              variant="ghost"
              size="lg"
              className="size-10 px-0"
              onClick={() => void load()}
              disabled={loading}
            >
              <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" strokeWidth={1.75} />
              <span className="sr-only">{t('common.refresh', { defaultValue: 'Refresh' })}</span>
            </Button>
          )
        }
      >
        <div ref={top} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Phones stack the range over the key picker; five ranges and a picker don't fit one row. */}
            <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:flex-col max-sm:items-stretch">
              <ToggleGroup
                type="single"
                spacing={0}
                value={range}
                onValueChange={(value) => isRange(value) && setRange(value)}
                aria-label="Usage date range"
                className="max-sm:w-full"
              >
                {RANGES.map((value) => (
                  <ToggleGroupItem key={value} value={value} className="h-8 px-3 max-sm:flex-1">
                    {RANGE_LABELS[value]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Select value={clientKey} onValueChange={pickKey}>
                <SelectTrigger
                  ref={keyPicker}
                  aria-label="Client key"
                  className="min-w-40 data-[size=default]:h-9 max-sm:w-full max-sm:data-[size=default]:h-10"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align={phone ? 'end' : 'start'}>
                  <SelectItem value={ALL_KEYS}>All keys</SelectItem>
                  {[...keyChoices].map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                  {clientKey !== ALL_KEYS && !keyChoices.has(clientKey) && (
                    <SelectItem value={clientKey}>{keyName}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {/* Phones skip this line: the range is picked right above and the tiles repeat the counts. */}
            <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground max-sm:hidden">
              <span>{RANGE_META[range]}</span>
              <span className="text-faint" aria-hidden="true">
                ·
              </span>
              <span className="text-foreground">
                {report ? plural(report.totals.requests, 'request') : 'Loading'}
              </span>
              {failed > 0 && (
                <>
                  <span className="text-faint" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-destructive">{failed.toLocaleString()} failed</span>
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

          {empty ? (
            // Desktop empty states are plain muted text; phones keep the framed version.
            <Empty className="border border-dashed sm:border-0 sm:py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="sm:hidden">
                  <HugeiconsIcon icon={ChartHistogramIcon} strokeWidth={1.75} />
                </EmptyMedia>
                <EmptyTitle className="sm:font-normal sm:text-muted-foreground">
                  No usage in this range
                </EmptyTitle>
              </EmptyHeader>
              {widen && (
                <EmptyContent>
                  <Button variant="outline" size="lg" className="px-4" onClick={widen.apply}>
                    {widen.label}
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <section
              aria-busy={loading}
              className={cn(
                'grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border min-[900px]:grid-cols-4',
                stale && 'opacity-60'
              )}
            >
              <div className="col-span-2 flex min-w-0 flex-col gap-1.5 bg-card p-4 min-[900px]:col-span-4">
                <span className="text-[13px] text-muted-foreground">
                  {t('usage.spend', { defaultValue: 'Spend' })}
                  {range === 'today' && ' today'}
                </span>
                {pending ? (
                  <>
                    <Placeholder className="my-1 h-8 w-40" />
                    <Placeholder className="h-3 w-44" />
                  </>
                ) : (
                  <>
                    <span className="text-4xl font-medium tracking-tight">
                      {report ? formatMoney(report.totals.estimated_usd, report.currency) : DASH}
                    </span>
                    <span className="text-xs text-faint">
                      {t('usage.rates_as_of', { defaultValue: 'Public API rates as of' })}{' '}
                      {formatDateValue(report?.pricing_as_of, i18n.language) || DASH}
                    </span>
                  </>
                )}
              </div>
              <Stat
                label={t('usage.total_tokens', { defaultValue: 'Total tokens' })}
                pending={pending}
                value={report ? formatCompactNumber(report.totals.total_tokens) : DASH}
                hint={
                  report ? (
                    <>
                      <span className="max-sm:block">{formatCompactNumber(inputSide)} input</span>
                      <span className="max-sm:hidden"> · </span>
                      <span className="max-sm:block">
                        {formatCompactNumber(report.totals.output_tokens)} output
                      </span>
                    </>
                  ) : (
                    DASH
                  )
                }
              />
              <Stat
                label={t('usage.requests', { defaultValue: 'Requests' })}
                pending={pending}
                value={report?.totals.requests.toLocaleString() ?? DASH}
                valueClassName={report ? undefined : 'text-muted-foreground'}
                hint={successRate === null ? DASH : `${successRate.toFixed(1)}% succeeded`}
                hintClassName={
                  successRate === null ? undefined : TONE_TEXT[toneForSuccessRate(successRate)]
                }
              />
              {/* Phones read coverage under "About these numbers". */}
              <Stat
                className="max-sm:hidden"
                label={t('usage.pricing_coverage', { defaultValue: 'Pricing coverage' })}
                pending={pending}
                value={report ? coverageLabel : DASH}
                hint={plural(report?.totals.unpriced_requests ?? 0, 'unpriced request')}
              >
                <Meter
                  value={report ? pricedCoverage : null}
                  tone={report ? coverageTone(pricedCoverage) : 'idle'}
                  ariaLabel="Pricing coverage"
                />
              </Stat>
              <Stat
                className="max-sm:col-span-2"
                label={t('usage.cache_share', { defaultValue: 'Cached input share' })}
                pending={pending}
                value={report ? `${cacheShare.toFixed(1)}%` : DASH}
                hint={
                  report
                    ? `${formatCompactNumber(report.totals.cached_tokens)} cached tokens`
                    : DASH
                }
              />
            </section>
          )}
        </div>

        {range !== 'today' && !empty && (
          <Section
            title={
              weekly ? 'Weekly spend' : t('usage.daily_spend', { defaultValue: 'Daily spend' })
            }
          >
            <div className={cn('overflow-hidden rounded-xl border bg-card', stale && 'opacity-60')}>
              {pending ? (
                <div className="p-4">
                  <Placeholder className="h-44 w-full rounded-lg" />
                </div>
              ) : bars.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                  New usage will appear here automatically.
                </p>
              ) : (
                <div className="flex flex-col gap-2 px-4 pt-3 pb-3">
                  {selectedBar && (
                    <p className="flex items-baseline justify-between gap-3" aria-live="polite">
                      <span className="text-[13px] text-muted-foreground">
                        {barLabel(selectedBar)}
                      </span>
                      <span className="text-sm font-medium">
                        {formatMoney(selectedBar.usd, currency)}
                      </span>
                    </p>
                  )}
                  {/* pt-2 keeps the top scale label clear of the readout. */}
                  <div className="flex gap-2 pt-2">
                    <div className="relative w-10 shrink-0 text-xs text-faint" aria-hidden="true">
                      {[1, 0.5, 0].map((ratio) => (
                        <span
                          key={ratio}
                          className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
                          style={{ top: `${(1 - ratio) * 100}%` }}
                        >
                          {formatMoneyCompact(scaleMax * ratio, currency)}
                        </span>
                      ))}
                    </div>
                    {/* A slider: tap or drag anywhere to read the nearest bar, or use the arrow keys. */}
                    <div
                      role="slider"
                      tabIndex={0}
                      aria-label={weekly ? 'Weekly spend' : 'Daily spend'}
                      aria-valuemin={0}
                      aria-valuemax={bars.length - 1}
                      aria-valuenow={selectedIndex}
                      aria-valuetext={
                        selectedBar
                          ? `${barLabel(selectedBar)}: ${formatMoney(selectedBar.usd, currency)}`
                          : undefined
                      }
                      className="relative h-40 min-w-0 flex-1 cursor-pointer touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                      onPointerDown={pickBarAt}
                      onPointerMove={(event) => {
                        if (event.buttons > 0) pickBarAt(event);
                      }}
                      onKeyDown={stepBar}
                    >
                      {[0, 0.5, 1].map((ratio) => (
                        <span
                          key={ratio}
                          className="absolute inset-x-0 h-px bg-border/60"
                          style={{ top: `${ratio * 100}%` }}
                          aria-hidden="true"
                        />
                      ))}
                      <div
                        className="pointer-events-none absolute inset-0 flex items-end gap-[3px] max-sm:gap-0.5"
                        aria-hidden="true"
                      >
                        {bars.map((bar) => (
                          <span
                            key={bar.start}
                            className={cn(
                              'min-w-0 flex-1 rounded-[2px] transition-colors duration-150 ease-out',
                              bar.start === selectedBar?.start ? 'bg-primary' : 'bg-primary/45'
                            )}
                            style={{
                              height:
                                bar.usd > 0 ? `${Math.max(2, (bar.usd / scaleMax) * 100)}%` : '1px',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2" aria-hidden="true">
                    <span className="w-10 shrink-0" />
                    <div className="relative h-4 min-w-0 flex-1 text-xs text-faint">
                      {barLabels.map((index) => (
                        <span
                          key={index}
                          className="absolute top-0 whitespace-nowrap"
                          style={
                            index === 0
                              ? { left: 0 }
                              : index === bars.length - 1
                                ? { right: 0 }
                                : {
                                    left: `${((index + 0.5) / bars.length) * 100}%`,
                                    translate: '-50% 0',
                                  }
                          }
                        >
                          {shortDay.format(utcDay(bars[index].start))}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {!empty && (
          <Section
            title={t('usage.breakdown', { defaultValue: 'Cost breakdown' })}
            actions={
              // Five tabs don't fit a phone, so the dimension becomes a picker beside the title.
              phone ? (
                <Select
                  value={dimension}
                  onValueChange={(value) => setDimension(value as Dimension)}
                >
                  <SelectTrigger
                    aria-label="Breakdown dimension"
                    className="data-[size=default]:h-10"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="end">
                    {dimensions.map((value) => (
                      <SelectItem key={value} value={value}>
                        {DIMENSION_LABELS[value]}
                        {report && (
                          <span className="text-xs text-muted-foreground">
                            {breakdownRows(report, value).length}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : undefined
            }
          >
            <div className="-mx-1 overflow-x-auto px-1 max-sm:hidden">
              <ToggleGroup
                type="single"
                spacing={0}
                value={dimension}
                onValueChange={(value) => value && setDimension(value as Dimension)}
                aria-label="Breakdown dimension"
              >
                {dimensions.map((value) => (
                  <ToggleGroupItem key={value} value={value} className="gap-2 px-3">
                    {DIMENSION_LABELS[value]}
                    {report && (
                      <span className="text-xs text-muted-foreground group-data-[state=on]/toggle:text-foreground/70">
                        {breakdownRows(report, value).length}
                      </span>
                    )}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            {phone ? (
              <ul
                className={cn(
                  'divide-y overflow-hidden rounded-xl border bg-card',
                  stale && 'opacity-60'
                )}
              >
                {pending ? (
                  [0, 1, 2].map((index) => (
                    <li key={index} className="flex flex-col gap-2.5 px-4 py-3.5">
                      <Placeholder className="h-4 w-32" />
                      <Placeholder className="h-1 w-full" />
                      <Placeholder className="h-3 w-44" />
                    </li>
                  ))
                ) : rows.length === 0 ? (
                  <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No usage recorded for this period.
                  </li>
                ) : (
                  rows.map((row) => (
                    <li
                      key={row.key}
                      className={cn(
                        'relative flex flex-col gap-2 px-4 py-3',
                        keyOf(row) && 'transition-colors duration-150 active:bg-muted'
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <RowName
                          row={row}
                          label={rowLabel}
                          pick={keyOf(row)}
                          onPick={pickKeyFromRow}
                          className="text-sm"
                        />
                        <span className="flex shrink-0 items-center gap-1 text-sm font-medium">
                          {formatMoney(row.estimated_usd, report?.currency)}
                          {keyOf(row) && (
                            <HugeiconsIcon
                              icon={ArrowRight01Icon}
                              aria-hidden
                              className="-mr-1 size-4 text-muted-foreground"
                              strokeWidth={2}
                            />
                          )}
                        </span>
                      </div>
                      <Meter
                        value={maxRowCost ? (row.estimated_usd / maxRowCost) * 100 : 0}
                        tone="neutral"
                        ariaLabel={`${row.key} share of the top spend`}
                      />
                      <span className="truncate text-[13px] text-muted-foreground">
                        {`${plural(row.requests, 'request', 'requests', true)} · ${formatCompactNumber(row.total_tokens)} tokens`}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <div
                className={cn('overflow-hidden rounded-xl border bg-card', stale && 'opacity-60')}
              >
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
                        {/* Rows that drill down end in an arrow; every row and this header keep its
                            slot so the column's numbers line up. */}
                        <span className="inline-flex items-center gap-1">
                          Est. value
                          {drillable && <span aria-hidden className="-mr-1 size-4" />}
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="px-4 py-4">
                          <Placeholder className="h-24 w-full" />
                        </TableCell>
                      </TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                          No usage recorded for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((row) => (
                        <TableRow
                          key={row.key}
                          className={cn(keyOf(row) && 'relative cursor-pointer active:bg-muted')}
                        >
                          <TableCell className="max-w-0 px-4 whitespace-normal sm:max-w-56">
                            <div className="flex min-w-0 flex-col gap-1.5 py-0.5">
                              <RowName
                                row={row}
                                label={rowLabel}
                                pick={keyOf(row)}
                                onPick={pickKeyFromRow}
                                className="text-[13px]"
                              />
                              <Meter
                                className="max-w-40"
                                value={maxRowCost ? (row.estimated_usd / maxRowCost) * 100 : 0}
                                tone="neutral"
                                ariaLabel={`${row.key} share of the top spend`}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-[13px] text-muted-foreground tabular-nums max-sm:hidden">
                            {row.requests.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-[13px] text-muted-foreground tabular-nums max-md:hidden">
                            {formatCompactNumber(row.input_tokens)}
                          </TableCell>
                          <TableCell className="text-right text-[13px] text-muted-foreground tabular-nums max-md:hidden">
                            {formatCompactNumber(row.output_tokens)}
                          </TableCell>
                          <TableCell className="text-right text-[13px] text-muted-foreground tabular-nums">
                            {formatCompactNumber(row.total_tokens)}
                          </TableCell>
                          <TableCell className="px-4 text-right text-[13px] font-medium tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              {formatMoney(row.estimated_usd, report?.currency)}
                              {keyOf(row) ? (
                                <HugeiconsIcon
                                  icon={ArrowRight01Icon}
                                  aria-hidden
                                  className="-mr-1 size-4 text-muted-foreground"
                                  strokeWidth={2}
                                />
                              ) : (
                                drillable && <span aria-hidden className="-mr-1 size-4" />
                              )}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </Section>
        )}

        {/* Phones list these under "About these numbers". */}
        {!phone && !empty && unpricedModels.length > 0 && (
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
                    {item.model}
                    <span className="text-muted-foreground">
                      {formatCompactNumber(item.tokens)} tokens
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {empty ? null : phone ? (
          // Phones fold both notes behind one line instead of two more boxes.
          <details className="group rounded-xl border bg-card">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <HugeiconsIcon
                icon={InformationCircleIcon}
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
              />
              About these numbers
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                strokeWidth={1.75}
              />
            </summary>
            <div className="flex flex-col gap-3 px-4 pb-4 text-[13px] leading-relaxed text-muted-foreground">
              <p>
                Spend is what these tokens would cost at public API prices. Subscriptions and
                discounts can make your real bill different.
              </p>
              <p>Days start at midnight UTC.</p>
              {report && (
                <div className="flex flex-col gap-2">
                  <p>
                    {unpriced === 0
                      ? 'Every successful request has a price.'
                      : `${coverageLabel} of successful requests have a price. ${plural(unpriced, "doesn't", "don't")}, because these models have no price yet. Their tokens still count above.`}
                  </p>
                  {unpricedModels.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {unpricedModels.map((item) => (
                        <li key={`${item.provider}:${item.model}`}>
                          <Badge variant="secondary" className="gap-1.5 font-normal">
                            <span className="font-mono">{item.model}</span>
                            <span className="text-muted-foreground">
                              {formatCompactNumber(item.tokens)} tokens
                            </span>
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {historyNotes}
            </div>
          </details>
        ) : (
          <div className="flex max-w-[70ch] flex-col gap-2 text-[13px] leading-relaxed text-muted-foreground">
            <p>
              Spend is what these tokens would cost at public API prices, including cache and
              long-context rates. Subscriptions and discounts can make your real bill different.
              Days start at midnight UTC.
            </p>
            {historyNotes}
          </div>
        )}
      </Page>
    </>
  );
}

export function UsagePageError() {
  const { t } = useTranslation();
  useRouteError();

  return (
    <Page wide title={t('usage.title', { defaultValue: 'Usage & spend' })}>
      <Empty className="border border-dashed sm:border-0 sm:py-16" role="alert">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="sm:hidden">
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
            {t('common.refresh')}
          </Button>
        </EmptyContent>
      </Empty>
    </Page>
  );
}
