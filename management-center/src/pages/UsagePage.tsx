import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router-dom';
import { IconAlertTriangle, IconCheckCircle2, IconRefreshCw } from '@/components/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { Meter } from '@/features/dashboard/components/Meter';
import { toneForSuccessRate, type MeterTone } from '@/features/dashboard/utils';
import { useRevealGroup } from '@/hooks/motion';
import { usageCostsApi, type UsageBreakdown, type UsageCostReport } from '@/services/api';
import { useAuthStore } from '@/stores';
import styles from './UsagePage.module.scss';

type Range = '7d' | '30d' | 'month' | 'all';
type Dimension = 'client' | 'provider' | 'account' | 'model' | 'auth';

const RANGES: Range[] = ['7d', '30d', 'month', 'all'];
const DIMENSIONS: Dimension[] = ['client', 'provider', 'account', 'model', 'auth'];
/** Keep the date axis legible: at most this many labels regardless of range. */
const MAX_DATE_LABELS = 10;

const TONE_ACCENTS: Record<MeterTone, string> = {
  good: 'var(--viz-success)',
  warning: 'var(--amber-color)',
  critical: 'var(--viz-failure)',
  idle: 'var(--border-hover)',
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

export function UsagePage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const revealRef = useRevealGroup<HTMLDivElement>();
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
    <div className={styles.page} ref={revealRef}>
      <header className={styles.header}>
        <div className={styles.copy}>
          <h1 className={styles.title} data-reveal>
            {t('usage.title', { defaultValue: 'Usage & spend' })}
          </h1>
          <p className={styles.meta} data-reveal>
            <span>{RANGE_META[range]}</span>
            <span className={styles.metaDot} aria-hidden="true">
              ·
            </span>
            <span className={report ? styles.metaLive : styles.metaMuted}>
              {report ? `${report.totals.requests.toLocaleString()} requests` : 'Loading ledger'}
            </span>
            {failed > 0 && (
              <>
                <span className={styles.metaDot} aria-hidden="true">
                  ·
                </span>
                <span className={styles.metaFailure}>{failed.toLocaleString()} failed</span>
              </>
            )}
          </p>
        </div>
        <div className={styles.actions} data-reveal>
          <button
            type="button"
            className={styles.ghostAction}
            onClick={() => void load()}
            disabled={loading}
          >
            <IconRefreshCw size={14} className={loading ? styles.spinning : undefined} />
            {t('common.refresh', { defaultValue: 'Refresh' })}
          </button>
          <div className={styles.segmented} role="group" aria-label="Usage date range">
            {RANGES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={range === value}
                className={`${styles.segment} ${range === value ? styles.segmentActive : ''}`}
                onClick={() => setRange(value)}
              >
                {value === 'month'
                  ? t('usage.month', { defaultValue: 'Month' })
                  : value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <div className={styles.errorBanner} role="alert">
          <IconAlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}

      <section className={styles.statsRow} aria-busy={loading} data-reveal>
        <article
          className={styles.statTile}
          style={{ '--tile-accent': 'var(--text-primary)' } as CSSProperties}
        >
          <span className={styles.statLabel}>
            {t('usage.estimated_value', { defaultValue: 'Estimated API value' })}
          </span>
          <strong className={styles.statValue}>
            {report ? formatMoney(report.totals.estimated_usd, report.currency) : '—'}
          </strong>
          <span className={styles.statHint}>
            {t('usage.rates_as_of', { defaultValue: 'Public API rates as of' })}{' '}
            {report?.pricing_as_of || '—'}
          </span>
        </article>
        <article className={styles.statTile}>
          <span className={styles.statLabel}>
            {t('usage.total_tokens', { defaultValue: 'Total tokens' })}
          </span>
          <strong className={styles.statValue}>
            {report ? formatTokens(report.totals.total_tokens) : '—'}
          </strong>
          <span className={styles.statHint}>
            {report
              ? `${formatTokens(report.totals.input_tokens)} in · ${formatTokens(report.totals.output_tokens)} out`
              : '—'}
          </span>
        </article>
        <article
          className={styles.statTile}
          style={
            report
              ? ({
                  '--tile-accent': TONE_ACCENTS[toneForSuccessRate(successRate)],
                } as CSSProperties)
              : undefined
          }
        >
          <span className={styles.statLabel}>
            {t('usage.requests', { defaultValue: 'Requests' })}
          </span>
          <strong className={styles.statValue}>
            {report?.totals.requests.toLocaleString() ?? '—'}
          </strong>
          <span className={styles.statHint}>
            {report
              ? `${report.totals.successful.toLocaleString()} successful · ${failed.toLocaleString()} failed`
              : '—'}
          </span>
        </article>
        <article
          className={styles.statTile}
          style={
            report
              ? ({
                  '--tile-accent': TONE_ACCENTS[coverageTone(pricedCoverage)],
                } as CSSProperties)
              : undefined
          }
        >
          <span className={styles.statLabel}>
            {t('usage.pricing_coverage', { defaultValue: 'Pricing coverage' })}
          </span>
          <strong className={styles.statValue}>
            {report ? `${pricedCoverage.toFixed(1)}%` : '—'}
          </strong>
          <Meter
            className={styles.statMeter}
            value={report ? pricedCoverage : null}
            tone={report ? coverageTone(pricedCoverage) : 'idle'}
            ariaLabel="Pricing coverage"
          />
          <span className={styles.statHint}>
            {report?.totals.unpriced_requests ?? 0} unpriced requests
          </span>
        </article>
        <article className={styles.statTile}>
          <span className={styles.statLabel}>
            {t('usage.cache_share', { defaultValue: 'Cached input share' })}
          </span>
          <strong className={styles.statValue}>{report ? `${cacheShare.toFixed(1)}%` : '—'}</strong>
          <span className={styles.statHint}>
            {report ? `${formatTokens(report.totals.cached_tokens)} cached tokens` : '—'}
          </span>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.eyebrow}>Persistent ledger</span>
          <h2 className={styles.sectionTitle}>
            {t('usage.daily_spend', { defaultValue: 'Daily estimated spend' })}
          </h2>
          <p className={styles.sectionDescription}>
            {t('usage.daily_spend_hint', { defaultValue: 'Token-rated usage in UTC.' })}
          </p>
        </div>
        <div className={styles.panel}>
          {daily.length === 0 ? (
            <p className={styles.emptyNote}>
              {loading ? 'Loading usage…' : 'New usage will appear here automatically.'}
            </p>
          ) : (
            <div className={styles.chart}>
              <div className={styles.plot}>
                {daily.map((day, index) => {
                  const label = `${day.date}: ${formatMoney(day.estimated_usd, currency)}`;
                  return (
                    <div className={styles.column} key={day.date} title={label}>
                      {index === peakIndex && maxDailyCost > 0 && (
                        <span className={styles.peakLabel}>
                          {formatMoney(day.estimated_usd, currency)}
                        </span>
                      )}
                      <div
                        className={`${styles.bar} ${index === peakIndex ? styles.barPeak : ''}`}
                        style={{
                          height: `${Math.max(2, (day.estimated_usd / Math.max(maxDailyCost, 0.000001)) * 100)}%`,
                        }}
                        role="img"
                        aria-label={label}
                      />
                    </div>
                  );
                })}
              </div>
              <div className={styles.axis} aria-hidden="true">
                {daily.map((day, index) => (
                  <span key={day.date}>
                    {index % dateLabelStep === 0 || index === daily.length - 1
                      ? day.date.slice(5)
                      : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.eyebrow}>Attribution</span>
          <h2 className={styles.sectionTitle}>
            {t('usage.breakdown', { defaultValue: 'Cost breakdown' })}
          </h2>
          <p className={styles.sectionDescription}>
            {t('usage.breakdown_hint', {
              defaultValue: 'Compare the dimensions that drive token spend.',
            })}
          </p>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Breakdown dimension">
          {DIMENSIONS.map((value) => (
            <button
              type="button"
              role="tab"
              aria-selected={dimension === value}
              className={`${styles.tab} ${dimension === value ? styles.tabActive : ''}`}
              key={value}
              onClick={() => setDimension(value)}
            >
              {DIMENSION_LABELS[value]}
              <span className={styles.tabCount}>{breakdownRows(report, value).length}</span>
            </button>
          ))}
        </div>
        <Table className={styles.table}>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead alignRight>Requests</TableHead>
              <TableHead alignRight>Input</TableHead>
              <TableHead alignRight>Output</TableHead>
              <TableHead alignRight>Tokens</TableHead>
              <TableHead alignRight>Est. value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className={styles.emptyRow}>
                  No usage recorded for this period.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <div className={styles.rowIdentity}>
                      <span className={styles.rowName}>{row.key}</span>
                      <span className={styles.rowTrack} aria-hidden="true">
                        <span
                          style={{
                            width: `${maxRowCost ? (row.estimated_usd / maxRowCost) * 100 : 0}%`,
                          }}
                        />
                      </span>
                    </div>
                  </TableCell>
                  <TableCell alignRight className={styles.numberCell}>
                    {row.requests.toLocaleString()}
                  </TableCell>
                  <TableCell alignRight className={styles.numberCell}>
                    {formatTokens(row.input_tokens)}
                  </TableCell>
                  <TableCell alignRight className={styles.numberCell}>
                    {formatTokens(row.output_tokens)}
                  </TableCell>
                  <TableCell alignRight className={styles.numberCell}>
                    {formatTokens(row.total_tokens)}
                  </TableCell>
                  <TableCell alignRight className={styles.moneyCell}>
                    {formatMoney(row.estimated_usd, report?.currency)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      {unpricedModels.length > 0 && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>Models needing a price</h3>
            <p className={styles.panelDescription}>
              These tokens remain in totals but are excluded from the dollar estimate.
            </p>
          </div>
          <div className={styles.chipList}>
            {unpricedModels.map((item) => (
              <span key={`${item.provider}:${item.model}`} className={styles.chip}>
                <b>{item.model}</b> · {formatTokens(item.tokens)} tokens
              </span>
            ))}
          </div>
        </section>
      )}

      <section className={styles.notesGrid}>
        <article className={styles.panel}>
          <div className={styles.noteHead}>
            <IconCheckCircle2 size={16} />
            <h3 className={styles.panelTitle}>What this amount means</h3>
          </div>
          <p className={styles.panelDescription}>
            It is the public API equivalent of the observed tokens, including cache and long-context
            rates. OAuth subscriptions and negotiated discounts may make the amount on your invoice
            different.
          </p>
        </article>
        <article className={styles.panel}>
          <div className={styles.noteHead}>
            <IconAlertTriangle size={16} />
            <h3 className={styles.panelTitle}>Historical recovery</h3>
          </div>
          <p className={styles.panelDescription}>
            {report?.historical.notice || 'Existing logs are scanned when accounting starts.'}{' '}
            {report
              ? `${report.historical.imported_usage_records} detailed records imported; ${report.historical.uncostable_legacy_rows.toLocaleString()} legacy requests lacked billing fields.`
              : ''}
          </p>
        </article>
      </section>
    </div>
  );
}

export function UsagePageError() {
  useRouteError();

  return (
    <section className={styles.fatalState} role="alert">
      <span className={styles.eyebrow}>Usage unavailable</span>
      <h1 className={styles.fatalTitle}>We couldn’t display usage right now.</h1>
      <p className={styles.sectionDescription}>
        Your usage ledger is safe. Reload the page to request a fresh report.
      </p>
      <button
        type="button"
        className={styles.primaryAction}
        onClick={() => window.location.reload()}
      >
        <IconRefreshCw size={14} />
        Reload usage
      </button>
    </section>
  );
}
