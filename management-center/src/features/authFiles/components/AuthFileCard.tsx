import { getAuthFileRefreshKey } from '@/features/authFiles/manualRefresh';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconModelCluster,
  IconNetwork,
  IconRefreshCw,
  IconSettings,
  IconTrash2,
} from '@/components/ui/icons';
import { EmailPrivacyText } from '@/components/common/EmailPrivacyText';
import { useNow } from '@/hooks/useNow';
import type { AuthFileItem, QuotaCapacityState, QuotaCapacityWindow } from '@/types';
import { formatRelativeInstant } from '@/utils/quota/relativeTime';
import {
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
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import { deriveAuthFileIdentity } from '@/features/authFiles/identity';
import { QuotaMeter } from '@/features/quota/components/QuotaMeter';
import { bindQuotaClasses } from '@/features/quota/types';
import { AuthFileCooldownSection } from './AuthFileCooldownSection';
import quotaStyles from './AuthFileQuota.module.scss';
import styles from './AuthFileCard.module.scss';

const quotaClasses = bindQuotaClasses(quotaStyles, 'AuthFileQuota.module.scss');

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

/** The tightest routing window from the server's quota poll. */
const resolveQuotaDrainDisplay = (file: AuthFileItem, now: number): QuotaDrainDisplay | null => {
  const state = file.quota_capacity ?? file.quotaCapacity;
  if (!state || typeof state !== 'object') return null;

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
  selected: boolean;
  resolvedTheme: ResolvedTheme;
  disableControls: boolean;
  deleting: string | null;
  statusUpdating: Record<string, boolean>;
  manualRefreshing: Record<string, boolean>;
  showAccountPreference?: boolean;
  accountPreferred?: boolean;
  accountPreferenceUpdating?: boolean;
  accountPreferenceLoading?: boolean;
  onPreferAccount?: (file: AuthFileItem) => void;
  cooldownResetting: Record<string, boolean>;
  onShowModels: (file: AuthFileItem) => void;
  onManualRefresh: (file: AuthFileItem) => void;
  onCooldownReset: (file: AuthFileItem) => void;
  onOpenPrefixProxyEditor: (file: AuthFileItem) => void;
  onDelete: (name: string) => void;
  onToggleStatus: (file: AuthFileItem, enabled: boolean) => void;
  onToggleSelect: (name: string) => void;
};

/** One credential as a list row: account | quota | requests | actions. */
export function AuthFileCard(props: AuthFileCardProps) {
  const { t, i18n } = useTranslation();
  const {
    file,
    selected,
    resolvedTheme,
    disableControls,
    deleting,
    statusUpdating,
    manualRefreshing,
    showAccountPreference,
    accountPreferred,
    accountPreferenceUpdating,
    accountPreferenceLoading,
    onPreferAccount,
    cooldownResetting,
    onShowModels,
    onManualRefresh,
    onCooldownReset,
    onOpenPrefixProxyEditor,
    onDelete,
    onToggleStatus,
    onToggleSelect,
  } = props;
  const now = useNow();

  const isRuntimeOnly = isRuntimeOnlyAuthFile(file);
  const providerKey = normalizeProviderKey(String(file.type ?? file.provider ?? 'unknown'));
  const showModelsButton = !isRuntimeOnly || providerKey === 'aistudio';
  const showManualRefreshButton = !isRuntimeOnly && supportsAuthFileManualRefresh(providerKey);
  const refreshKey = getAuthFileRefreshKey(file);
  const isManualRefreshing = manualRefreshing[refreshKey] === true;
  const isStatusUpdating = statusUpdating[refreshKey] === true;
  const typeLabel = getTypeLabel(t, providerKey);
  const typeColor = getTypeColor(providerKey, resolvedTheme);
  const providerIcon = getAuthFileIcon(providerKey, resolvedTheme);

  const successCount = file.successCount ?? 0;
  const failureCount = file.failureCount ?? 0;
  const authIndexKey = typeof file.authIndex === 'string' ? file.authIndex : null;
  const statusMessage = getAuthFileStatusMessage(file);
  const hasStatusWarning = hasAuthFileStatusWarning(file);
  const noteValue = typeof file.note === 'string' ? file.note.trim() : '';
  const identity = deriveAuthFileIdentity(file);

  const stateLabel = isRuntimeOnly
    ? t('auth_files.type_virtual')
    : file.disabled
      ? t('auth_files.health_status_disabled')
      : hasStatusWarning
        ? t('auth_files.health_status_warning')
        : t('auth_files.status_toggle_label');
  const stateClass = isRuntimeOnly
    ? styles.stateVirtual
    : file.disabled
      ? styles.stateDisabled
      : hasStatusWarning
        ? styles.stateWarning
        : styles.stateActive;

  const quota = resolveQuotaDrainDisplay(file, now);
  const quotaLabel = !quota
    ? ''
    : quota.status === 'exhausted'
      ? t('auth_files.quota_drain_exhausted')
      : quota.status === 'stale'
        ? t('auth_files.quota_drain_stale')
        : quota.remainingPercent !== null
          ? t('auth_files.quota_drain_remaining', { percent: Math.round(quota.remainingPercent) })
          : t('auth_files.quota_drain_unavailable');
  const resetAt = parseMeaningfulDate(quota?.window?.reset_at);

  const routingSelection = file.routing_selection ?? file.routingSelection;
  const routingExpiresAt = parseMeaningfulDate(routingSelection?.expires_at);
  const isRoutingSelected =
    routingSelection?.selected === true && routingExpiresAt !== null && routingExpiresAt > now;

  const rowClasses = [
    styles.row,
    selected ? styles.rowSelected : '',
    isRoutingSelected ? styles.rowInUse : '',
    file.disabled === true ? styles.rowDisabled : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={rowClasses}>
      <div className={styles.who}>
        {isRuntimeOnly ? (
          <span className={styles.selectionSpacer} aria-hidden="true" />
        ) : (
          <SelectionCheckbox
            checked={selected}
            onChange={() => onToggleSelect(file.name)}
            ariaLabel={t('auth_files.card_select', { name: identity.primary })}
            title={t('auth_files.card_select', { name: identity.primary })}
          />
        )}
        <span
          className={styles.avatar}
          style={{
            backgroundColor: isThemeSurfaceIconProvider(providerKey)
              ? getThemeSurfaceIconBackground(resolvedTheme)
              : typeColor.bg,
            color: typeColor.text,
          }}
        >
          {providerIcon ? (
            <img src={providerIcon} alt="" className={styles.avatarImage} />
          ) : (
            <span className={styles.avatarFallback}>{typeLabel.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className={styles.identity}>
          <span className={styles.account} title={identity.kind === 'email' ? undefined : identity.primary}>
            {identity.kind === 'email' ? (
              <EmailPrivacyText text={identity.primary} />
            ) : (
              identity.primary || typeLabel
            )}
          </span>
          <span className={styles.meta}>
            <span>{typeLabel}</span>
            <span className={`${styles.state} ${stateClass}`}>
              <span className={styles.stateDot} aria-hidden="true" />
              {stateLabel}
            </span>
            {isRoutingSelected && (
              <span className={styles.inUse}>{t('auth_files.routing_selected')}</span>
            )}
            {noteValue && (
              <span className={styles.note} title={noteValue}>
                {noteValue}
              </span>
            )}
          </span>
          {statusMessage && hasStatusWarning && (
            <span className={styles.warning} title={statusMessage}>
              {statusMessage}
            </span>
          )}
        </span>
      </div>

      <div className={styles.quota}>
        {quota && (
          <>
            <span className={styles.quotaHead}>
              <span className={styles.quotaValue} title={quota.state.last_error || undefined}>
                {quotaLabel}
              </span>
              {resetAt !== null && (
                <span className={styles.quotaReset}>
                  {formatRelativeInstant(resetAt, now, i18n.language)}
                </span>
              )}
            </span>
            <QuotaMeter percent={quota.remainingPercent} classes={quotaClasses} />
          </>
        )}
      </div>

      <div className={styles.requests}>
        <span className={successCount > 0 ? styles.countOk : undefined} title={t('stats.success')}>
          {successCount}
        </span>
        <span className={styles.countDivider}>/</span>
        <span
          className={failureCount > 0 ? styles.countFail : undefined}
          title={t('stats.failure')}
        >
          {failureCount}
        </span>
      </div>

      <div className={styles.actions}>
        {showAccountPreference && (
          <button
            type="button"
            className={`${styles.iconButton} ${accountPreferred ? styles.iconButtonOn : ''}`}
            onClick={() => onPreferAccount?.(file)}
            aria-pressed={accountPreferred === true}
            aria-label={t('auth_files.prefer_account_aria', { name: identity.primary })}
            title={t(accountPreferred ? 'auth_files.account_preferred' : 'auth_files.prefer_account')}
            disabled={
              disableControls ||
              file.disabled ||
              accountPreferenceUpdating ||
              accountPreferred ||
              isStatusUpdating ||
              isManualRefreshing
            }
          >
            {accountPreferenceLoading ? <LoadingSpinner size={14} /> : <IconNetwork size={15} />}
          </button>
        )}
        {showModelsButton && (
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onShowModels(file)}
            aria-label={t('auth_files.models_button')}
            title={t('auth_files.models_button')}
            disabled={disableControls}
          >
            <IconModelCluster size={15} />
          </button>
        )}
        {showManualRefreshButton && (
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onManualRefresh(file)}
            aria-label={t('auth_files.manual_refresh_button')}
            title={t('auth_files.manual_refresh_button')}
            disabled={disableControls || file.disabled || isStatusUpdating || isManualRefreshing}
          >
            {isManualRefreshing ? <LoadingSpinner size={14} /> : <IconRefreshCw size={15} />}
          </button>
        )}
        {!isRuntimeOnly && (
          <>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => onOpenPrefixProxyEditor(file)}
              aria-label={t('auth_files.prefix_proxy_button')}
              title={t('auth_files.prefix_proxy_button')}
              disabled={disableControls || isManualRefreshing}
            >
              <IconSettings size={15} />
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.iconButtonDanger}`}
              onClick={() => onDelete(file.name)}
              aria-label={t('auth_files.delete_button')}
              title={t('auth_files.delete_button')}
              disabled={disableControls || deleting === file.name || isManualRefreshing}
            >
              {deleting === file.name ? <LoadingSpinner size={14} /> : <IconTrash2 size={15} />}
            </button>
            <ToggleSwitch
              ariaLabel={t('auth_files.card_toggle', { name: identity.primary })}
              checked={!file.disabled}
              disabled={disableControls || isStatusUpdating || isManualRefreshing}
              onChange={(value) => onToggleStatus(file, value)}
            />
          </>
        )}
      </div>

      {Boolean(file.cooldownSnapshot?.records?.length) && (
        <div className={styles.cooldown}>
          <AuthFileCooldownSection
            snapshot={file.cooldownSnapshot}
            resetting={Boolean(authIndexKey && cooldownResetting[authIndexKey])}
            resetDisabled={disableControls || isStatusUpdating || isManualRefreshing}
            onReset={authIndexKey ? () => onCooldownReset(file) : undefined}
          />
        </div>
      )}
    </article>
  );
}
