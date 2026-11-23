/**
 * Provider quota card: identity, loading/error state, quota body, and actions.
 * Claude observations remain visible while refreshing or after a failed read.
 */

import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowReloadHorizontalIcon,
  MoreHorizontalIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Private } from '@/components/ui/private';
import { useNow } from '@/hooks/useNow';
import type {
  AuthFileItem,
  ClaudeQuotaState,
  QuotaCapacityState,
  QuotaCapacityWindow,
} from '@/types';
import { buildResetDisplay, formatQuotaResetTime, resolveQuotaErrorMessage } from '@/utils/quota';
import { getTypeLabel } from '@/features/authFiles/constants';
import { deriveAuthFileIdentity } from '@/features/authFiles/identity';
import { ProviderLogo } from '@/features/authFiles/components/ProviderLogo';
import { QUOTA_ADAPTERS, type QuotaCardState } from '../providers';
import { isQuotaRefreshDisabled, type QuotaFileEntry } from '../logic';
import { QuotaMeter } from './QuotaMeter';
import { QuotaResetLabel } from './QuotaResetLabel';
import { quotaClasses } from './quotaClasses';
import { useClaudeResetGrants } from '../providers/claude/ClaudeResetGrants';
import { ClaudeResetGrantDetails } from '../providers/claude/ClaudeResetGrantDetails';
import { hasClaudeUsageData } from '../providers/claude/data';
import { Hint } from '@/components/ui/tooltip';

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
      'grok-bot': 'cursor_quota.grok_bot_weekly_desc',
      plan: 'cursor_quota.overall_included_usage_desc',
    },
    'opencode-go': {
      rolling: 'opencode_go_quota.five_hour_desc',
      weekly: 'opencode_go_quota.weekly_desc',
      monthly: 'opencode_go_quota.monthly_desc',
    },
    'devin-cli': {
      daily: 'devin_cli_quota.daily_desc',
      weekly: 'devin_cli_quota.weekly_desc',
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
  canRefresh: boolean;
  resetting: boolean;
  onRefresh: () => void;
  /** `targetId` spends one specific reset credit. */
  onReset: (targetId?: string) => void;
};

export function QuotaCard({
  entry,
  quota,
  canRefresh,
  resetting,
  onRefresh,
  onReset,
}: QuotaCardProps) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const adapter = QUOTA_ADAPTERS[entry.type];
  const file = entry.file;
  const identity = deriveAuthFileIdentity(file);
  const displayIdentity = identity.kind === 'fileName' ? file.name : identity.primary;
  const retainedClaudeUsage =
    entry.type === 'claude' && hasClaudeUsageData(quota as ClaudeQuotaState | undefined);

  const status = quota?.status ?? 'idle';
  const loading = status === 'loading';
  const storedSnapshot = status === 'idle' ? resolveStoredQuotaSnapshot(file) : null;
  const routingSelection = file.routing_selection ?? file.routingSelection;
  const isRoutingSelected = routingSelection?.selected === true;
  const routingSelectionTitle = isRoutingSelected
    ? routingSelection.model
      ? t('auth_files.routing_selected_hint', {
          model: routingSelection.model,
          time: formatQuotaResetTime(routingSelection.expires_at, i18n.resolvedLanguage),
        })
      : t('auth_files.routing_selected_hint_no_model', {
          time: formatQuotaResetTime(routingSelection.expires_at, i18n.resolvedLanguage),
        })
    : undefined;
  const claudeReset = useClaudeResetGrants(
    file,
    entry.type === 'claude' && status !== 'idle',
    !canRefresh || loading || resetting,
    onRefresh
  );
  const providerType =
    entry.type === 'plugin'
      ? String(
          file.quotaProvider ?? file['quota_provider'] ?? file.provider ?? file.type ?? 'plugin'
        )
      : entry.type;
  const typeLabel = getTypeLabel(t, providerType);
  const errorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );
  // Saved resets live only in the fold-out after the plan row, which carries their count and
  // renders nothing when there are none.
  const showClaudeReset = entry.type === 'claude' && status === 'success';
  const claudeAfterPlan = showClaudeReset ? (
    <>
      <ClaudeResetGrantDetails
        grants={claudeReset.grants}
        classes={quotaClasses}
        onUse={claudeReset.confirm}
        canUse={claudeReset.canUse}
      />
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
  const showActions = status !== 'idle' || storedSnapshot !== null;
  // Desktop shows these as buttons; a phone lists them in the card menu.
  const resetActions = [
    ...(entry.type === 'claude'
      ? [
          {
            id: 'claude',
            label: t(`claude_reset.${claudeReset.buttonLabel}`),
            disabled: claudeReset.blocked,
            run: () => claudeReset.confirm(),
          },
        ]
      : []),
    ...(showReset
      ? [
          {
            id: 'quota',
            label: t('codex_quota.reset_button'),
            disabled: !canRefresh || loading || resetting,
            run: () => onReset(),
          },
        ]
      : []),
  ];
  const refreshDisabled = isQuotaRefreshDisabled(
    canRefresh,
    loading,
    resetting || claudeReset.busy
  );
  const body = quota ? (
    <adapter.Body
      quota={quota}
      classes={quotaClasses}
      afterPlan={claudeAfterPlan}
      onUseReset={showReset ? onReset : undefined}
      useResetDisabled={!canRefresh || loading || resetting}
    />
  ) : null;

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 max-sm:gap-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 max-sm:flex-nowrap">
        <ProviderLogo type={providerType} className="size-9 rounded-lg max-sm:size-8" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            {/* Clip only sideways: Private's vertical padding is its 40px tap target. */}
            <span
              className="min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap"
              title={identity.kind === 'email' ? undefined : displayIdentity}
            >
              {identity.kind === 'email' ? <Private>{displayIdentity}</Private> : displayIdentity}
            </span>
            {isRoutingSelected && (
              <Badge variant="secondary" className="gap-1.5" title={routingSelectionTitle}>
                <span className="size-1.5 rounded-full bg-primary" />
                {t('auth_files.routing_selected')}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{typeLabel}</span>
        </div>
        {showActions && (
          <div className="ml-auto flex items-center gap-1.5 max-sm:hidden">
            {resetActions.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                disabled={action.disabled}
                onClick={action.run}
              >
                {action.label}
              </Button>
            ))}
            <Hint label={t('auth_files.quota_refresh_hint')}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onRefresh}
                disabled={refreshDisabled}
                aria-label={t('auth_files.quota_refresh_single')}
              >
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} />
              </Button>
            </Hint>
          </div>
        )}
        {/* Every phone card gets the same single menu, so headers line up across providers.
            The negative margins keep the 40px tap target from making the header taller. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-my-1.5 -mr-2 ml-auto size-10 sm:hidden"
              aria-label={t('common.more')}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.75} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" collisionPadding={16} className="w-auto min-w-44">
            <DropdownMenuItem disabled={refreshDisabled} onSelect={onRefresh}>
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} />
              {t('auth_files.quota_refresh_single')}
            </DropdownMenuItem>
            {resetActions.map((action) => (
              <DropdownMenuItem key={action.id} disabled={action.disabled} onSelect={action.run}>
                <HugeiconsIcon icon={ArrowReloadHorizontalIcon} strokeWidth={1.75} />
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {status === 'idle' && storedSnapshot ? (
        <div className="flex flex-col gap-4">
          {storedSnapshot.windows.map((window, index) => {
            const remaining =
              window.known === true && Number.isFinite(window.remaining_percent)
                ? Math.max(0, Math.min(100, window.remaining_percent))
                : null;
            const resetAtMs = parseTimestamp(window.reset_at);
            const resetDisplay = buildResetDisplay(null, resetAtMs, now, i18n.resolvedLanguage);
            const descriptionKey = STORED_WINDOW_DESCRIPTIONS[entry.type]?.[window.id];

            return (
              <div key={window.id} className={quotaClasses.quotaRow}>
                <div className={quotaClasses.quotaRowHeader}>
                  <span className={quotaClasses.quotaLabel}>
                    <span className={quotaClasses.quotaModel}>{window.label}</span>
                    {descriptionKey && (
                      <span className={quotaClasses.quotaDescription}>{t(descriptionKey)}</span>
                    )}
                  </span>
                  <div className={quotaClasses.quotaMeta}>
                    <span className={quotaClasses.quotaPercent}>
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
                  <QuotaMeter percent={remaining} classes={quotaClasses} index={index} />
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-faint max-sm:font-sans max-sm:text-muted-foreground">
            {storedSnapshot.fetchedAt && (
              <span>
                {t('quota_management.snapshot_updated', {
                  time: formatQuotaResetTime(storedSnapshot.fetchedAt, i18n.resolvedLanguage),
                })}
              </span>
            )}
            {storedSnapshot.stale && (
              <span className="text-warning">{t('auth_files.quota_drain_stale')}</span>
            )}
          </div>
          {storedSnapshot.state.last_error && (
            <p className="text-xs text-destructive">
              {t('auth_files.quota_drain_refresh_error', {
                message: storedSnapshot.state.last_error,
              })}
            </p>
          )}
        </div>
      ) : status === 'idle' ? (
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-5 text-sm text-muted-foreground transition-colors duration-150 ease-out outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
          onClick={onRefresh}
          disabled={!canRefresh}
        >
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} className="size-4" />
          {t(`${adapter.i18nPrefix}.idle`)}
        </button>
      ) : loading && !retainedClaudeUsage ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <span className="sr-only">{t(`${adapter.i18nPrefix}.loading`)}</span>
          {[0, 1].map((row) => (
            <div key={row} className="flex flex-col gap-2" aria-hidden="true">
              <span className="h-3.5 w-28 rounded-sm bg-muted/60" />
              <span className="h-1 w-full rounded-full bg-muted" />
            </div>
          ))}
        </div>
      ) : status === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`${adapter.i18nPrefix}.load_failed`, { message: errorMessage })}
        </p>
      ) : !retainedClaudeUsage ? (
        (body ?? <p className="text-sm text-muted-foreground">{t(`${adapter.i18nPrefix}.idle`)}</p>)
      ) : null}
      {loading && retainedClaudeUsage && (
        <div role="status" aria-busy="true" className={quotaClasses.quotaMessage}>
          {t(`${adapter.i18nPrefix}.loading`)}
        </div>
      )}
      {retainedClaudeUsage && body}
    </article>
  );
}
