import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Delete02Icon,
  Key01Icon,
  Layers01Icon,
  MoreHorizontalIcon,
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
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Item, ItemActions, ItemContent, ItemFooter } from '@/components/ui/item';
import { Private } from '@/components/ui/private';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useNow } from '@/hooks/useNow';
import type { AuthFileItem } from '@/types';
import { formatDurationNarrow, formatRelativeInstant } from '@/utils/quota/relativeTime';
import { usePhone } from '@/components/layout/pageBar';
import {
  describeAuthFileStatusMessage,
  getAuthFileStatusMessage,
  hasAuthFileStatusWarning,
  getTypeLabel,
  isProblemAuthFile,
  isRuntimeOnlyAuthFile,
  isSignInProblem,
  normalizeProviderKey,
  supportsAuthFileManualRefresh,
} from '@/features/authFiles/constants';
import { getAuthFileRefreshKey } from '@/features/authFiles/manualRefresh';
import { deriveAuthFileIdentity } from '@/features/authFiles/identity';
import { parseMeaningfulDate, resolveQuotaDrainDisplay } from '@/features/authFiles/quotaDrain';
import { QuotaMeter } from '@/features/quota/components/QuotaMeter';
import { quotaClasses } from '@/features/quota/components/quotaClasses';
import type { OAuthPageLocationState } from '@/features/oauth/OAuthPage';
import { AuthFileCooldownSection } from './AuthFileCooldownSection';
import { ProviderLogo } from './ProviderLogo';
import { Hint } from '@/components/ui/tooltip';

/** Server window ids mapped to the Quota page's own label keys, so both pages name a limit alike. */
const QUOTA_WINDOW_LABEL_KEYS: Record<string, string> = {
  'five-hour': 'opencode_go_quota.five_hour',
  rolling: 'opencode_go_quota.five_hour',
  'seven-day': 'claude_quota.seven_day',
  weekly: 'opencode_go_quota.weekly',
  monthly: 'opencode_go_quota.monthly',
};

export type AuthFileCardProps = {
  file: AuthFileItem;
  selected: boolean;
  /** Phones hide the selection checkbox until the list is in select mode. */
  selecting?: boolean;
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

/** One credential: account, state, quota, request counts and its actions. */
export function AuthFileCard(props: AuthFileCardProps) {
  const { t, i18n } = useTranslation();
  const {
    file,
    selected,
    selecting = false,
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
  const phone = usePhone();
  const [errorExpanded, setErrorExpanded] = useState(false);

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
  const statusError = hasAuthFileStatusWarning(file)
    ? describeAuthFileStatusMessage(getAuthFileStatusMessage(file))
    : null;
  const noteValue = typeof file.note === 'string' ? file.note.trim() : '';
  const identity = deriveAuthFileIdentity(file);
  // Only long-lived Claude logins keep a separate limits login to reconnect.
  const limitsReconnectId = file.longLived ? file.id : undefined;
  const disabled = file.disabled === true;

  const stateLabel = isRuntimeOnly
    ? t('auth_files.type_virtual')
    : disabled
      ? t('auth_files.health_status_disabled')
      : statusError
        ? t('auth_files.problem_filter_problem')
        : t('auth_files.status_toggle_label');
  const stateDot = isRuntimeOnly
    ? 'bg-primary'
    : disabled
      ? 'bg-faint'
      : statusError
        ? 'bg-warning'
        : 'bg-success';

  const quota = resolveQuotaDrainDisplay(file, now);
  const quotaLabel = !quota
    ? ''
    : quota.status === 'exhausted'
      ? t('auth_files.quota_drain_exhausted')
      : quota.remainingPercent !== null
        ? t('auth_files.quota_drain_remaining', { percent: Math.round(quota.remainingPercent) })
        : quota.state.supported === false
          ? t('auth_files.quota_unknown_unsupported')
          : quota.state.last_error
            ? t('auth_files.quota_unknown_error')
            : t('auth_files.quota_drain_unavailable');
  const resetAt = parseMeaningfulDate(quota?.window?.reset_at);
  const windowLabelKey = quota?.window ? QUOTA_WINDOW_LABEL_KEYS[quota.window.id] : undefined;
  const windowLabel = windowLabelKey ? t(windowLabelKey) : quota?.window?.label;

  const routingSelection = file.routing_selection ?? file.routingSelection;
  const routingExpiresAt = parseMeaningfulDate(routingSelection?.expires_at);
  const isRoutingSelected =
    routingSelection?.selected === true && routingExpiresAt !== null && routingExpiresAt > now;
  const busy = isStatusUpdating || isManualRefreshing;
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const reconnectLimits = () => {
    if (!limitsReconnectId) return;
    const state: OAuthPageLocationState = {
      claudeReconnect: { id: limitsReconnectId, label: identity.primary },
    };
    navigate('/oauth', { state });
  };
  const reconnectDisabled = disableControls || disabled;
  // Disabled accounts can still renew so they work as soon as they are re-enabled.
  const manualRefreshDisabled = disableControls || busy;
  const deleteDisabled = disableControls || deleting === file.name || isManualRefreshing;
  const preferDisabled =
    disableControls ||
    disabled ||
    accountPreferenceUpdating ||
    accountPreferenceLoading ||
    accountPreferred ||
    busy;
  const quotaUnknown = quota?.status === 'unavailable';
  // Signing in again only matters while the card has no limits to show.
  const showReconnectInMenu = Boolean(limitsReconnectId) && quota?.remainingPercent == null;
  const hasMenu =
    showAccountPreference ||
    showModelsButton ||
    showReconnectInMenu ||
    showManualRefreshButton ||
    !isRuntimeOnly;
  const problem = isProblemAuthFile(file);
  // A sign-in failure gets its fix on the card: refresh the token where the provider can,
  // otherwise sign in again on the OAuth page.
  const signInFix =
    !isRuntimeOnly && isSignInProblem(file)
      ? showManualRefreshButton
        ? 'refresh'
        : 'oauth'
      : null;
  // Phones show the state only when it needs attention: the switch already says "enabled".
  const stateNeedsAttention = isRuntimeOnly || disabled || Boolean(statusError);
  const preferredShown = showAccountPreference && accountPreferred;
  const preferredBadge = (
    <Badge variant="secondary" className="gap-1">
      <HugeiconsIcon icon={Route01Icon} strokeWidth={1.75} className="size-3.5 text-primary" />
      {t('auth_files.preferred_short')}
    </Badge>
  );
  // Phones fit one chip beside the provider: "In use" wins, since routing picks the preferred
  // account anyway, and carries the menu's route icon when the account is preferred too. Desktop
  // has room beside the name for both badges.
  const chip = isRoutingSelected ? (
    <Badge variant="secondary" className="gap-1.5">
      <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
      {t('auth_files.routing_selected')}
      {preferredShown && (
        <>
          <HugeiconsIcon
            icon={Route01Icon}
            strokeWidth={1.75}
            className="-mr-0.5 size-3.5 text-primary"
            aria-hidden="true"
          />
          <span className="sr-only">{t('auth_files.preferred_short')}</span>
        </>
      )}
    </Badge>
  ) : preferredShown ? (
    preferredBadge
  ) : null;
  const inUseBadge = isRoutingSelected && (
    <Badge variant="secondary" className="gap-1.5">
      <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
      {t('auth_files.routing_selected')}
    </Badge>
  );
  const hasCounts = successCount > 0 || failureCount > 0;
  // A click on the card body opens its details (or selects it while selecting). Controls keep
  // their own clicks, and clicks bubbling out of portalled menus and dialogs are ignored, as is
  // the end of a drag that selected text to copy.
  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isRuntimeOnly) return;
    const target = event.target as Element;
    if (!event.currentTarget.contains(target)) return;
    if (target.closest('button, a, input, label, [role="button"], [role="switch"]')) return;
    if (!phone && window.getSelection()?.toString()) return;
    if (selecting) onToggleSelect(file.name);
    else if (!disableControls && !isManualRefreshing) {
      // The card itself can't take focus, so the sheet hands focus back to its ⋯ button on close
      // instead of dropping it to the page.
      if (!phone)
        event.currentTarget
          .querySelector<HTMLElement>('[data-card-menu]')
          ?.focus({ preventScroll: true });
      onOpenPrefixProxyEditor(file);
    }
  };
  // Imports save notes like "OpenCode Go quota tracking", which only repeat the provider.
  const noteRepeatsProvider = noteValue.toLowerCase().startsWith(typeLabel.toLowerCase());
  // Desktop rows below the header line up with the name, past the logo.
  const indentClass = 'sm:pl-12';

  return (
    <Item
      variant="outline"
      role="listitem"
      className={cn(
        'items-start gap-x-3 gap-y-3 p-4 sm:relative',
        !isRuntimeOnly && 'cursor-pointer',
        // Desktop: the border marks selection only, and a problem gets an amber tint. Phones
        // also outline the account in use.
        selected
          ? 'border-primary/50 bg-primary/5'
          : problem
            ? 'sm:border-warning/40 sm:bg-warning/[0.04] sm:hover:bg-warning/[0.08]'
            : !isRuntimeOnly && 'sm:hover:bg-muted/40',
        isRoutingSelected && !selected && 'max-sm:border-primary/30'
      )}
      onClick={handleCardClick}
    >
      {!isRuntimeOnly && (
        // On phones the label stretches from the card edge to the logo, so the whole leading
        // cell selects; the negative margins keep the layout where the bare checkbox put it.
        // Desktop lays it over the logo tile, shown on hover or focus and while selecting, so
        // the card keeps no empty column for it.
        <label
          className={cn(
            'flex cursor-pointer max-sm:-mt-4 max-sm:-mr-3 max-sm:-mb-4 max-sm:-ml-4 max-sm:self-stretch max-sm:pt-6.5 max-sm:pr-3 max-sm:pb-4 max-sm:pl-4 sm:absolute sm:top-4 sm:left-4 sm:z-10 sm:size-9 sm:items-center sm:justify-center sm:rounded-lg sm:bg-secondary sm:ring-1 sm:ring-white/10',
            !selecting &&
              'max-sm:hidden sm:opacity-0 sm:transition-opacity sm:group-hover/item:opacity-100 sm:focus-within:opacity-100'
          )}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(file.name)}
            aria-label={t('auth_files.card_select', { name: identity.primary })}
          />
        </label>
      )}
      <ProviderLogo
        type={providerKey}
        className={cn('size-9 rounded-lg', disabled && 'opacity-50')}
      />
      <ItemContent className={cn('min-w-0 gap-0.5', disabled && 'opacity-60')}>
        {/* ItemTitle's line clamp hides overflow, which would cut Private's 40px tap target;
            overflow-x-clip truncates the name and leaves the vertical hit area alone. */}
        <div
          data-slot="item-title"
          className="flex w-full max-w-full items-center gap-2 text-sm leading-snug font-medium"
        >
          <span
            className="min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap"
            title={identity.kind === 'email' ? undefined : identity.primary}
          >
            {identity.kind === 'email' ? (
              <Private>{identity.primary}</Private>
            ) : (
              identity.primary || typeLabel
            )}
          </span>
          {(inUseBadge || preferredShown) && (
            <span className="contents max-sm:hidden">
              {inUseBadge}
              {preferredShown && preferredBadge}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground max-sm:text-[13px]">
          <span>{typeLabel}</span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5',
              !stateNeedsAttention && 'max-sm:hidden'
            )}
          >
            <span className={cn('size-1.5 rounded-full', stateDot)} aria-hidden="true" />
            {stateLabel}
          </span>
          {/* Phones keep the title for the account and put the chip here. */}
          {chip && <span className="contents sm:hidden">{chip}</span>}
          {/* Phones give the counts their own line below. */}
          {hasCounts && (
            <span className="max-sm:hidden" title={t('auth_files.count_since_restart')}>
              <span className={successCount > 0 ? 'text-success' : undefined}>
                {t('auth_files.count_success', { count: successCount })}
              </span>
              <span aria-hidden="true"> · </span>
              <span className={failureCount > 0 ? 'text-destructive' : undefined}>
                {t('auth_files.count_failure', { count: failureCount })}
              </span>
            </span>
          )}
          {noteValue && (
            <span
              className={cn('min-w-0 truncate text-faint', noteRepeatsProvider && 'max-sm:hidden')}
              title={noteValue}
            >
              {noteValue}
            </span>
          )}
        </div>
        {/* Phones tap through to the details, which show the whole message. */}
        {statusError && phone && (
          <p className="line-clamp-2 text-[13px] text-warning">
            {statusError.kind && <span className="font-medium">{statusError.kind}: </span>}
            {statusError.message}
          </p>
        )}
      </ItemContent>
      {/* The switch and the ⋯ menu share the header's top-right corner. The negative margins
          keep the menu target from making the header taller. Phone select mode hides both so
          the checkbox is the card's only control. */}
      {hasMenu && (
        <ItemActions
          className={cn(
            'mt-1.5 max-sm:-mr-2 max-sm:gap-1 sm:-mr-1.5 sm:ml-1 sm:gap-1',
            selecting && 'max-sm:hidden'
          )}
        >
          {!isRuntimeOnly && (
            <Switch
              // The switch's enlarged hit area stops at the 4px gap so the whole 40px ⋯ target
              // stays the menu's: a tap on its edge must never toggle the account.
              className="max-sm:after:-right-1"
              aria-label={t('auth_files.card_toggle', { name: identity.primary })}
              checked={!file.disabled}
              disabled={disableControls || busy}
              onCheckedChange={(value) => onToggleStatus(file, value)}
            />
          )}
          <DropdownMenu>
            <Hint label={t('common.more')}>
              <DropdownMenuTrigger asChild>
                {/* The square pseudo-element keeps the rounded button's corners tappable. */}
                <Button
                  data-card-menu=""
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.more')}
                  className="relative -my-2.5 size-10 text-muted-foreground after:absolute after:-inset-px hover:text-foreground sm:-my-1.5 sm:size-8"
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.75} />
                </Button>
              </DropdownMenuTrigger>
            </Hint>
            <DropdownMenuContent align="end" collisionPadding={16} className="w-auto min-w-52">
              {showModelsButton && (
                <DropdownMenuItem onSelect={() => onShowModels(file)} disabled={disableControls}>
                  <HugeiconsIcon icon={Layers01Icon} strokeWidth={1.75} />
                  {t('auth_files.models_button')}
                </DropdownMenuItem>
              )}
              {!isRuntimeOnly && (
                <DropdownMenuItem
                  onSelect={() => onOpenPrefixProxyEditor(file)}
                  disabled={disableControls || isManualRefreshing}
                >
                  <HugeiconsIcon icon={Settings02Icon} strokeWidth={1.75} />
                  {t('auth_files.details_button')}
                </DropdownMenuItem>
              )}
              {showReconnectInMenu && (
                <DropdownMenuItem onSelect={reconnectLimits} disabled={reconnectDisabled}>
                  <HugeiconsIcon icon={Key01Icon} strokeWidth={1.75} />
                  {t('auth_files.reconnect_limits_button')}
                </DropdownMenuItem>
              )}
              {showManualRefreshButton && (
                <DropdownMenuItem
                  onSelect={() => onManualRefresh(file)}
                  disabled={manualRefreshDisabled}
                >
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} />
                  {t('auth_files.manual_refresh_button')}
                </DropdownMenuItem>
              )}
              {showAccountPreference && (
                <>
                  <DropdownMenuSeparator />
                  {/* An action, ticked while this account is the one used until exhausted. */}
                  <DropdownMenuCheckboxItem
                    checked={accountPreferred === true}
                    onSelect={() => {
                      if (!accountPreferred) onPreferAccount?.(file);
                    }}
                    disabled={preferDisabled && !accountPreferred}
                  >
                    <HugeiconsIcon icon={Route01Icon} strokeWidth={1.75} />
                    {t('auth_files.prefer_account')}
                  </DropdownMenuCheckboxItem>
                </>
              )}
              {!isRuntimeOnly && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setConfirmDeleteOpen(true)}
                    disabled={deleteDisabled}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
                    {t('auth_files.delete_button')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      )}

      {/* Desktop gives a problem the card's full width, with its fix beside it. */}
      {statusError && !phone && (
        <div className={cn('flex basis-full flex-col items-start gap-2', indentClass)}>
          {/* A click shows the whole message beyond the title tooltip. */}
          <button
            type="button"
            aria-expanded={errorExpanded}
            className={cn('text-left text-[13px] text-warning', !errorExpanded && 'line-clamp-2')}
            title={statusError.message}
            onClick={() => setErrorExpanded((current) => !current)}
          >
            {statusError.kind && <span className="font-medium">{statusError.kind}: </span>}
            {statusError.message}
          </button>
          {signInFix === 'refresh' && (
            <Button
              variant="outline"
              onClick={() => onManualRefresh(file)}
              disabled={manualRefreshDisabled}
            >
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} data-icon="inline-start" />
              {t('auth_files.manual_refresh_button')}
            </Button>
          )}
          {signInFix === 'oauth' && (
            <Button variant="outline" asChild>
              <Link to="/oauth">{t('auth_files.sign_in_again')}</Link>
            </Button>
          )}
        </div>
      )}

      {!isRuntimeOnly && (
        <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('auth_files.delete_title')}</AlertDialogTitle>
              {/* Name the account and provider, as the card does, rather than the file. */}
              <AlertDialogDescription className="flex flex-col gap-1">
                <span className="flex min-w-0 items-center gap-2 text-foreground">
                  <ProviderLogo type={providerKey} className="size-5 rounded-[5px]" />
                  <span className="min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap">
                    {identity.kind === 'email' ? (
                      <Private>{identity.primary}</Private>
                    ) : (
                      identity.primary || typeLabel
                    )}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{typeLabel}</span>
                </span>
                <span>{t('auth_files.delete_confirm')}</span>
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
      )}

      {quota && (
        <ItemFooter
          className={cn('flex-col items-stretch gap-1.5', indentClass, disabled && 'opacity-60')}
          title={quota.state.last_error || undefined}
        >
          {/* Phones name the window as Quota does and give the reset as a short countdown
              ("Resets in 3d 12h"). */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
            <span className={cn('text-foreground', quotaUnknown && 'max-sm:text-muted-foreground')}>
              {quotaLabel}
              {windowLabel && (
                <span className="text-muted-foreground sm:hidden"> · {windowLabel}</span>
              )}
            </span>
            {resetAt !== null && (
              <span className="text-muted-foreground">
                <span className="sm:hidden">
                  {resetAt > now &&
                    t('auth_files.quota_drain_resets', {
                      span: formatDurationNarrow(resetAt, now, i18n.language),
                    })}
                </span>
                <span className="max-sm:hidden">
                  {formatRelativeInstant(resetAt, now, i18n.language)}
                </span>
              </span>
            )}
          </div>
          {/* An unknown quota has nothing to fill, so phones skip the empty track. */}
          <div className={cn(quotaUnknown && 'max-sm:hidden')}>
            <QuotaMeter percent={quota.remainingPercent} classes={quotaClasses} />
          </div>
        </ItemFooter>
      )}

      {Boolean(file.cooldownSnapshot?.records?.length) && (
        <div className={cn('basis-full', indentClass)}>
          <AuthFileCooldownSection
            snapshot={file.cooldownSnapshot}
            resetting={Boolean(authIndexKey && cooldownResetting[authIndexKey])}
            resetDisabled={disableControls || busy}
            onReset={authIndexKey ? () => onCooldownReset(file) : undefined}
          />
        </div>
      )}

      {/* The server keeps these counters in memory, so they start over when it restarts. A
          fresh credential's "0 ok · 0 failed" says nothing, so phones skip it. */}
      {hasCounts && (
        <p className="flex basis-full flex-wrap gap-x-1.5 text-[13px] text-muted-foreground sm:hidden">
          <span className={successCount > 0 ? 'text-success' : undefined}>
            {t('auth_files.count_success', { count: successCount })}
          </span>
          <span aria-hidden="true">·</span>
          <span className={failureCount > 0 ? 'text-destructive' : undefined}>
            {t('auth_files.count_failure', { count: failureCount })}
          </span>
          <span aria-hidden="true">·</span>
          <span>{t('auth_files.count_since_restart')}</span>
        </p>
      )}
    </Item>
  );
}
