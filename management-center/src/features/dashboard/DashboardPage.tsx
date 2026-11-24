import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Page, Section } from '@/components/layout/Page';
import { usePhone } from '@/components/layout/pageBar';
import { cn } from '@/lib/utils';
import { clientApiKeysApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { formatCompactNumber, formatDateValue, formatPercent } from '@/utils/format';
import { useDashboardOverview } from './hooks/useDashboardOverview';
import { Meter } from './components/Meter';
import { formatUsd, spendToday } from './components/spend';
import { Sparkline } from './components/Sparkline';
import { ProviderLogo } from '@/features/authFiles/components/ProviderLogo';
import { ThroughputChart } from './components/ThroughputChart';
import { providerLabel, splitWindowMinutes, toneForSuccessRate, type MeterTone } from './utils';

const DASH = '-';

// The same labels Config shows for each strategy.
const ROUTING_LABEL_KEYS: Record<string, string> = {
  'round-robin': 'config_management.visual.sections.network.strategy_round_robin',
  'weighted-round-robin': 'config_management.visual.sections.network.strategy_weighted_round_robin',
  'fill-first': 'config_management.visual.sections.network.strategy_fill_first',
  'quota-drain': 'config_management.visual.sections.network.strategy_quota_drain',
};

const runtimeCell =
  'flex items-center justify-between gap-6 px-4 py-2.5 sm:flex-col sm:items-start sm:justify-start sm:gap-1';

// On phones the link's arrow lines up with the gutter and the button is a 40px target.
const sectionLink = 'text-muted-foreground max-sm:-mr-1.5 max-sm:h-10';

const TONE_TEXT: Record<MeterTone, string> = {
  good: 'text-success',
  warning: 'text-warning',
  critical: 'text-destructive',
  idle: 'text-muted-foreground',
};

const TONE_BAR: Record<MeterTone, string> = {
  good: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-destructive',
  idle: 'bg-faint',
};

/** Thousands separators up to six digits, compact above that so the layout holds. */
const formatHeadline = (value: number): string =>
  value < 100_000 ? value.toLocaleString() : formatCompactNumber(value);

function Stat({
  label,
  value,
  hint,
  to,
  children,
  className,
}: {
  label: string;
  value: string;
  /** Empty when the children already say it. */
  hint: string;
  /** Where the tile leads; it then shows a chevron and a press state. */
  to?: string;
  children?: ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
        {label}
        {to && (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            aria-hidden
            className="size-4 shrink-0 text-faint transition-colors group-hover:text-muted-foreground"
          />
        )}
      </span>
      <span className="text-2xl font-medium tracking-tight">{value}</span>
      {children}
      {/* Phones keep the tiles to label, number and meter; the sections below carry the detail. */}
      {hint && <span className="text-xs text-faint max-sm:hidden">{hint}</span>}
    </>
  );
  const tile = cn('flex min-w-0 flex-col gap-1.5 bg-card p-4', className);
  if (!to) return <div className={tile}>{body}</div>;
  return (
    <Link
      to={to}
      className={cn(
        tile,
        'group transition-colors duration-150 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted'
      )}
    >
      {body}
    </Link>
  );
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const serverVersion = useAuthStore((state) => state.serverVersion);
  const serverBuildDate = useAuthStore((state) => state.serverBuildDate);

  const { connected, config, counts, traffic, providers, credentials, refresh } =
    useDashboardOverview();
  const phone = usePhone();

  // Same source as the Client API Keys page, so both show the same number.
  const [spend, setSpend] = useState<number | null>(null);
  const loadSpend = useCallback(async () => {
    if (!connected) return;
    try {
      const { keys } = await clientApiKeysApi.list();
      setSpend(spendToday(keys));
    } catch {
      setSpend(null);
    }
  }, [connected]);

  useEffect(() => {
    void loadSpend();
  }, [loadSpend]);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refresh(), loadSpend()]);
  }, [refresh, loadSpend]);

  useHeaderRefresh(refreshAll, connected);

  const windowLabel = useMemo(() => {
    if (traffic.windowMinutes <= 0) return DASH;
    const { hours, minutes } = splitWindowMinutes(traffic.windowMinutes);
    if (hours === 0) return t('dashboard.window_m', { minutes });
    if (minutes === 0) return t('dashboard.window_h', { hours });
    return t('dashboard.window_hm', { hours, minutes });
  }, [traffic.windowMinutes, t]);

  const unknownProviderLabel = t('dashboard.provider_unknown');
  const successRateTone = toneForSuccessRate(traffic.successRate);

  const routing = config?.routingStrategy?.trim() ?? '';
  const runtimeRows: Array<{ label: string; value: string; mono?: boolean; to?: string }> = [
    {
      label: t('dashboard.runtime_routing'),
      value: routing in ROUTING_LABEL_KEYS ? t(ROUTING_LABEL_KEYS[routing]) : routing || DASH,
    },
    { label: t('dashboard.runtime_retry'), value: String(config?.requestRetry ?? 0) },
    {
      label: t('nav_short.api_keys'),
      value: counts.apiKeys === null ? DASH : String(counts.apiKeys),
      to: '/api-keys',
    },
    { label: t('system_info.proxy_version'), value: serverVersion?.trim() || DASH, mono: true },
    {
      label: t('dashboard.runtime_build'),
      value: formatDateValue(serverBuildDate, i18n.language) || DASH,
    },
    { label: t('dashboard.runtime_proxy'), value: config?.proxyUrl?.trim() || DASH, mono: true },
  ];

  const runtimeToggles = config
    ? [
        { label: t('dashboard.runtime_debug'), on: Boolean(config.debug) },
        { label: t('dashboard.runtime_file_logging'), on: Boolean(config.loggingToFile) },
        { label: t('dashboard.runtime_request_log'), on: Boolean(config.requestLog) },
        { label: t('dashboard.runtime_ws_auth'), on: Boolean(config.wsAuth) },
        { label: t('dashboard.runtime_model_prefix'), on: Boolean(config.forceModelPrefix) },
      ]
    : [];

  return (
    <>
      <Page wide title={t('nav.dashboard')}>
        <section
          aria-label={t('dashboard.stats_aria')}
          className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4"
        >
          <div className="col-span-2 flex min-w-0 flex-col gap-3 bg-card p-4 sm:col-span-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-muted-foreground">
                {t('dashboard.hero_requests_label')}
                {/* Phones hide the window line below, so the label carries the period. */}
                {traffic.windowMinutes > 0 && (
                  <span className="sm:hidden">
                    {' · '}
                    {t('dashboard.window_last', { window: windowLabel })}
                  </span>
                )}
              </span>
              {connected && (
                <Badge variant="secondary" className="gap-1.5">
                  <span className="size-1.5 rounded-full bg-success" />
                  {t('dashboard.hero_live')}
                </Badge>
              )}
            </div>
            <span className="text-4xl font-medium tracking-tight">
              {connected ? formatHeadline(traffic.total) : DASH}
            </span>
            {traffic.total > 0 && (
              <div className="flex h-1 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                {traffic.totalSuccess > 0 && (
                  <span className="bg-success" style={{ flexGrow: traffic.totalSuccess }} />
                )}
                {traffic.totalFailure > 0 && (
                  <span
                    className="min-w-1 bg-destructive"
                    style={{ flexGrow: traffic.totalFailure }}
                  />
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
              <span className="flex items-center gap-4 text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-success" />
                  {t('stats.success')}
                  <span className="text-foreground">{traffic.totalSuccess.toLocaleString()}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-destructive" />
                  {t('dashboard.failed_attempts')}
                  <span className="text-foreground">{traffic.totalFailure.toLocaleString()}</span>
                </span>
              </span>
              <span className="text-faint max-sm:hidden">
                {t('dashboard.hero_window_meta', { window: windowLabel })}
              </span>
            </div>
          </div>

          <Stat
            label={t('dashboard.success_rate')}
            to="/logs"
            value={traffic.successRate === null ? DASH : formatPercent(traffic.successRate)}
            hint={t('dashboard.stat_success_hint', { total: traffic.total.toLocaleString() })}
          >
            {/* Desktop already shows the split as the bar right above. */}
            <Meter
              value={traffic.successRate}
              tone={successRateTone}
              ariaLabel={t('dashboard.success_rate')}
              className="sm:hidden"
            />
          </Stat>
          <Stat
            label={t('dashboard.stat_credentials')}
            // The tile is one link, so with problems it opens straight on them.
            to={
              credentials && credentials.problem > 0 ? '/auth-files?status=problem' : '/auth-files'
            }
            value={credentials ? credentials.total.toLocaleString() : DASH}
            // With problems, the problem count below is the one line worth reading.
            hint={
              !credentials
                ? t('dashboard.stat_credentials_empty')
                : credentials.problem > 0
                  ? ''
                  : credentials.disabled > 0
                    ? t('dashboard.stat_credentials_hint', {
                        active: credentials.active,
                        disabled: credentials.disabled,
                      })
                    : t('dashboard.stat_credentials_active', { active: credentials.active })
            }
          >
            {credentials && credentials.problem > 0 && (
              <span className="text-xs text-warning">
                {t('dashboard.stat_problems', { count: credentials.problem })}
              </span>
            )}
          </Stat>
          <Stat
            label={t('dashboard.stat_spend_today')}
            to="/usage?range=today"
            value={spend === null ? DASH : formatUsd(spend)}
            hint={t('dashboard.stat_spend_today_hint')}
          />
          <Stat
            label={t('dashboard.stat_models')}
            to="/system?tab=models"
            value={counts.models === null ? DASH : counts.models.toLocaleString()}
            hint={t('dashboard.stat_models_hint')}
          />
        </section>

        <Section title={t('dashboard.traffic_eyebrow')}>
          <div className="overflow-hidden rounded-xl border bg-card">
            <ThroughputChart traffic={traffic} windowLabel={windowLabel} />
          </div>
        </Section>

        <Section
          title={t('dashboard.providers_title')}
          actions={
            providers.length > 0 &&
            (phone ? (
              traffic.windowMinutes > 0 && (
                <span className="text-xs text-muted-foreground">
                  {t('dashboard.window_last', { window: windowLabel })}
                </span>
              )
            ) : (
              <Badge variant="secondary">{providers.length}</Badge>
            ))
          }
        >
          {providers.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground sm:border-none">
              {t('dashboard.fleet_empty')}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_3.5rem_3.5rem] gap-x-3 border-b px-4 py-2 text-xs text-muted-foreground sm:grid-cols-[1.25rem_minmax(0,1fr)_6rem_5rem_5.5rem]">
                <span />
                <span>{t('dashboard.col_provider')}</span>
                <span className="max-sm:hidden">{t('dashboard.col_volume')}</span>
                <span className="text-right">{t('dashboard.col_requests')}</span>
                <span className="text-right whitespace-nowrap">
                  <span className="sm:hidden">{t('dashboard.col_rate')}</span>
                  <span className="max-sm:hidden">{t('dashboard.success_rate')}</span>
                </span>
              </div>
              <ul className="py-1">
                {providers.map((provider) => {
                  const tone = toneForSuccessRate(provider.successRate);
                  const label = providerLabel(provider.id, unknownProviderLabel);
                  return (
                    <li
                      key={provider.id}
                      className="grid grid-cols-[1.25rem_minmax(0,1fr)_3.5rem_3.5rem] items-center gap-x-3 px-4 py-1.5 transition-colors duration-150 hover:bg-muted/60 sm:grid-cols-[1.25rem_minmax(0,1fr)_6rem_5rem_5.5rem]"
                    >
                      <span className="relative">
                        <ProviderLogo type={provider.id} className="size-5 rounded-[5px]" />
                        <span
                          className={cn(
                            'absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-card',
                            TONE_BAR[tone]
                          )}
                        />
                      </span>
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-[13px]">{label}</span>
                        <span className="truncate text-xs text-faint max-sm:hidden">
                          {t('dashboard.fleet_credentials', { value: provider.credentials })}
                        </span>
                      </span>
                      <Sparkline
                        points={provider.buckets.map((bucket) => bucket.success + bucket.failed)}
                        ariaLabel={t('dashboard.fleet_spark_label', { provider: label })}
                        className="text-muted-foreground max-sm:hidden"
                      />
                      <span className="text-right text-[13px]">
                        {provider.total.toLocaleString()}
                      </span>
                      <span className={cn('text-right text-[13px]', TONE_TEXT[tone])}>
                        {provider.successRate === null ? DASH : formatPercent(provider.successRate)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Section>

        <Section
          title={t('dashboard.health_title')}
          actions={
            credentials &&
            credentials.total > 0 && (
              <Button asChild variant="ghost" size="sm" className={sectionLink}>
                <Link to="/auth-files">
                  {t('dashboard.health_link')}
                  <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" strokeWidth={2} />
                </Link>
              </Button>
            )
          }
        >
          {!credentials || credentials.total === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground sm:border-none">
              {t('dashboard.health_empty')}
            </p>
          ) : (
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
              <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                {credentials.active > 0 && (
                  <span className="bg-success" style={{ flexGrow: credentials.active }} />
                )}
                {credentials.problem > 0 && (
                  <span className="bg-warning" style={{ flexGrow: credentials.problem }} />
                )}
                {credentials.disabled > 0 && (
                  <span className="bg-faint" style={{ flexGrow: credentials.disabled }} />
                )}
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground max-sm:gap-y-2">
                {[
                  {
                    status: 'active',
                    label: t('dashboard.health_active'),
                    value: credentials.active,
                    dot: 'bg-success',
                  },
                  {
                    status: 'problem',
                    label: t('dashboard.health_problem'),
                    value: credentials.problem,
                    dot: 'bg-warning',
                  },
                  {
                    status: 'disabled',
                    label: t('dashboard.health_disabled'),
                    value: credentials.disabled,
                    dot: 'bg-faint',
                  },
                ].map((entry) => (
                  <li key={entry.status}>
                    <Link
                      to={`/auth-files?status=${entry.status}`}
                      className="flex items-center gap-1.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-10"
                    >
                      <span className={cn('size-2 rounded-full', entry.dot)} />
                      {entry.label}
                      <span className="text-foreground">{entry.value.toLocaleString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2 border-t pt-4">
                <span className="text-xs text-muted-foreground">
                  {t('dashboard.health_by_type')}
                </span>
                <ul className="flex flex-wrap gap-1.5 max-sm:gap-2">
                  {credentials.byType.map((entry) => (
                    <li key={entry.type}>
                      <Badge
                        asChild
                        variant="secondary"
                        className="gap-1.5 font-normal max-sm:h-10 max-sm:px-3.5 max-sm:text-[13px]"
                      >
                        {/* Files with no provider have no filter to open. */}
                        <Link
                          to={
                            entry.type === 'unknown'
                              ? '/auth-files'
                              : `/auth-files?provider=${encodeURIComponent(entry.type)}`
                          }
                        >
                          {providerLabel(entry.type, unknownProviderLabel)}
                          <span className="text-muted-foreground">
                            {entry.count.toLocaleString()}
                          </span>
                        </Link>
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Section>

        <Section
          title={t('dashboard.runtime_eyebrow')}
          actions={
            <Button asChild variant="ghost" size="sm" className={sectionLink}>
              {/* Opens Config at the routing and retry settings. */}
              <Link to="/config?field=routingStrategy">
                {t('dashboard.runtime_link')}
                <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" strokeWidth={2} />
              </Link>
            </Button>
          }
        >
          <div className="overflow-hidden rounded-xl border bg-card text-sm">
            {/* Desktop: a grid of label-over-value cells, so each value sits by its label. */}
            <ul className="divide-y sm:grid sm:grid-cols-3 sm:divide-y-0 sm:py-1 xl:grid-cols-4">
              {runtimeRows.map((row) => {
                const value = (
                  // Phones wrap long values instead of cutting them off.
                  <span
                    className={cn(
                      'min-w-0 truncate text-right max-sm:whitespace-normal sm:max-w-full sm:text-left',
                      // The placeholder dash stays in the body font.
                      row.mono && row.value !== DASH
                        ? 'font-mono text-xs max-sm:break-all'
                        : 'max-sm:break-words'
                    )}
                  >
                    {row.value}
                  </span>
                );
                const label = (
                  <span className="shrink-0 text-muted-foreground sm:text-[13px]">{row.label}</span>
                );
                const rowClass = cn(runtimeCell, 'max-sm:gap-4');
                return (
                  <li key={row.label}>
                    {row.to ? (
                      <Link
                        to={row.to}
                        className={cn(
                          rowClass,
                          'transition-colors duration-150 outline-none hover:bg-muted/60 max-sm:min-h-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted'
                        )}
                      >
                        {label}
                        <span className="flex min-w-0 items-center gap-1">
                          {value}
                          <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            strokeWidth={2}
                            aria-hidden
                            className="-mr-1 size-4 shrink-0 text-faint"
                          />
                        </span>
                      </Link>
                    ) : (
                      <div className={rowClass}>
                        {label}
                        {value}
                      </div>
                    )}
                  </li>
                );
              })}
              {!phone &&
                runtimeToggles.map((toggle) => (
                  <li key={toggle.label} className={runtimeCell}>
                    <span className="text-[13px] text-muted-foreground">{toggle.label}</span>
                    <span className="flex items-center gap-2 text-[13px]">
                      <span
                        className={cn('size-2 rounded-full', toggle.on ? 'bg-success' : 'bg-faint')}
                      />
                      <span className={toggle.on ? undefined : 'text-muted-foreground'}>
                        {toggle.on ? t('common.yes') : t('common.no')}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
            {/* Phones fold the on/off settings into one row of chips. */}
            {phone && runtimeToggles.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 border-t px-4 py-3">
                {runtimeToggles.map((toggle) => (
                  <li
                    key={toggle.label}
                    className={cn(
                      'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs',
                      !toggle.on && 'text-muted-foreground'
                    )}
                  >
                    <span
                      className={cn('size-1.5 rounded-full', toggle.on ? 'bg-success' : 'bg-faint')}
                    />
                    {toggle.label}
                    <span className="sr-only">{toggle.on ? t('common.yes') : t('common.no')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      </Page>
    </>
  );
}
