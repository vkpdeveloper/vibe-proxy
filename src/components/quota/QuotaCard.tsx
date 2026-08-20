/**
 * Generic quota card component.
 */

import { useTranslation } from 'react-i18next';
import type { ReactElement, ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/Button';
import { IconNetwork, IconRefreshCw } from '@/components/ui/icons';
import type {
  AuthFileItem,
  QuotaCapacityState,
  QuotaCapacityWindow,
  ResolvedTheme,
  ThemeColors,
} from '@/types';
import { formatQuotaResetTime, TYPE_COLORS } from '@/utils/quota';
import styles from '@/pages/QuotaPage.module.scss';

type QuotaStatus = 'idle' | 'loading' | 'success' | 'error';

export interface QuotaStatusState {
  status: QuotaStatus;
  error?: string;
  errorStatus?: number;
}

export interface QuotaProgressBarProps {
  percent: number | null;
  highThreshold: number;
  mediumThreshold: number;
}

interface StoredQuotaSnapshot {
  state: QuotaCapacityState;
  windows: QuotaCapacityWindow[];
  fetchedAt: string | null;
  stale: boolean;
}

const parseTimestamp = (value?: string): number | null => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const resolveStoredQuotaSnapshot = (item: AuthFileItem): StoredQuotaSnapshot | null => {
  const state = item.quota_capacity ?? item.quotaCapacity;
  if (!state || typeof state !== 'object' || state.supported !== true) return null;

  const windows = (Array.isArray(state.windows) ? state.windows : []).filter(
    (window): window is QuotaCapacityWindow =>
      Boolean(window) &&
      window.known === true &&
      typeof window.remaining_percent === 'number' &&
      Number.isFinite(window.remaining_percent)
  );
  const fetchedAt = parseTimestamp(state.fetched_at);
  const staleAt = parseTimestamp(state.stale_at);

  if (windows.length === 0 && !state.last_error) return null;

  return {
    state,
    windows,
    fetchedAt: fetchedAt === null ? null : state.fetched_at || null,
    stale: staleAt !== null && staleAt <= Date.now(),
  };
};

export function QuotaProgressBar({
  percent,
  highThreshold,
  mediumThreshold,
}: QuotaProgressBarProps) {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const normalized = percent === null ? null : clamp(percent, 0, 100);
  const fillClass =
    normalized === null
      ? styles.quotaBarFillMedium
      : normalized >= highThreshold
        ? styles.quotaBarFillHigh
        : normalized >= mediumThreshold
          ? styles.quotaBarFillMedium
          : styles.quotaBarFillLow;
  const widthPercent = Math.round((normalized ?? 0) * 100) / 100;

  return (
    <div className={styles.quotaBar}>
      <div
        className={`${styles.quotaBarFill} ${fillClass}`}
        style={{ width: `${widthPercent}%` }}
      />
    </div>
  );
}

export interface QuotaRenderHelpers {
  styles: typeof styles;
  QuotaProgressBar: (props: QuotaProgressBarProps) => ReactElement;
}

interface QuotaCardProps<TState extends QuotaStatusState> {
  item: AuthFileItem;
  quota?: TState;
  resolvedTheme: ResolvedTheme;
  i18nPrefix: string;
  cardClassName: string;
  defaultType: string;
  canRefresh?: boolean;
  onRefresh?: () => void;
  resetQuotaAction?: ReactNode;
  renderQuotaItems: (quota: TState, t: TFunction, helpers: QuotaRenderHelpers) => ReactNode;
}

export function QuotaCard<TState extends QuotaStatusState>({
  item,
  quota,
  resolvedTheme,
  i18nPrefix,
  cardClassName,
  defaultType,
  canRefresh = false,
  onRefresh,
  resetQuotaAction,
  renderQuotaItems,
}: QuotaCardProps<TState>) {
  const { t } = useTranslation();

  const displayType = item.type || item.provider || defaultType;
  const typeColorSet = TYPE_COLORS[displayType] || TYPE_COLORS.unknown;
  const typeColor: ThemeColors =
    resolvedTheme === 'dark' && typeColorSet.dark ? typeColorSet.dark : typeColorSet.light;

  const quotaStatus = quota?.status ?? 'idle';
  const quotaLoading = quotaStatus === 'loading';
  const storedSnapshot = quotaStatus === 'idle' ? resolveStoredQuotaSnapshot(item) : null;
  const hasStoredSnapshot = storedSnapshot !== null;
  const quotaErrorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );
  const idleMessageKey = `${i18nPrefix}.idle`;
  const routingSelection = item.routing_selection ?? item.routingSelection;
  const isRoutingSelected = routingSelection?.selected === true;
  const routingSelectionTitle = isRoutingSelected
    ? routingSelection.model
      ? t('auth_files.routing_selected_hint', {
          model: routingSelection.model,
          time: formatQuotaResetTime(routingSelection.expires_at),
        })
      : t('auth_files.routing_selected_hint_no_model', {
          time: formatQuotaResetTime(routingSelection.expires_at),
        })
    : undefined;

  const getTypeLabel = (type: string): string => {
    const key = `auth_files.filter_${type}`;
    const translated = t(key);
    if (translated !== key) return translated;
    if (type.toLowerCase() === 'iflow') return 'iFlow';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div
      className={`${styles.fileCard} ${cardClassName} ${isRoutingSelected ? styles.fileCardRoutingSelected : ''}`}
    >
      <div className={styles.cardHeader}>
        <span
          className={styles.typeBadge}
          style={{
            backgroundColor: typeColor.bg,
            color: typeColor.text,
            ...(typeColor.border ? { border: typeColor.border } : {}),
          }}
        >
          {getTypeLabel(displayType)}
        </span>
        {isRoutingSelected && (
          <span className={styles.routingSelectionBadge} title={routingSelectionTitle}>
            <IconNetwork className={styles.routingSelectionIcon} size={12} />
            {t('auth_files.routing_selected')}
          </span>
        )}
        <span className={styles.fileName}>{item.name}</span>
      </div>

      <div className={styles.quotaSection}>
        {quotaLoading ? (
          <div className={styles.quotaMessage}>{t(`${i18nPrefix}.loading`)}</div>
        ) : quotaStatus === 'idle' ? (
          storedSnapshot ? (
            <>
              {storedSnapshot.windows.map((window) => {
                const remaining = Math.max(0, Math.min(100, window.remaining_percent));
                const resetLabel = formatQuotaResetTime(window.reset_at);

                return (
                  <div key={window.id} className={styles.quotaRow}>
                    <div className={styles.quotaRowHeader}>
                      <span className={styles.quotaModel}>{window.label}</span>
                      <div className={styles.quotaMeta}>
                        <span className={styles.quotaPercent}>{Math.round(remaining)}%</span>
                        {resetLabel !== '-' && (
                          <span className={styles.quotaReset}>{resetLabel}</span>
                        )}
                      </div>
                    </div>
                    <QuotaProgressBar percent={remaining} highThreshold={70} mediumThreshold={30} />
                  </div>
                );
              })}
              <div className={styles.quotaSnapshotMeta}>
                {storedSnapshot.fetchedAt && (
                  <span>
                    {t('quota_management.snapshot_updated', {
                      time: formatQuotaResetTime(storedSnapshot.fetchedAt),
                    })}
                  </span>
                )}
                {storedSnapshot.stale && (
                  <span className={styles.quotaSnapshotStale}>
                    {t('auth_files.quota_drain_stale')}
                  </span>
                )}
              </div>
              {storedSnapshot.state.last_error && (
                <div className={styles.quotaWarning}>
                  {t('auth_files.quota_drain_refresh_error', {
                    message: storedSnapshot.state.last_error,
                  })}
                </div>
              )}
            </>
          ) : onRefresh ? (
            <button
              type="button"
              className={`${styles.quotaMessage} ${styles.quotaMessageAction}`}
              onClick={onRefresh}
              disabled={!canRefresh}
            >
              {t(idleMessageKey)}
            </button>
          ) : (
            <div className={styles.quotaMessage}>{t(idleMessageKey)}</div>
          )
        ) : quotaStatus === 'error' ? (
          <div className={styles.quotaError}>
            {t(`${i18nPrefix}.load_failed`, {
              message: quotaErrorMessage,
            })}
          </div>
        ) : quota ? (
          renderQuotaItems(quota, t, { styles, QuotaProgressBar })
        ) : (
          <div className={styles.quotaMessage}>{t(idleMessageKey)}</div>
        )}
      </div>

      {(resetQuotaAction || (onRefresh && (quotaStatus !== 'idle' || hasStoredSnapshot))) && (
        <div className={styles.quotaCardActions}>
          {resetQuotaAction}
          {onRefresh && (quotaStatus !== 'idle' || hasStoredSnapshot) && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={styles.quotaRefreshButton}
              onClick={onRefresh}
              disabled={!canRefresh || quotaLoading}
              loading={quotaLoading}
              title={t('auth_files.quota_refresh_hint')}
            >
              {!quotaLoading && <IconRefreshCw size={14} />}
              {t('auth_files.quota_refresh_single')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const resolveQuotaErrorMessage = (
  t: TFunction,
  status: number | undefined,
  fallback: string
): string => {
  if (status === 404) return t('common.quota_update_required');
  if (status === 403) return t('common.quota_check_credential');
  return fallback;
};
