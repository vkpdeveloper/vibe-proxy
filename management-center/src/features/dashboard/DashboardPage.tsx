import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  ChartHistogramIcon,
  File01Icon,
  InformationCircleIcon,
  Settings02Icon,
  Shield01Icon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Page, Section } from '@/components/layout/Page';
import { cn } from '@/lib/utils';
import { clientApiKeysApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { formatCompactNumber, formatDateValue, formatPercent } from '@/utils/format';
import { useDashboardOverview } from './hooks/useDashboardOverview';
import { Meter } from './components/Meter';
import { formatUsd, spendToday } from './components/spend';
import { Sparkline } from './components/Sparkline';
import { ThroughputChart } from './components/ThroughputChart';
import { providerLabel, splitWindowMinutes, toneForSuccessRate, type MeterTone } from './utils';

const DASH = '-';

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
  children,
  className,
}: {
  label: string;
  value: string;
  hint: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 bg-card p-4', className)}>
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="font-mono text-2xl tracking-tight tabular-nums">{value}</span>
      {children}
      <span className="text-xs text-faint">{hint}</span>
    </div>
  );
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const serverVersion = useAuthStore((state) => state.serverVersion);
  const serverBuildDate = useAuthStore((state) => state.serverBuildDate);

  const { connected, config, counts, traffic, providers, credentials, refresh } =
    useDashboardOverview();

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

  const routingStrategy = useMemo(() => {
    const raw = config?.routingStrategy?.trim() ?? '';
    if (!raw) return DASH;
    if (raw === 'round-robin') return t('basic_settings.routing_strategy_round_robin');
    if (raw === 'weighted-round-robin') {
      return t('basic_settings.routing_strategy_weighted_round_robin');
    }
    if (raw === 'fill-first') return t('basic_settings.routing_strategy_fill_first');
    if (raw === 'quota-drain') return t('basic_settings.routing_strategy_quota_drain');
    return raw;
  }, [config?.routingStrategy, t]);

  const unknownProviderLabel = t('dashboard.provider_unknown');
  const successRateTone = toneForSuccessRate(traffic.successRate);

  const runtimeRows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: t('dashboard.runtime_routing'), value: routingStrategy },
    { label: t('dashboard.runtime_retry'), value: String(config?.requestRetry ?? 0), mono: true },
    {
      label: t('dashboard.runtime_management_keys'),
      value: counts.managementKeys === null ? DASH : String(counts.managementKeys),
      mono: true,
    },
    { label: t('dashboard.runtime_version'), value: serverVersion?.trim() || DASH, mono: true },
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

  const shortcuts: Array<{ to: string; icon: IconSvgElement; title: string; description: string }> =
    [
      {
        to: '/auth-files',
        icon: Shield01Icon,
        title: t('nav.auth_files'),
        description: t('dashboard.cta_auth_files_desc'),
      },
      {
        to: '/config',
        icon: Settings02Icon,
        title: t('nav.config_management'),
        description: t('dashboard.cta_config_desc'),
      },
      {
        to: '/quota',
        icon: ChartHistogramIcon,
        title: t('nav.quota_management'),
        description: t('dashboard.cta_quota_desc'),
      },
      {
        to: '/logs',
        icon: File01Icon,
        title: t('nav.logs'),
        description: t('dashboard.cta_logs_desc'),
      },
      {
        to: '/system',
        icon: InformationCircleIcon,
        title: t('nav.system_info'),
        description: t('dashboard.cta_system_desc'),
      },
    ];

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
              </span>
              {connected && (
                <Badge variant="secondary" className="gap-1.5">
                  <span className="size-1.5 rounded-full bg-success" />
                  {t('dashboard.hero_live')}
                </Badge>
              )}
            </div>
            <span className="font-mono text-4xl tracking-tight tabular-nums">
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
                  <span className="font-mono text-foreground tabular-nums">
                    {traffic.totalSuccess.toLocaleString()}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-destructive" />
                  {t('stats.failure')}
                  <span className="font-mono text-foreground tabular-nums">
                    {traffic.totalFailure.toLocaleString()}
                  </span>
                </span>
              </span>
              <span className="text-faint">
                {t('dashboard.hero_window_meta', { window: windowLabel })}
              </span>
            </div>
          </div>

          <Stat
            label={t('dashboard.success_rate')}
            value={traffic.successRate === null ? DASH : formatPercent(traffic.successRate)}
            hint={t('dashboard.stat_success_hint', { total: traffic.total.toLocaleString() })}
          >
            <Meter
              value={traffic.successRate}
              tone={successRateTone}
              ariaLabel={t('dashboard.success_rate')}
            />
          </Stat>
          <Stat
            label={t('dashboard.stat_credentials')}
            value={credentials ? credentials.total.toLocaleString() : DASH}
            hint={
              credentials
                ? t('dashboard.stat_credentials_hint', {
                    active: credentials.active,
                    disabled: credentials.disabled + credentials.unavailable,
                  })
                : t('dashboard.stat_credentials_empty')
            }
          >
            {credentials && credentials.total > 0 && (
              <Meter
                value={(credentials.active / credentials.total) * 100}
                ariaLabel={t('dashboard.stat_credentials')}
              />
            )}
          </Stat>
          <Stat
            label={t('dashboard.stat_spend_today')}
            value={spend === null ? DASH : formatUsd(spend)}
            hint={t('dashboard.stat_spend_today_hint')}
          />
          <Stat
            label={t('dashboard.stat_models')}
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
          actions={providers.length > 0 && <Badge variant="secondary">{providers.length}</Badge>}
        >
          {providers.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              {t('dashboard.fleet_empty')}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="grid grid-cols-[3px_minmax(0,1fr)_4.5rem_5.5rem] gap-x-3 border-b px-4 py-2 text-xs text-muted-foreground sm:grid-cols-[3px_minmax(0,1fr)_6rem_5rem_5.5rem]">
                <span />
                <span>{t('dashboard.providers_title')}</span>
                <span className="max-sm:hidden">{t('dashboard.col_volume')}</span>
                <span className="text-right">{t('dashboard.col_requests')}</span>
                <span className="text-right whitespace-nowrap">{t('dashboard.success_rate')}</span>
              </div>
              <ul className="py-1">
                {providers.map((provider) => {
                  const tone = toneForSuccessRate(provider.successRate);
                  const label = providerLabel(provider.id, unknownProviderLabel);
                  return (
                    <li
                      key={provider.id}
                      className="grid grid-cols-[3px_minmax(0,1fr)_4.5rem_5.5rem] items-center gap-x-3 px-4 py-1.5 transition-colors duration-150 hover:bg-muted/60 sm:grid-cols-[3px_minmax(0,1fr)_6rem_5rem_5.5rem]"
                    >
                      <span className={cn('h-4 rounded-full', TONE_BAR[tone])} />
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
                      <span className="text-right font-mono text-[12.5px] tabular-nums">
                        {provider.total.toLocaleString()}
                      </span>
                      <span
                        className={cn(
                          'text-right font-mono text-[12.5px] tabular-nums',
                          TONE_TEXT[tone]
                        )}
                      >
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
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                <Link to="/auth-files">
                  {t('dashboard.health_link')}
                  <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" strokeWidth={2} />
                </Link>
              </Button>
            )
          }
        >
          {!credentials || credentials.total === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              {t('dashboard.health_empty')}
            </p>
          ) : (
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
              <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                {credentials.active > 0 && (
                  <span className="bg-success" style={{ flexGrow: credentials.active }} />
                )}
                {credentials.unavailable > 0 && (
                  <span className="bg-warning" style={{ flexGrow: credentials.unavailable }} />
                )}
                {credentials.disabled > 0 && (
                  <span className="bg-faint" style={{ flexGrow: credentials.disabled }} />
                )}
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
                {[
                  {
                    label: t('dashboard.health_active'),
                    value: credentials.active,
                    dot: 'bg-success',
                  },
                  {
                    label: t('dashboard.health_unavailable'),
                    value: credentials.unavailable,
                    dot: 'bg-warning',
                  },
                  {
                    label: t('dashboard.health_disabled'),
                    value: credentials.disabled,
                    dot: 'bg-faint',
                  },
                ].map((entry) => (
                  <li key={entry.label} className="flex items-center gap-1.5">
                    <span className={cn('size-2 rounded-full', entry.dot)} />
                    {entry.label}
                    <span className="font-mono text-xs text-foreground tabular-nums">
                      {entry.value.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2 border-t pt-4">
                <span className="text-xs text-muted-foreground">
                  {t('dashboard.health_by_type')}
                </span>
                <ul className="flex flex-wrap gap-1.5">
                  {credentials.byType.map((entry) => (
                    <li key={entry.type}>
                      <Badge variant="secondary" className="gap-1.5 font-normal">
                        {providerLabel(entry.type, unknownProviderLabel)}
                        <span className="font-mono text-muted-foreground">
                          {entry.count.toLocaleString()}
                        </span>
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
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link to="/config">
                {t('dashboard.runtime_link')}
                <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" strokeWidth={2} />
              </Link>
            </Button>
          }
        >
          <dl className="divide-y overflow-hidden rounded-xl border bg-card text-sm">
            {runtimeRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-6 px-4 py-2.5">
                <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
                <dd className={cn('min-w-0 truncate text-right', row.mono && 'font-mono text-xs')}>
                  {row.value}
                </dd>
              </div>
            ))}
            {runtimeToggles.map((toggle) => (
              <div
                key={toggle.label}
                className="flex items-center justify-between gap-6 px-4 py-2.5"
              >
                <dt className="text-muted-foreground">{toggle.label}</dt>
                <dd className="flex items-center gap-2 text-[13px]">
                  <span
                    className={cn('size-2 rounded-full', toggle.on ? 'bg-success' : 'bg-faint')}
                  />
                  <span className={toggle.on ? undefined : 'text-muted-foreground'}>
                    {toggle.on ? t('common.yes') : t('common.no')}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title={t('dashboard.shortcuts_title')}>
          <ItemGroup className="gap-2">
            {shortcuts.map((shortcut) => (
              <Item key={shortcut.to} variant="outline" asChild>
                <Link to={shortcut.to}>
                  <ItemMedia variant="icon">
                    <HugeiconsIcon icon={shortcut.icon} strokeWidth={1.75} />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle>{shortcut.title}</ItemTitle>
                    <ItemDescription>{shortcut.description}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      className="size-4 text-muted-foreground"
                      strokeWidth={2}
                    />
                  </ItemActions>
                </Link>
              </Item>
            ))}
          </ItemGroup>
        </Section>
      </Page>
    </>
  );
}
