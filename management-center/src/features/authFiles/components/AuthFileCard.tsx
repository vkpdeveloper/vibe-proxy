import { useState, type CSSProperties } from 'react';
import { getAuthFileRefreshKey } from '@/features/authFiles/manualRefresh';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconDownload,
  IconInfo,
  IconModelCluster,
  IconNetwork,
  IconRefreshCw,
  IconSettings,
  IconTrash2,
} from '@/components/ui/icons';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import { EmailPrivacyText } from '@/components/common/EmailPrivacyText';
import type { AuthFileItem, QuotaCapacityState, QuotaCapacityWindow } from '@/types';
import { statusBarDataFromRecentRequests } from '@/utils/recentRequests';
import { formatDateTimeValue, formatFileSize } from '@/utils/format';
import {
  formatModified,
  getAuthFileIcon,
  getAuthFileStatusMessage,
  getThemeSurfaceIconBackground,
  hasAuthFileStatusWarning,
  getTypeColor,
  getTypeLabel,
  isRuntimeOnlyAuthFile,
  isThemeSurfaceIconProvider,
  normalizeProviderKey,
  supportsAuthFileManualRefresh,
  type AuthFileQuotaFilter,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import { deriveAuthFileIdentity } from '@/features/authFiles/identity';
import { resolveAuthFileQuotaType } from '@/features/authFiles/logic';
import type { AuthFileStatusBarData } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import { AuthFileQuotaSection } from '@/features/authFiles/components/AuthFileQuotaSection';
import { AuthFileCooldownSection } from './AuthFileCooldownSection';
import { getSiwcBindingStatus, supportsSiwcBinding } from '@/features/oauth/siwcBinding';
import { SiwcStatusBadge } from '@/features/oauth/components/SiwcStatusBadge';
import styles from './AuthFileCard.module.scss';

const MIN_MEANINGFUL_DATE_MS = Date.UTC(2000, 0, 1);

const parseMeaningfulDate = (value?: string): number | null => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= MIN_MEANINGFUL_DATE_MS ? timestamp : null;
};

type QuotaDrainDisplay = {
  state: QuotaCapacityState;
  window: QuotaCapacityWindow | null;
  status: 'active' | 'exhausted' | 'stale' | 'unavailable';
  remainingPercent: number | null;
};

const resolveQuotaDrainDisplay = (file: AuthFileItem): QuotaDrainDisplay | null => {
  const state = file.quota_capacity ?? file.quotaCapacity;
  if (!state || typeof state !== 'object') return null;

  const now = Date.now();
  const windows = Array.isArray(state.windows) ? state.windows : [];
  const knownWindows = windows.filter((window) => {
    if (
      !window ||
      window.known !== true ||
      typeof window.remaining_percent !== 'number' ||
      !Number.isFinite(window.remaining_percent)
    ) {
      return false;
    }
    const resetAt = parseMeaningfulDate(window.reset_at);
    return resetAt === null || resetAt > now;
  });
  const routingWindows = knownWindows.filter((window) => window.routing === true);
  const window =
    [...routingWindows].sort(
      (left, right) => left.remaining_percent - right.remaining_percent
    )[0] ?? null;

  const fetchedAt = parseMeaningfulDate(state.fetched_at);
  const staleAt = parseMeaningfulDate(state.stale_at);
  const stale = fetchedAt !== null && staleAt !== null && staleAt <= now;
  const remainingPercent = window ? Math.max(0, Math.min(100, window.remaining_percent)) : null;
  const status = stale
    ? 'stale'
    : window?.hard_exhausted
      ? 'exhausted'
      : remainingPercent !== null
        ? 'active'
        : 'unavailable';

  return { state, window, status, remainingPercent };
};

export type AuthFileCardProps = {
  file: AuthFileItem;
  compact: boolean;
  selected: boolean;
  resolvedTheme: ResolvedTheme;
  disableControls: boolean;
  deleting: string | null;
  statusUpdating: Record<string, boolean>;
  manualRefreshing: Record<string, boolean>;
  cooldownResetting: Record<string, boolean>;
  quotaFilterType: AuthFileQuotaFilter;
  statusBarCache: Map<string, AuthFileStatusBarData>;
  /** One-time entrance delay; null/undefined disables entrance motion. */
  entranceDelayMs?: number | null;
  onShowModels: (file: AuthFileItem) => void;
  onDownload: (name: string) => void;
  onManualRefresh: (file: AuthFileItem) => void;
  onCooldownReset: (file: AuthFileItem) => void;
  onOpenPrefixProxyEditor: (file: AuthFileItem) => void;
  onDelete: (name: string) => void;
  onToggleStatus: (file: AuthFileItem, enabled: boolean) => void;
  onToggleSelect: (name: string) => void;
};

export function AuthFileCard(props: AuthFileCardProps) {
  const { t, i18n } = useTranslation();
  const {
    file,
    compact,
    selected,
    resolvedTheme,
    disableControls,
    deleting,
    statusUpdating,
    manualRefreshing,
    cooldownResetting,
    quotaFilterType,
    statusBarCache,
    entranceDelayMs,
    onShowModels,
    onDownload,
    onManualRefresh,
    onCooldownReset,
    onOpenPrefixProxyEditor,
    onDelete,
    onToggleStatus,
    onToggleSelect,
  } = props;

  const isRuntimeOnly = isRuntimeOnlyAuthFile(file);
  const providerKey = normalizeProviderKey(String(file.type ?? file.provider ?? 'unknown'));
  const isAistudio = providerKey === 'aistudio';
  const showModelsButton = !isRuntimeOnly || isAistudio;
  const showManualRefreshButton = !isRuntimeOnly && supportsAuthFileManualRefresh(providerKey);
  const isManualRefreshing = manualRefreshing[getAuthFileRefreshKey(file)] === true;
  const typeLabel = getTypeLabel(t, providerKey);
  const typeColor = getTypeColor(providerKey, resolvedTheme);
  const providerIcon = getAuthFileIcon(providerKey, resolvedTheme);
  const useThemeSurfaceIcon = isThemeSurfaceIconProvider(providerKey);

  const quotaType = resolveAuthFileQuotaType(file, quotaFilterType);
  const showQuotaLayout = Boolean(quotaType) && !isRuntimeOnly && !compact;

  const successCount = file.successCount ?? 0;
  const failureCount = file.failureCount ?? 0;
  const authIndexKey = typeof file.authIndex === 'string' ? file.authIndex : null;
  const isCooldownResetting = Boolean(authIndexKey && cooldownResetting[authIndexKey]);
  const statusData =
    (authIndexKey && statusBarCache.get(authIndexKey)) ||
    statusBarDataFromRecentRequests(file.recentRequests ?? []);

  const rawStatusMessage = getAuthFileStatusMessage(file);
  const hasStatusWarning = hasAuthFileStatusWarning(file);

  const priorityValue = Number.isSafeInteger(file.priority) ? file.priority : undefined;
  const weightValue = Number.isSafeInteger(file.weight) ? file.weight : undefined;
  const noteValue = typeof file.note === 'string' ? file.note.trim() : '';
  // Lead with account identity and use the file name as secondary text.
  const identity = deriveAuthFileIdentity(file);
  const siwcExpires = file.siwcExpiresAt
    ? formatDateTimeValue(file.siwcExpiresAt, i18n.language)
    : '';

  const stateLabel = isRuntimeOnly
    ? t('auth_files.type_virtual')
    : file.disabled
      ? t('auth_files.health_status_disabled')
      : hasStatusWarning
        ? t('auth_files.health_status_warning')
        : rawStatusMessage
          ? t('auth_files.health_status_healthy')
          : t('auth_files.status_toggle_label');
  const stateBadgeClass = isRuntimeOnly
    ? styles.stateVirtual
    : file.disabled
      ? styles.stateDisabled
      : hasStatusWarning
        ? styles.stateWarning
        : styles.stateActive;

  const quotaDrain = resolveQuotaDrainDisplay(file);
  const quotaDrainLabel = quotaDrain
    ? quotaDrain.status === 'exhausted'
      ? t('auth_files.quota_drain_exhausted')
      : quotaDrain.status === 'stale'
        ? t('auth_files.quota_drain_stale')
        : quotaDrain.remainingPercent !== null
          ? t('auth_files.quota_drain_remaining', {
              percent: Math.round(quotaDrain.remainingPercent),
            })
          : t('auth_files.quota_drain_unavailable')
    : '';
  const quotaDrainBadgeClass = quotaDrain
    ? quotaDrain.status === 'active'
      ? styles.quotaDrainBadgeActive
      : quotaDrain.status === 'exhausted'
        ? styles.quotaDrainBadgeExhausted
        : quotaDrain.status === 'stale'
          ? styles.quotaDrainBadgeStale
          : styles.quotaDrainBadgeUnavailable
    : '';
  const quotaDrainResetAt =
    quotaDrain?.window?.reset_at && parseMeaningfulDate(quotaDrain.window.reset_at) !== null
      ? quotaDrain.window.reset_at
      : null;
  const routingSelection = file.routing_selection ?? file.routingSelection;
  const routingSelectionExpiresAt = parseMeaningfulDate(routingSelection?.expires_at);
  const isRoutingSelected =
    routingSelection?.selected === true &&
    routingSelectionExpiresAt !== null &&
    routingSelectionExpiresAt > 0;
  const routingSelectionTitle = isRoutingSelected
    ? routingSelection.model
      ? t('auth_files.routing_selected_hint', {
          model: routingSelection.model,
          time: formatDateTimeValue(routingSelection.expires_at, i18n.language),
        })
      : t('auth_files.routing_selected_hint_no_model', {
          time: formatDateTimeValue(routingSelection.expires_at, i18n.language),
        })
    : undefined;

  // Capture the entrance delay once so subsequent updates do not interrupt it.
  const [mountEntranceDelayMs] = useState<number | null>(entranceDelayMs ?? null);
  const cardClasses = [
    styles.card,
    compact ? styles.cardCompact : '',
    selected ? styles.cardSelected : '',
    isRoutingSelected ? styles.cardRoutingSelected : '',
    file.disabled === true ? styles.cardDisabled : '',
    mountEntranceDelayMs != null ? styles.cardEnter : '',
  ]
    .filter(Boolean)
    .join(' ');
  const cardStyle =
    mountEntranceDelayMs != null
      ? ({ '--card-delay': `${mountEntranceDelayMs}ms` } as CSSProperties)
      : undefined;

  return (
    <article className={cardClasses} style={cardStyle}>
      <header className={styles.head}>
        {!isRuntimeOnly && (
          <SelectionCheckbox
            checked={selected}
            onChange={() => onToggleSelect(file.name)}
            className={styles.selection}
            ariaLabel={t('auth_files.card_select', { name: file.name })}
            title={t('auth_files.card_select', { name: file.name })}
          />
        )}
        <div
          className={styles.avatar}
          style={
            useThemeSurfaceIcon
              ? {
                  backgroundColor: getThemeSurfaceIconBackground(resolvedTheme),
                  color: typeColor.text,
                }
              : {
                  backgroundColor: typeColor.bg,
                  color: typeColor.text,
                  ...(typeColor.border ? { border: typeColor.border } : {}),
                }
          }
        >
          {providerIcon ? (
            <img src={providerIcon} alt="" className={styles.avatarImage} />
          ) : (
            <span className={styles.avatarFallback}>{typeLabel.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className={styles.identity}>
          <div className={styles.badgeRow}>
            <span
              className={styles.typeBadge}
              style={{
                backgroundColor: typeColor.bg,
                color: typeColor.text,
                ...(typeColor.border ? { border: typeColor.border } : {}),
              }}
            >
              {typeLabel}
            </span>
            <span className={`${styles.stateBadge} ${stateBadgeClass}`}>
              <span className={styles.stateDot} aria-hidden="true" />
              {stateLabel}
            </span>
            {isRoutingSelected && (
              <span className={styles.routingSelectionBadge} title={routingSelectionTitle}>
                <IconNetwork className={styles.routingSelectionIcon} size={11} />
                {t('auth_files.routing_selected')}
              </span>
            )}
            {quotaDrain && (
              <span
                className={`${styles.quotaDrainBadge} ${quotaDrainBadgeClass}`}
                title={quotaDrain.state.last_error || quotaDrainLabel}
              >
                {quotaDrainLabel}
              </span>
            )}
          </div>
          <span
            className={`${styles.account} ${identity.kind === 'fileName' ? styles.accountMono : ''}`}
            title={identity.primary}
          >
            {identity.kind === 'email' ? (
              <EmailPrivacyText text={identity.primary} />
            ) : (
              identity.primary
            )}
          </span>
        </div>
        {isRuntimeOnly && (
          <span className={styles.runtimeLabel}>{t('auth_files.type_virtual')}</span>
        )}
      </header>

      {identity.secondary && (
        <p className={styles.fileName} title={identity.fullName}>
          {identity.secondary}
        </p>
      )}

      {!compact && noteValue && (
        <p className={styles.note} title={noteValue}>
          {noteValue}
        </p>
      )}

      {rawStatusMessage && hasStatusWarning && (
        <div className={styles.warning} title={rawStatusMessage}>
          <IconInfo className={styles.warningIcon} size={14} />
          <span>{rawStatusMessage}</span>
        </div>
      )}

      <AuthFileCooldownSection
        snapshot={file.cooldownSnapshot}
        resetting={isCooldownResetting}
        resetDisabled={
          disableControls ||
          statusUpdating[getAuthFileRefreshKey(file)] === true ||
          isManualRefreshing
        }
        onReset={authIndexKey ? () => onCooldownReset(file) : undefined}
      />

      <div className={styles.health}>
        <div className={styles.healthHead}>
          <span className={styles.healthLabel}>{t('auth_files.card_requests')}</span>
          <span className={styles.healthCounts}>
            <span
              className={`${styles.countOk} ${successCount > 0 ? styles.countLive : ''}`}
              title={t('stats.success')}
            >
              {t('stats.success')} {successCount}
            </span>
            <span
              className={`${styles.countFail} ${failureCount > 0 ? styles.countLive : ''}`}
              title={t('stats.failure')}
            >
              {t('stats.failure')} {failureCount}
            </span>
          </span>
        </div>
        <ProviderStatusBar statusData={statusData} styles={styles} />
      </div>

      <div className={styles.metaRow}>
        <span title={t('auth_files.file_size')}>{file.size ? formatFileSize(file.size) : '-'}</span>
        <span className={styles.metaDivider} aria-hidden="true">
          ·
        </span>
        <span title={t('auth_files.file_modified')}>{formatModified(file)}</span>
        {priorityValue !== undefined && (
          <>
            <span className={styles.metaDivider} aria-hidden="true">
              ·
            </span>
            <span className={styles.metaPriority} title={t('auth_files.priority_hint')}>
              <span className={styles.metaMetricLabel}>{t('auth_files.priority_display')}</span>
              <span>{priorityValue}</span>
            </span>
          </>
        )}
        {weightValue !== undefined && (
          <>
            <span className={styles.metaDivider} aria-hidden="true">
              ·
            </span>
            <span className={styles.metaWeight} title={t('auth_files.weight_tooltip')}>
              <span className={styles.metaMetricLabel}>{t('auth_files.weight_display')}</span>
              <span>{weightValue}</span>
            </span>
          </>
        )}
      </div>

      {supportsSiwcBinding(file) && (
        <div className={styles.siwcRow}>
          <SiwcStatusBadge status={getSiwcBindingStatus(file)} />
          {siwcExpires && (
            <span className={styles.siwcExpires} title={file.siwcExpiresAt}>
              {t('siwc.expires', { date: siwcExpires })}
            </span>
          )}
        </div>
      )}

      {showQuotaLayout && quotaType && (
        <AuthFileQuotaSection file={file} quotaType={quotaType} disableControls={disableControls} />
      )}

      {quotaDrain && !compact && (
        <div className={`${styles.quotaDrainSummary} ${quotaDrainBadgeClass}`}>
          <div className={styles.quotaDrainSummaryRow}>
            <span className={styles.quotaDrainSummaryLabel}>
              {t('auth_files.quota_drain_label')}
            </span>
            <span className={styles.quotaDrainSummaryValue}>{quotaDrainLabel}</span>
          </div>
          {quotaDrainResetAt && (
            <span className={styles.quotaDrainSummaryHint}>
              {t('auth_files.quota_drain_resets', {
                time: formatDateTimeValue(quotaDrainResetAt, i18n.language),
              })}
            </span>
          )}
          {quotaDrain.state.last_error && (
            <span className={styles.quotaDrainSummaryError}>
              {t('auth_files.quota_drain_refresh_error', {
                message: quotaDrain.state.last_error,
              })}
            </span>
          )}
        </div>
      )}

      <footer className={styles.actions}>
        <div className={styles.actionsMain}>
          {showModelsButton && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onShowModels(file)}
              title={t('auth_files.models_button')}
              disabled={disableControls}
            >
              <IconModelCluster size={14} />
              {t('auth_files.models_button')}
            </Button>
          )}
          {!isRuntimeOnly && (
            <div className={styles.utilityActions}>
              {showManualRefreshButton && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onManualRefresh(file)}
                  className={styles.iconButton}
                  title={t('auth_files.manual_refresh_button')}
                  disabled={
                    disableControls ||
                    file.disabled ||
                    statusUpdating[getAuthFileRefreshKey(file)] === true ||
                    isManualRefreshing
                  }
                >
                  {isManualRefreshing ? <LoadingSpinner size={14} /> : <IconRefreshCw size={15} />}
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onDownload(file.name)}
                className={styles.iconButton}
                title={t('auth_files.download_button')}
                disabled={disableControls}
              >
                <IconDownload size={15} />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onOpenPrefixProxyEditor(file)}
                className={styles.iconButton}
                title={t('auth_files.prefix_proxy_button')}
                disabled={disableControls || isManualRefreshing}
              >
                <IconSettings size={15} />
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDelete(file.name)}
                className={styles.iconButton}
                title={t('auth_files.delete_button')}
                disabled={disableControls || deleting === file.name || isManualRefreshing}
              >
                {deleting === file.name ? <LoadingSpinner size={14} /> : <IconTrash2 size={15} />}
              </Button>
            </div>
          )}
        </div>
        {!isRuntimeOnly && (
          <div className={styles.toggleWrap}>
            <span className={styles.toggleLabel}>{t('auth_files.status_toggle_label')}</span>
            <ToggleSwitch
              ariaLabel={t('auth_files.card_toggle', { name: file.name })}
              checked={!file.disabled}
              disabled={
                disableControls ||
                statusUpdating[getAuthFileRefreshKey(file)] === true ||
                isManualRefreshing
              }
              onChange={(value) => onToggleStatus(file, value)}
            />
          </div>
        )}
      </footer>
    </article>
  );
}
