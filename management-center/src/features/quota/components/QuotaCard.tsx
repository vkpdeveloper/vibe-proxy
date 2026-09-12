/**
 * 额度卡片：头部（提供商图标 + mono 文件名）+ 四态 body + 动作 footer。
 *
 * - idle：整个 body 是一个点击加载按钮（上游直连有速率考虑，不自动拉取）；
 * - loading：双幽灵行骨架（aria-busy，文字等价视觉隐藏）；
 * - error：失败色条 + footer 刷新即重试；
 * - success：provider Body（穿 QuotaBody.module.scss 全页外衣）。
 */

import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { IconNetwork, IconRefreshCw } from '@/components/ui/icons';
import { EmailPrivacyText } from '@/components/common/EmailPrivacyText';
import { useNow } from '@/hooks/useNow';
import type { AuthFileItem, QuotaCapacityState, QuotaCapacityWindow, ResolvedTheme } from '@/types';
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
import bodyStyles from './QuotaBody.module.scss';
import styles from './QuotaCard.module.scss';

/** 额度页全页外衣：QuotaBody 模块绑定成类型化契约（缺键在模块初始化即抛）。 */
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
  /** 首屏级联入场延迟；null = 不入场（切 tab / 翻页 / 刷新新挂载的卡片）。 */
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

  // 挂载时捕获一次延迟：后续 props 变 null 不影响本卡（React 19 禁渲染期读 ref）
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
  const iconSrc = getAuthFileIcon(entry.type, resolvedTheme);
  const typeLabel = getTypeLabel(t, entry.type);
  const errorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );
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
            isThemeSurfaceIconProvider(entry.type)
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
        ) : loading ? (
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
        ) : quota ? (
          <adapter.Body quota={quota} classes={quotaClasses} />
        ) : (
          <div className={styles.idleHint}>{t(`${adapter.i18nPrefix}.idle`)}</div>
        )}
      </div>

      {(status !== 'idle' || hasStoredSnapshot) && (
        <footer className={styles.actionRow}>
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
            disabled={isQuotaRefreshDisabled(canRefresh, loading, resetting)}
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
