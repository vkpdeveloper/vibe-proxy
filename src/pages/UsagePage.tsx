import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconCheckCircle2,
  IconDollarSign,
  IconRefreshCw,
} from '@/components/ui/icons';
import { usageCostsApi, type UsageBreakdown, type UsageCostReport } from '@/services/api';
import { useAuthStore } from '@/stores';
import styles from './UsagePage.module.scss';

type Range = '7d' | '30d' | 'month' | 'all';
type Dimension = 'provider' | 'account' | 'model' | 'auth';

const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

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

export function UsagePage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const [range, setRange] = useState<Range>('30d');
  const [dimension, setDimension] = useState<Dimension>('provider');
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

  const rows = useMemo<UsageBreakdown[]>(() => {
    if (!report) return [];
    if (dimension === 'provider') return report.by_provider ?? [];
    if (dimension === 'account') return report.by_account ?? [];
    if (dimension === 'model') return report.by_provider_model ?? [];
    return report.by_auth_type ?? [];
  }, [dimension, report]);

  const daily = report?.daily ?? [];
  const unpricedModels = report?.unpriced_models ?? [];
  const currency = report?.currency ?? 'USD';
  const maxRowCost = Math.max(...rows.map((row) => row.estimated_usd), 0);
  const maxDailyCost = Math.max(...daily.map((day) => day.estimated_usd), 0);
  const pricedCoverage = report?.totals.successful
    ? (report.totals.priced_requests / report.totals.successful) * 100
    : 100;
  const observedInput = report
    ? report.totals.input_tokens + report.totals.cached_tokens + report.totals.cache_write_tokens
    : 0;
  const cacheShare = report && observedInput
    ? (report.totals.cached_tokens / observedInput) * 100
    : 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{t('usage.eyebrow', { defaultValue: 'COST INTELLIGENCE' })}</span>
          <h1>{t('usage.title', { defaultValue: 'Usage & spend' })}</h1>
          <p>
            {t('usage.subtitle', {
              defaultValue: 'Persistent token accounting across every account, provider, and model.',
            })}
          </p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.rangePicker} aria-label="Usage date range">
            {(['7d', '30d', 'month', 'all'] as Range[]).map((value) => (
              <button
                key={value}
                type="button"
                className={range === value ? styles.active : undefined}
                onClick={() => setRange(value)}
              >
                {value === 'month' ? t('usage.month', { defaultValue: 'Month' }) : value.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" className={styles.refreshButton} onClick={() => void load()} disabled={loading}>
            <IconRefreshCw size={17} className={loading ? styles.spinning : undefined} />
            {t('common.refresh', { defaultValue: 'Refresh' })}
          </button>
        </div>
      </header>

      {error && (
        <div className={styles.errorState} role="alert">
          <IconAlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      <section className={styles.summaryGrid} aria-busy={loading}>
        <article className={`${styles.summaryCard} ${styles.costCard}`}>
          <div className={styles.cardIcon}><IconDollarSign size={20} /></div>
          <span className={styles.metricLabel}>{t('usage.estimated_value', { defaultValue: 'Estimated API value' })}</span>
          <strong className={styles.primaryValue}>
            {report ? formatMoney(report.totals.estimated_usd, report.currency) : '—'}
          </strong>
          <span className={styles.metricHint}>
            {t('usage.rates_as_of', { defaultValue: 'Public API rates as of' })} {report?.pricing_as_of || '—'}
          </span>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.metricLabel}>{t('usage.total_tokens', { defaultValue: 'Total tokens' })}</span>
          <strong>{report ? formatTokens(report.totals.total_tokens) : '—'}</strong>
          <span className={styles.metricHint}>
            {report ? `${formatTokens(report.totals.input_tokens)} in · ${formatTokens(report.totals.output_tokens)} out` : '—'}
          </span>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.metricLabel}>{t('usage.requests', { defaultValue: 'Requests' })}</span>
          <strong>{report?.totals.requests.toLocaleString() ?? '—'}</strong>
          <span className={styles.metricHint}>
            {report ? `${report.totals.successful.toLocaleString()} successful · ${report.totals.failed.toLocaleString()} failed` : '—'}
          </span>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.metricLabel}>{t('usage.pricing_coverage', { defaultValue: 'Pricing coverage' })}</span>
          <strong>{report ? `${pricedCoverage.toFixed(1)}%` : '—'}</strong>
          <div className={styles.coverageTrack} aria-hidden="true">
            <span style={{ width: `${Math.min(pricedCoverage, 100)}%` }} />
          </div>
          <span className={styles.metricHint}>{report?.totals.unpriced_requests ?? 0} unpriced requests</span>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.metricLabel}>{t('usage.cache_share', { defaultValue: 'Cached input share' })}</span>
          <strong>{report ? `${cacheShare.toFixed(1)}%` : '—'}</strong>
          <span className={styles.metricHint}>{report ? `${formatTokens(report.totals.cached_tokens)} cached tokens` : '—'}</span>
        </article>
      </section>

      <section className={styles.trendCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>{t('usage.daily_spend', { defaultValue: 'Daily estimated spend' })}</h2>
            <p>{t('usage.daily_spend_hint', { defaultValue: 'Token-rated usage in UTC.' })}</p>
          </div>
          <span className={styles.livePill}><span /> Persistent ledger</span>
        </div>
        <div className={styles.chart}>
          {daily.length === 0 ? (
            <div className={styles.emptyChart}>{loading ? 'Loading usage…' : 'New usage will appear here automatically.'}</div>
          ) : (
            daily.map((day) => (
              <div className={styles.barColumn} key={day.date} title={`${day.date}: ${formatMoney(day.estimated_usd, currency)}`}>
                <span className={styles.barValue}>{formatMoney(day.estimated_usd, currency)}</span>
                <div
                  className={styles.bar}
                  style={{ height: `${Math.max(4, (day.estimated_usd / Math.max(maxDailyCost, 0.000001)) * 100)}%` }}
                />
                <span className={styles.barDate}>{day.date.slice(5)}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={styles.breakdownCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>{t('usage.breakdown', { defaultValue: 'Cost breakdown' })}</h2>
            <p>{t('usage.breakdown_hint', { defaultValue: 'Compare the dimensions that drive token spend.' })}</p>
          </div>
          <div className={styles.dimensionTabs} role="tablist">
            {(['provider', 'account', 'model', 'auth'] as Dimension[]).map((value) => (
              <button
                type="button"
                role="tab"
                aria-selected={dimension === value}
                className={dimension === value ? styles.active : undefined}
                key={value}
                onClick={() => setDimension(value)}
              >
                {value === 'auth' ? 'Credential type' : `${value[0].toUpperCase()}${value.slice(1)}s`}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Name</th><th>Requests</th><th>Input</th><th>Output</th><th>Tokens</th><th>Est. value</th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className={styles.emptyRow}>No usage recorded for this period.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <div className={styles.rowIdentity}>
                      <span className={styles.rowName}>{row.key}</span>
                      <span className={styles.rowTrack}><span style={{ width: `${maxRowCost ? (row.estimated_usd / maxRowCost) * 100 : 0}%` }} /></span>
                    </div>
                  </td>
                  <td>{row.requests.toLocaleString()}</td>
                  <td>{formatTokens(row.input_tokens)}</td>
                  <td>{formatTokens(row.output_tokens)}</td>
                  <td>{formatTokens(row.total_tokens)}</td>
                  <td className={styles.moneyCell}>{formatMoney(row.estimated_usd, report?.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.notesGrid}>
        <article className={styles.noteCard}>
          <IconCheckCircle2 size={20} />
          <div>
            <h3>What this amount means</h3>
            <p>
              It is the public API equivalent of the observed tokens, including cache and long-context rates.
              OAuth subscriptions and negotiated discounts may make the amount on your invoice different.
            </p>
          </div>
        </article>
        <article className={styles.noteCard}>
          <IconAlertTriangle size={20} />
          <div>
            <h3>Historical recovery</h3>
            <p>
              {report?.historical.notice || 'Existing logs are scanned when accounting starts.'}{' '}
              {report ? `${report.historical.imported_usage_records} detailed records imported; ${report.historical.uncostable_legacy_rows.toLocaleString()} legacy requests lacked billing fields.` : ''}
            </p>
          </div>
        </article>
      </section>

      {unpricedModels.length > 0 && (
        <section className={styles.unpricedCard}>
          <div className={styles.sectionHeader}>
            <div><h2>Models needing a price</h2><p>These tokens remain in totals but are excluded from the dollar estimate.</p></div>
          </div>
          <div className={styles.chipList}>
            {unpricedModels.map((item) => (
              <span key={`${item.provider}:${item.model}`}><b>{item.model}</b> · {formatTokens(item.tokens)} tokens</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function UsagePageError() {
  useRouteError();

  return (
    <section className={styles.fatalState} role="alert">
      <div className={styles.fatalIcon}><IconAlertTriangle size={24} /></div>
      <span className={styles.eyebrow}>USAGE UNAVAILABLE</span>
      <h1>We couldn’t display usage right now.</h1>
      <p>Your usage ledger is safe. Reload the page to request a fresh report.</p>
      <button type="button" onClick={() => window.location.reload()}>
        <IconRefreshCw size={17} />
        Reload usage
      </button>
    </section>
  );
}
