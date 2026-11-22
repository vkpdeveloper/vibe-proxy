import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Delete02Icon,
  Key01Icon,
  Layers01Icon,
  RefreshIcon,
  Route01Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Item, ItemActions, ItemContent, ItemFooter, ItemTitle } from '@/components/ui/item';
import { Private } from '@/components/ui/private';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useNow } from '@/hooks/useNow';
import type { AuthFileItem, QuotaCapacityState, QuotaCapacityWindow } from '@/types';
import { formatRelativeInstant } from '@/utils/quota/relativeTime';
import {
  getAuthFileStatusMessage,
  hasAuthFileStatusWarning,
  getTypeLabel,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  supportsAuthFileManualRefresh,
} from '@/features/authFiles/constants';
import { getAuthFileRefreshKey } from '@/features/authFiles/manualRefresh';
import { deriveAuthFileIdentity } from '@/features/authFiles/identity';
import { QuotaMeter } from '@/features/quota/components/QuotaMeter';
import { quotaClasses } from '@/features/quota/components/quotaClasses';
import type { OAuthPageLocationState } from '@/features/oauth/OAuthPage';
import { AuthFileCooldownSection } from './AuthFileCooldownSection';
import { ProviderLogo } from './ProviderLogo';

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

function IconAction({
  icon,
  label,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { icon: IconSvgElement; label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      className={cn('text-muted-foreground hover:text-foreground', className)}
      {...props}
    >
      <HugeiconsIcon icon={icon} strokeWidth={1.75} />
    </Button>
  );
}

/** One credential: account, state, quota, request counts and its actions. */
export function AuthFileCard(props: AuthFileCardProps) {
  const { t, i18n } = useTranslation();
  const {
    file,
    selected,
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
  const navigate = useNavigate();

  const isRuntimeOnly = isRuntimeOnlyAuthFile(file);
  const providerKey = normalizeProviderKey(String(file.type ?? file.provider ?? 'unknown'));
  const showModelsButton = !isRuntimeOnly || providerKey === 'aistudio';
  const showManualRefreshButton = !isRuntimeOnly && supportsAuthFileManualRefresh(providerKey);
  const refreshKey = getAuthFileRefreshKey(file);
  const isManualRefreshing = manualRefreshing[refreshKey] === true;
  const isStatusUpdating = statusUpdating[refreshKey] === true;
  const typeLabel = getTypeLabel(t, providerKey);

  const successCount = file.successCount ?? 0;
  const failureCount = file.failureCount ?? 0;
  const authIndexKey = typeof file.authIndex === 'string' ? file.authIndex : null;
  const statusMessage = getAuthFileStatusMessage(file);
  const hasStatusWarning = hasAuthFileStatusWarning(file);
  const noteValue = typeof file.note === 'string' ? file.note.trim() : '';
  const identity = deriveAuthFileIdentity(file);
  // Only long-lived Claude logins keep a separate limits login to reconnect.
  const limitsReconnectId = file.longLived ? file.id : undefined;
  const disabled = file.disabled === true;

  const stateLabel = isRuntimeOnly
    ? t('auth_files.type_virtual')
    : disabled
      ? t('auth_files.health_status_disabled')
      : hasStatusWarning
        ? t('auth_files.health_status_warning')
        : t('auth_files.status_toggle_label');
  const stateDot = isRuntimeOnly
    ? 'bg-primary'
    : disabled
      ? 'bg-faint'
      : hasStatusWarning
        ? 'bg-warning'
        : 'bg-success';

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
  const busy = isStatusUpdating || isManualRefreshing;

  return (
    <Item
      variant="outline"
      role="listitem"
      className={cn(
        'items-start gap-x-3 gap-y-3 p-3 sm:p-4',
        selected && 'border-primary/50 bg-primary/5',
        isRoutingSelected && !selected && 'border-primary/30'
      )}
    >
      {!isRuntimeOnly && (
        <Checkbox
          className="mt-2.5"
          checked={selected}
          onCheckedChange={() => onToggleSelect(file.name)}
          aria-label={t('auth_files.card_select', { name: identity.primary })}
        />
      )}
      <ProviderLogo
        type={providerKey}
        className={cn('size-9 rounded-lg', disabled && 'opacity-50')}
      />
      <ItemContent className={cn('min-w-0 gap-0.5', disabled && 'opacity-60')}>
        <ItemTitle className="w-full max-w-full">
          <span
            className="min-w-0 truncate"
            title={identity.kind === 'email' ? undefined : identity.primary}
          >
            {identity.kind === 'email' ? (
              <Private>{identity.primary}</Private>
            ) : (
              identity.primary || typeLabel
            )}
          </span>
          {isRoutingSelected && (
            <Badge variant="secondary" className="gap-1.5">
              <span className="size-1.5 rounded-full bg-primary" />
              {t('auth_files.routing_selected')}
            </Badge>
          )}
        </ItemTitle>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          <span>{typeLabel}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn('size-1.5 rounded-full', stateDot)} aria-hidden="true" />
            {stateLabel}
          </span>
          <span
            className="font-mono text-xs tabular-nums"
            title={`${t('stats.success')} / ${t('stats.failure')}`}
          >
            <span className={successCount > 0 ? 'text-success' : undefined}>{successCount}</span>
            <span className="text-faint"> / </span>
            <span className={failureCount > 0 ? 'text-destructive' : undefined}>
              {failureCount}
            </span>
          </span>
          {noteValue && (
            <span className="min-w-0 truncate text-faint" title={noteValue}>
              {noteValue}
            </span>
          )}
        </div>
        {statusMessage && hasStatusWarning && (
          <p className="line-clamp-2 text-xs text-warning" title={statusMessage}>
            {statusMessage}
          </p>
        )}
      </ItemContent>
      <ItemActions className="-my-0.5 gap-0 max-sm:order-last max-sm:-mr-1.5 max-sm:basis-full max-sm:justify-end">
        {showAccountPreference && (
          <IconAction
            icon={Route01Icon}
            label={t(
              accountPreferred ? 'auth_files.account_preferred' : 'auth_files.prefer_account'
            )}
            aria-label={t('auth_files.prefer_account_aria', { name: identity.primary })}
            aria-pressed={accountPreferred === true}
            className={cn(accountPreferred && 'text-primary hover:text-primary')}
            onClick={() => onPreferAccount?.(file)}
            disabled={
              disableControls ||
              disabled ||
              accountPreferenceUpdating ||
              accountPreferenceLoading ||
              accountPreferred ||
              busy
            }
          />
        )}
        {showModelsButton && (
          <IconAction
            icon={Layers01Icon}
            label={t('auth_files.models_button')}
            onClick={() => onShowModels(file)}
            disabled={disableControls}
          />
        )}
        {limitsReconnectId && (
          <IconAction
            icon={Key01Icon}
            label={t('auth_files.reconnect_limits_button')}
            onClick={() => {
              const state: OAuthPageLocationState = {
                claudeReconnect: { id: limitsReconnectId, label: identity.primary },
              };
              navigate('/oauth', { state });
            }}
            disabled={disableControls || disabled}
          />
        )}
        {showManualRefreshButton && (
          <IconAction
            icon={RefreshIcon}
            label={t('auth_files.manual_refresh_button')}
            onClick={() => onManualRefresh(file)}
            disabled={disableControls || disabled || busy}
          />
        )}
        {!isRuntimeOnly && (
          <>
            <IconAction
              icon={Settings02Icon}
              label={t('auth_files.prefix_proxy_button')}
              onClick={() => onOpenPrefixProxyEditor(file)}
              disabled={disableControls || isManualRefreshing}
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <IconAction
                  icon={Delete02Icon}
                  label={t('auth_files.delete_button')}
                  className="hover:text-destructive"
                  disabled={disableControls || deleting === file.name || isManualRefreshing}
                />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('auth_files.delete_title', { defaultValue: 'Delete File' })}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="break-all">
                    {t('auth_files.delete_confirm')} <Private>{file.name}</Private>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => onDelete(file.name)}>
                    {t('common.delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </ItemActions>
      {!isRuntimeOnly && (
        <ItemActions className="mt-1.5 sm:ml-1">
          <Switch
            aria-label={t('auth_files.card_toggle', { name: identity.primary })}
            checked={!file.disabled}
            disabled={disableControls || busy}
            onCheckedChange={(value) => onToggleStatus(file, value)}
          />
        </ItemActions>
      )}

      {quota && (
        <ItemFooter
          className={cn(
            'flex-col items-stretch gap-1.5',
            isRuntimeOnly ? 'sm:pl-12' : 'sm:pl-19',
            disabled && 'opacity-60'
          )}
          title={quota.state.last_error || undefined}
        >
          <div className="flex items-baseline justify-between gap-3 font-mono text-xs tabular-nums">
            <span className="text-foreground">{quotaLabel}</span>
            {resetAt !== null && (
              <span className="text-muted-foreground">
                {formatRelativeInstant(resetAt, now, i18n.language)}
              </span>
            )}
          </div>
          <QuotaMeter percent={quota.remainingPercent} classes={quotaClasses} />
        </ItemFooter>
      )}

      {Boolean(file.cooldownSnapshot?.records?.length) && (
        <div className={cn('basis-full', isRuntimeOnly ? 'sm:pl-12' : 'sm:pl-19')}>
          <AuthFileCooldownSection
            snapshot={file.cooldownSnapshot}
            resetting={Boolean(authIndexKey && cooldownResetting[authIndexKey])}
            resetDisabled={disableControls || busy}
            onReset={authIndexKey ? () => onCooldownReset(file) : undefined}
          />
        </div>
      )}
    </Item>
  );
}
