/**
 * Provider quota card: identity, loading/error state, quota body, and actions.
 * Claude observations remain visible while refreshing or after a failed read.
 */

import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { IconNetwork, IconRefreshCw } from '@/components/ui/icons';
import { EmailPrivacyText } from '@/components/common/EmailPrivacyText';
import { useNow } from '@/hooks/useNow';
import type {
  AuthFileItem,
  ClaudeQuotaState,
  QuotaCapacityState,
  QuotaCapacityWindow,
  ResolvedTheme,
} from '@/types';
import { buildResetDisplay, formatQuotaResetTime, resolveQuotaErrorMessage } from '@/utils/quota';
import {
  getAuthFileIcon,
  getThemeSurfaceIconBackground,
  getTypeLabel,
  isThemeSurfaceIconProvider,
} from '@/features/authFiles/constants';
import { deriveAuthFileIdentity } from '@/features/authFiles/identity';
import { bindQuotaClasses } from '../types';
import { QUOTA_ADAPTERS, type QuotaCardState } from '../providers';
import { isQuotaRefreshDisabled, type QuotaFileEntry } from '../logic';
import { QuotaResetLabel } from './QuotaResetLabel';
import { useClaudeResetGrants } from '../providers/claude/ClaudeResetGrants';
import { ClaudeResetGrantDetails } from '../providers/claude/ClaudeResetGrantDetails';
import { hasClaudeUsageData } from '../providers/claude/data';
import bodyStyles from './QuotaBody.module.scss';
import styles from './QuotaCard.module.scss';

/** Bind the quota-page styles to the shared rendering contract. */
const quotaClasses = bindQuotaClasses(bodyStyles, 'QuotaBody.module.scss');

interface StoredQuotaSnapshot {
  state: QuotaCapacityState;
  windows: QuotaCapacityWindow[];
  fetchedAt: string | null;
  stale: boolean;
}

const STORED_WINDOW_DESCRIPTIONS: Partial<Record<QuotaFileEntry['type'], Record<string, string>>> =
  {
    cursor: {
      'cursor-models': 'cursor_quota.cursor_models_desc',
      'other-models': 'cursor_quota.other_models_desc',
      'cursor-grok-bot': 'cursor_quota.grok_bot_weekly_desc',
      'cursor-included': 'cursor_quota.overall_included_usage_desc',
    },
    'opencode-go': {
      'opencode-go-rolling': 'opencode_go_quota.five_hour_desc',
      'opencode-go-weekly': 'opencode_go_quota.weekly_desc',
      'opencode-go-monthly': 'opencode_go_quota.monthly_desc',
    },
    'devin-cli': {
      'devin-cli-daily': 'devin_cli_quota.daily_desc',
      'devin-cli-weekly': 'devin_cli_quota.weekly_desc',
    },
  };

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
      typeof window.id === 'string' &&
      typeof window.label === 'string' &&
      (window.known === false ||
        (window.known === true &&
          typeof window.remaining_percent === 'number' &&
          Number.isFinite(window.remaining_percent)))
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

export type QuotaCardProps = {
  entry: QuotaFileEntry;
  quota?: QuotaCardState;
  resolvedTheme: ResolvedTheme;
  canRefresh: boolean;
  resetting: boolean;
  /** Initial cascade delay; null disables entrance motion for later mounts. */
  entranceDelayMs?: number | null;
  onRefresh: () => void;
  onReset: () => void;
};

export function QuotaCard(props: QuotaCardProps) {
  const {
    entry,
    quota,
    resolvedTheme,
    canRefresh,
    resetting,
    entranceDelayMs,
    onRefresh,
    onReset,
  } = props;
  const { t, i18n } = useTranslation();
  const now = useNow();
  const adapter = QUOTA_ADAPTERS[entry.type];
  const file = entry.file;
  const identity = deriveAuthFileIdentity(file);
  const displayIdentity = identity.kind === 'fileName' ? file.name : identity.primary;
  const retainedClaudeUsage =
    entry.type === 'claude' && hasClaudeUsageData(quota as ClaudeQuotaState | undefined);

  // Capture the entrance delay only at mount, without a render-time ref read.
  const [mountEntranceDelayMs] = useState<number | null>(entranceDelayMs ?? null);
  const entranceStyle =
    mountEntranceDelayMs === null
      ? undefined
      : ({ '--card-delay': `${mountEntranceDelayMs}ms` } as CSSProperties);

  const status = quota?.status ?? 'idle';
  const loading = status === 'loading';
  const storedSnapshot = status === 'idle' ? resolveStoredQuotaSnapshot(file) : null;
  const hasStoredSnapshot = storedSnapshot !== null;
  const routingSelection = file.routing_selection ?? file.routingSelection;
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
  const claudeReset = useClaudeResetGrants(
    file,
    entry.type === 'claude' && status !== 'idle',
    !canRefresh || loading || resetting,
    quota,
    onRefresh
  );
  const providerType =
    entry.type === 'plugin'
      ? String(
          file.quotaProvider ?? file['quota_provider'] ?? file.provider ?? file.type ?? 'plugin'
        )
      : entry.type;
  const iconSrc = getAuthFileIcon(providerType, resolvedTheme);
  const typeLabel = getTypeLabel(t, providerType);
  const errorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );
  // Claude banked resets join the plan chip row; their expiry list follows it.
  const showClaudeReset = entry.type === 'claude' && status === 'success';
  const claudePlanItems = showClaudeReset ? (
    <span className={quotaClasses.codexPlanItem}>
      <span className={quotaClasses.codexPlanLabel}>{t('claude_reset.remaining')}</span>
      <span className={quotaClasses.codexPlanValue}>{claudeReset.count ?? '--'}</span>
    </span>
  ) : undefined;
  const claudeAfterPlan = showClaudeReset ? (
    <>
      <ClaudeResetGrantDetails grants={claudeReset.grants} classes={quotaClasses} />
      {claudeReset.message && (
        <div role="status" className={quotaClasses.codexResetCreditsError}>
          {t(`claude_reset.${claudeReset.message}`)}
        </div>
      )}
    </>
  ) : undefined;
  const showReset =
    status === 'success' &&
    Boolean(adapter.resetQuota) &&
    quota !== undefined &&
    Boolean(adapter.canResetQuota?.(quota));

  return (
    <article
      className={`${styles.card} ${isRoutingSelected ? styles.cardRoutingSelected : ''} ${mountEntranceDelayMs === null ? '' : styles.cardEnter}`}
      style={entranceStyle}
    >
      <header className={styles.head}>
        <span
          className={styles.iconWrap}
          title={typeLabel}
          style={
            isThemeSurfaceIconProvider(providerType)
              ? { background: getThemeSurfaceIconBackground(resolvedTheme) }
              : undefined
          }
        >
          {iconSrc ? (
            <img src={iconSrc} alt="" className={styles.icon} />
          ) : (
            <span className={styles.iconFallback}>{typeLabel.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        {isRoutingSelected && (
          <span className={styles.routingSelectionBadge} title={routingSelectionTitle}>
            <IconNetwork className={styles.routingSelectionIcon} size={12} />
            {t('auth_files.routing_selected')}
          </span>
        )}
        <span
          className={styles.fileName}
          title={identity.kind === 'email' ? undefined : displayIdentity}
        >
          {identity.kind === 'email' ? (
            <EmailPrivacyText text={displayIdentity} />
          ) : (
            displayIdentity
          )}
        </span>
      </header>

      <div className={styles.body}>
        {status === 'idle' && storedSnapshot ? (
          <div className={styles.snapshotBody}>
            {storedSnapshot.windows.map((window) => {
              const remaining =
                window.known === true && Number.isFinite(window.remaining_percent)
                  ? Math.max(0, Math.min(100, window.remaining_percent))
                  : null;
              const resetAtMs = parseTimestamp(window.reset_at);
              const resetDisplay = buildResetDisplay(null, resetAtMs, now, i18n.resolvedLanguage);
              const descriptionKey = STORED_WINDOW_DESCRIPTIONS[entry.type]?.[window.id];

              return (
                <div key={window.id} className={styles.snapshotRow}>
                  <div className={styles.snapshotRowHeader}>
                    <span className={styles.snapshotLabel}>
                      <span className={styles.snapshotModel}>{window.label}</span>
                      {descriptionKey && (
                        <span className={styles.snapshotDescription}>{t(descriptionKey)}</span>
                      )}
                    </span>
                    <div className={styles.snapshotMeta}>
                      <span className={styles.snapshotPercent}>
                        {remaining === null
                          ? t('quota_management.usage_not_reported')
                          : t('auth_files.quota_drain_remaining', {
                              percent: Math.round(remaining),
                            })}
                      </span>
                      {resetDisplay && (
                        <QuotaResetLabel display={resetDisplay} classes={quotaClasses} />
                      )}
                    </div>
                  </div>
                  {remaining !== null && (
                    <div className={styles.snapshotTrack}>
                      <div className={styles.snapshotFill} style={{ width: `${remaining}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
            <div className={styles.snapshotMetaRow}>
              {storedSnapshot.fetchedAt && (
                <span>
                  {t('quota_management.snapshot_updated', {
                    time: formatQuotaResetTime(storedSnapshot.fetchedAt),
                  })}
                </span>
              )}
              {storedSnapshot.stale && (
                <span className={styles.snapshotStale}>{t('auth_files.quota_drain_stale')}</span>
              )}
            </div>
            {storedSnapshot.state.last_error && (
              <div className={styles.snapshotError}>
                {t('auth_files.quota_drain_refresh_error', {
                  message: storedSnapshot.state.last_error,
                })}
              </div>
            )}
          </div>
        ) : status === 'idle' ? (
          <button
            type="button"
            className={styles.idleBody}
            onClick={onRefresh}
            disabled={!canRefresh}
          >
            <IconRefreshCw size={15} aria-hidden="true" className={styles.idleGlyph} />
            <span className={styles.idleHint}>{t(`${adapter.i18nPrefix}.idle`)}</span>
          </button>
        ) : loading && !retainedClaudeUsage ? (
          <div className={styles.skeleton} aria-busy="true">
            <span className={styles.srOnly}>{t(`${adapter.i18nPrefix}.loading`)}</span>
            {[0, 1].map((row) => (
              <div key={row} className={styles.skeletonRow} aria-hidden="true">
                <span className={styles.skeletonLabel} />
                <span className={styles.skeletonTrack} />
              </div>
            ))}
          </div>
        ) : status === 'error' ? (
          <div className={styles.errorStrip} role="alert">
            {t(`${adapter.i18nPrefix}.load_failed`, { message: errorMessage })}
          </div>
        ) : quota && !retainedClaudeUsage ? (
          <adapter.Body
            quota={quota}
            classes={quotaClasses}
            planItems={claudePlanItems}
            afterPlan={claudeAfterPlan}
          />
        ) : !retainedClaudeUsage ? (
          <div className={styles.idleHint}>{t(`${adapter.i18nPrefix}.idle`)}</div>
        ) : null}
        {loading && retainedClaudeUsage && (
          <div role="status" aria-busy="true" className={quotaClasses.quotaMessage}>
            {t(`${adapter.i18nPrefix}.loading`)}
          </div>
        )}
        {retainedClaudeUsage && quota && (
          <adapter.Body
            quota={quota}
            classes={quotaClasses}
            planItems={claudePlanItems}
            afterPlan={claudeAfterPlan}
          />
        )}
      </div>

      {(status !== 'idle' || hasStoredSnapshot) && (
        <footer className={styles.actionRow}>
          {entry.type === 'claude' && (
            <button
              type="button"
              className={styles.actionPill}
              disabled={claudeReset.blocked}
              onClick={claudeReset.confirm}
              title={t(`claude_reset.${claudeReset.buttonLabel}`)}
            >
              <IconRefreshCw size={13} className={claudeReset.busy ? styles.spinning : undefined} />
              {t(`claude_reset.${claudeReset.buttonLabel}`)}
            </button>
          )}
          {showReset && (
            <button
              type="button"
              className={styles.actionPill}
              onClick={onReset}
              disabled={!canRefresh || loading || resetting}
              title={t('codex_quota.reset_button')}
            >
              <IconRefreshCw size={13} className={resetting ? styles.spinning : undefined} />
              {t('codex_quota.reset_button')}
            </button>
          )}
          <button
            type="button"
            className={styles.actionPill}
            onClick={onRefresh}
            disabled={isQuotaRefreshDisabled(canRefresh, loading, resetting || claudeReset.busy)}
            title={t('auth_files.quota_refresh_hint')}
          >
            <IconRefreshCw size={13} className={loading ? styles.spinning : undefined} />
            {t('auth_files.quota_refresh_single')}
          </button>
        </footer>
      )}
    </article>
  );
}
