import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  AiCloud01Icon,
  Analytics01Icon,
  ArrowDown01Icon,
  DashboardSquare01Icon,
  DashboardSpeed01Icon,
  File01Icon,
  FileKeyIcon,
  GlobeIcon,
  InformationCircleIcon,
  Key01Icon,
  Login03Icon,
  Logout01Icon,
  MoreHorizontalIcon,
  RefreshIcon,
  Settings01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { boxStyle, NavIndicator, useSlidingNav } from '@/components/layout/nav';
import { PageBarContext, usePhone, type PageBarUse } from '@/components/layout/pageBar';
import { cn } from '@/lib/utils';
import { MainRoutes } from '@/router/MainRoutes';
import { authFilesApi } from '@/services/api';
import { useAuthStore, useConfigStore, useLanguageStore, useNotificationStore } from '@/stores';
import { AUTH_FILES_CHANGED_EVENT } from '@/features/authFiles/authFilesEvents';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useConfirmLogout } from '@/hooks/useConfirmLogout';
import { LANGUAGE_LABEL_KEYS, LANGUAGE_ORDER } from '@/utils/constants';

/** A destination in the rail. `phone` ones stay in the bottom bar; the rest move into "More". */
interface Destination {
  id: string;
  path: string;
  label: string;
  /** The phone label: the bottom bar, the More sheet and the top bar title. */
  short: string;
  icon: ReactNode;
  phone?: boolean;
  /** False for pages the desktop rail reaches another way (AI providers, from the config pages). */
  rail?: boolean;
  /** A count shown in the tooltip, with its spoken form for screen readers. */
  count?: { value: number; label: string };
}

const railIcon = (icon: IconSvgElement) => (
  <HugeiconsIcon icon={icon} className="size-5" strokeWidth={1.75} />
);

const isActivePath = (path: string, pathname: string) =>
  path === '/'
    ? pathname === '/' || pathname === '/dashboard'
    : pathname === path || pathname.startsWith(`${path}/`);

export function MainLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const confirmLogout = useConfirmLogout();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [authFilesCount, setAuthFilesCount] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const authFilesCountRequestRef = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  const [pageBar, setPageBar] = useState<HTMLDivElement | null>(null);
  // Tracked in state rather than with `:empty` selectors: Chrome doesn't restyle sibling
  // selectors when a portal swaps the bar's children during navigation.
  const [barUses, setBarUses] = useState<PageBarUse[]>([]);
  const registerPageBar = useCallback((use: PageBarUse) => {
    setBarUses((current) => [...current, use]);
    return () => setBarUses((current) => current.filter((entry) => entry !== use));
  }, []);
  const barTitle = barUses.length > 0;
  const barActions = barUses.some((use) => use.actions);
  const barBack = barUses.some((use) => use.back);
  const phone = usePhone();

  // Floating save and batch bars center themselves on the content panel.
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const update = () => {
      const rect = main.getBoundingClientRect();
      document.documentElement.style.setProperty(
        '--content-center-x',
        `${rect.left + rect.width / 2}px`
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(main);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--content-center-x');
    };
  }, []);

  useEffect(() => {
    fetchConfig().catch(() => {
      // Ignore the initial failure; the login flow shows the user-facing prompt.
    });
  }, [fetchConfig]);

  const loadAuthFilesCount = useCallback(async () => {
    const requestID = ++authFilesCountRequestRef.current;
    if (connectionStatus !== 'connected') {
      setAuthFilesCount(null);
      return;
    }
    try {
      const response = await authFilesApi.list();
      if (requestID !== authFilesCountRequestRef.current) return;
      setAuthFilesCount(Array.isArray(response?.files) ? response.files.length : null);
    } catch {
      if (requestID !== authFilesCountRequestRef.current) return;
      setAuthFilesCount(null);
    }
  }, [connectionStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAuthFilesCount();
    }, 0);
    window.addEventListener(AUTH_FILES_CHANGED_EVENT, loadAuthFilesCount);
    return () => {
      authFilesCountRequestRef.current += 1;
      window.clearTimeout(timer);
      window.removeEventListener(AUTH_FILES_CHANGED_EVENT, loadAuthFilesCount);
    };
  }, [apiBase, loadAuthFilesCount]);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    clearCache();
    const results = await Promise.allSettled([
      fetchConfig(true),
      loadAuthFilesCount(),
      triggerHeaderRefresh(),
    ]);
    setRefreshing(false);
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected && rejected.status === 'rejected') {
      const reason: unknown = rejected.reason;
      const message =
        typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : '';
      showNotification(
        `${t('notification.refresh_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
      return;
    }
    showNotification(t('notification.data_refreshed'), 'success');
  };

  // Rail groups in the order you work through them: overview, access, traffic, settings.
  const groups: Destination[][] = [
    [
      {
        id: 'dashboard',
        path: '/',
        label: t('nav.dashboard'),
        short: t('nav_short.dashboard'),
        icon: railIcon(DashboardSquare01Icon),
        phone: true,
      },
    ],
    [
      {
        id: 'api-keys',
        path: '/api-keys',
        label: t('nav.client_api_keys'),
        short: t('nav_short.api_keys'),
        icon: railIcon(Key01Icon),
      },
      {
        id: 'auth-files',
        path: '/auth-files',
        label: t('nav.auth_files'),
        short: t('nav_short.auth_files'),
        icon: railIcon(FileKeyIcon),
        phone: true,
        count:
          authFilesCount === null
            ? undefined
            : {
                value: authFilesCount,
                label: t('sidebar.auth_files_count', { count: authFilesCount }),
              },
      },
      {
        id: 'oauth',
        path: '/oauth',
        label: t('nav.oauth'),
        short: t('nav_short.oauth'),
        icon: railIcon(Login03Icon),
      },
    ],
    [
      {
        id: 'usage',
        path: '/usage',
        label: t('nav.usage'),
        short: t('nav_short.usage'),
        icon: railIcon(Analytics01Icon),
        phone: true,
      },
      {
        id: 'quota',
        path: '/quota',
        label: t('nav.quota_management'),
        short: t('nav_short.quota'),
        icon: railIcon(DashboardSpeed01Icon),
        phone: true,
      },
      {
        id: 'logs',
        path: '/logs',
        label: t('nav.logs'),
        short: t('nav_short.logs'),
        icon: railIcon(File01Icon),
        phone: true,
      },
    ],
    [
      {
        id: 'ai-providers',
        path: '/ai-providers',
        label: t('nav.ai_providers'),
        short: t('nav_short.ai_providers'),
        icon: railIcon(AiCloud01Icon),
        rail: false,
      },
      {
        id: 'config',
        path: '/config',
        label: t('nav.config_management'),
        short: t('nav_short.config'),
        icon: railIcon(Settings01Icon),
      },
      {
        id: 'system',
        path: '/system',
        label: t('nav.system_info'),
        short: t('nav_short.system'),
        icon: railIcon(InformationCircleIcon),
      },
    ],
  ];
  const destinations = groups.flat();

  const pathname = location.pathname;
  const currentDestination = destinations.find((entry) => isActivePath(entry.path, pathname));
  const pageName = currentDestination?.label ?? '';
  // Top-level pages take the short name in the phone top bar; sub-pages keep their own title.
  const shortTitle =
    currentDestination &&
    (currentDestination.id === 'dashboard' || pathname === currentDestination.path)
      ? currentDestination.short
      : undefined;
  const pageBarContext = { element: pageBar, register: registerPageBar, title: shortTitle };

  // The rail item to highlight. On phones, anything outside the bottom bar lights up "More".
  const railItem = currentDestination?.id;
  const inBottomBar = destinations.some((entry) => entry.id === railItem && entry.phone);
  const activeItem = phone && railItem && !inBottomBar ? 'more' : railItem;

  const live = connectionStatus === 'connected';
  const statusLabel = live
    ? t('common.connected_status')
    : connectionStatus === 'connecting'
      ? t('common.connecting_status')
      : t('common.disconnected_status');

  return (
    <div className="flex h-dvh flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <header className="flex h-12 shrink-0 items-center gap-3 px-4 max-sm:h-14 max-sm:border-b">
        <span className={cn('relative flex shrink-0', barBack && 'max-sm:hidden')}>
          <Logo className="size-7" />
          {/* Phones show the connection as a dot on the logo; the words only when it's down. */}
          {live && (
            <span
              role="status"
              aria-label={statusLabel}
              className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-success ring-2 ring-background sm:hidden"
            />
          )}
        </span>
        <span className="text-lg text-faint max-sm:hidden">/</span>
        {/* Pages fill this with their title and actions on phones (see PageBarContent). */}
        <div
          ref={setPageBar}
          className={cn(
            // Every control a page puts here is a 40px touch target, whatever size the page asked
            // for (segmented items too, so their track is 44px), and ghost icons share one colour.
            'flex min-w-0 flex-1 items-center gap-1 [&_[data-slot=button]]:h-10 [&_[data-slot=button][data-size^=icon]]:w-10 [&_[data-slot=button][data-variant=ghost]]:text-foreground [&_[data-slot=select-trigger]]:h-10 [&_[data-slot=toggle-group-item]]:h-10',
            !barTitle && 'hidden'
          )}
        />
        <nav className={cn('flex min-w-0 items-center gap-2 text-sm', barTitle && 'max-sm:hidden')}>
          <span className="truncate font-medium max-sm:text-base max-sm:font-semibold">
            {phone ? (shortTitle ?? pageName) : pageName}
          </span>
        </nav>
        {/* On phones a page's own actions, which carry their own refresh, take this spot. */}
        <div className={cn('ml-auto flex items-center gap-3', barActions && 'max-sm:hidden')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('common.refresh')}
                disabled={refreshing}
                onClick={() => void handleRefreshAll()}
                className="max-sm:size-10"
              >
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('common.refresh')}</TooltipContent>
          </Tooltip>
        </div>
        <div
          className={cn(
            'flex items-center gap-2 text-xs',
            live ? 'text-muted-foreground max-sm:hidden' : 'text-warning'
          )}
        >
          <span className={cn('size-2 rounded-full', live ? 'bg-success' : 'bg-warning')} />
          {statusLabel}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <Rail
          groups={groups}
          activeItem={activeItem}
          currentItem={railItem}
          onNavigate={(path) => navigate(path)}
          onLogOut={confirmLogout}
        />

        <main
          ref={mainRef}
          className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-background sm:mr-3 sm:mb-3 sm:rounded-xl sm:border"
        >
          <PageBarContext value={pageBarContext}>
            <MainRoutes />
          </PageBarContext>
        </main>
      </div>
    </div>
  );
}

const railButton =
  'relative size-10 rounded-lg text-muted-foreground hover:bg-transparent dark:hover:bg-transparent aria-expanded:bg-transparent dark:aria-expanded:bg-transparent';

// Phones: each bottom bar item is a full-height column with its icon in a pill and a short label under it.
const bottomItem =
  'max-sm:h-14 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1 max-sm:flex-col max-sm:gap-1 max-sm:rounded-xl';
const bottomPill =
  'flex items-center justify-center max-sm:h-7 max-sm:w-12 max-sm:rounded-full max-sm:transition-colors';
const bottomLabel = 'max-w-full truncate px-0.5 text-[11px] leading-4 font-medium sm:hidden';

const sheetRow =
  'flex h-12 w-full shrink-0 items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:bg-foreground/8 disabled:opacity-50 [&_svg]:text-muted-foreground';

/**
 * The icon rail on the left, a bottom bar on phones, like VM Bridge's sidebar. One hover highlight
 * and one tooltip follow the pointer from icon to icon; the active highlight slides on navigation.
 */
function Rail({
  groups,
  activeItem,
  currentItem,
  onNavigate,
  onLogOut,
}: {
  groups: Destination[][];
  /** The highlighted rail item: on phones, "more" stands in for what lives in that menu. */
  activeItem?: string;
  currentItem?: string;
  onNavigate: (path: string) => void;
  onLogOut: () => void;
}) {
  const { t } = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const { hover, current, hide, navProps, itemProps } = useSlidingNav(activeItem);
  const phone = usePhone();
  const [moreOpen, setMoreOpen] = useState(false);
  const [languagesOpen, setLanguagesOpen] = useState(false);

  // Like the tooltip provider's delay: the first tooltip waits, then it follows the pointer at once.
  // Keyboard focus shows it right away.
  const [tipReady, setTipReady] = useState(false);
  const shown = hover?.shown ?? false;
  const focused = hover?.focused ?? false;
  useEffect(() => {
    setTipReady(shown && focused);
    if (!shown || focused) return;
    const timer = setTimeout(() => setTipReady(true), 300);
    return () => clearTimeout(timer);
  }, [shown, focused]);

  const moreDestinations = groups.flat().filter((entry) => !entry.phone);
  const separator = <span aria-hidden className="my-1 h-px w-6 shrink-0 bg-border max-sm:hidden" />;

  const openMore = (open: boolean) => {
    setMoreOpen(open);
    if (open) hide();
    else setLanguagesOpen(false);
  };
  // Close the sheet first so focus goes back to "More" before the action runs.
  const fromSheet = (action: () => void) => () => {
    openMore(false);
    action();
  };

  return (
    <nav
      {...navProps}
      className="relative order-last flex shrink-0 items-center justify-around gap-1 px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] max-sm:gap-0 max-sm:border-t sm:order-none sm:w-14 sm:flex-col sm:justify-start sm:px-0 sm:py-2"
    >
      {hover && (
        <NavIndicator
          box={hover.box}
          shown={hover.shown}
          slide={hover.slide}
          className="rounded-lg bg-muted/50 max-sm:hidden"
        />
      )}
      {current && (
        <NavIndicator
          box={current.box}
          slide={current.slide}
          className="rounded-lg bg-accent max-sm:hidden"
        />
      )}

      {groups.map((group, index) => (
        <div key={group[0].id} className="contents">
          {index > 0 && separator}
          {group
            .filter((entry) => entry.rail !== false)
            .map((entry) => {
              const active = activeItem === entry.id;
              // Phones show the short label, so the spoken name starts with the same words.
              const name = phone ? entry.short : entry.label;
              return (
                <Button
                  key={entry.id}
                  {...itemProps(
                    entry.id,
                    entry.count ? `${entry.label} · ${entry.count.value}` : entry.label
                  )}
                  variant="ghost"
                  size="icon-lg"
                  aria-label={
                    entry.count ? `${name}, ${phone ? entry.count.value : entry.count.label}` : name
                  }
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(entry.path)}
                  className={cn(
                    railButton,
                    bottomItem,
                    !entry.phone && 'max-sm:hidden',
                    active && 'text-foreground'
                  )}
                >
                  <span className={cn(bottomPill, active && 'max-sm:bg-foreground/12')}>
                    {entry.icon}
                  </span>
                  <span aria-hidden className={bottomLabel}>
                    {entry.short}
                  </span>
                </Button>
              );
            })}
        </div>
      ))}

      <DropdownMenu onOpenChange={(open) => open && hide()}>
        <DropdownMenuTrigger asChild>
          <Button
            {...itemProps('language', t('language.switch'))}
            variant="ghost"
            size="icon-lg"
            aria-label={t('language.switch')}
            className={cn(railButton, 'max-sm:hidden sm:mt-auto')}
          >
            {railIcon(GlobeIcon)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-48">
          <DropdownMenuRadioGroup value={language} onValueChange={setLanguage}>
            {LANGUAGE_ORDER.map((lang) => (
              <DropdownMenuRadioItem key={lang} value={lang}>
                {t(LANGUAGE_LABEL_KEYS[lang])}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        {...itemProps('logout', t('header.logout'))}
        variant="ghost"
        size="icon-lg"
        aria-label={t('header.logout')}
        className={cn(railButton, 'max-sm:hidden')}
        onClick={onLogOut}
      >
        {railIcon(Logout01Icon)}
      </Button>

      {/* Phones only: a sheet with the pages that don't fit the bottom bar, then the app actions. */}
      <Sheet open={moreOpen} onOpenChange={openMore}>
        <SheetTrigger asChild>
          <Button
            {...itemProps('more', t('common.more'))}
            variant="ghost"
            size="icon-lg"
            aria-label={t('common.more')}
            aria-current={activeItem === 'more' ? 'page' : undefined}
            className={cn(
              railButton,
              bottomItem,
              'sm:hidden',
              activeItem === 'more' && 'text-foreground'
            )}
          >
            <span className={cn(bottomPill, activeItem === 'more' && 'bg-foreground/12')}>
              {railIcon(MoreHorizontalIcon)}
            </span>
            <span aria-hidden className={bottomLabel}>
              {t('common.more')}
            </span>
          </Button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          className="max-h-[85dvh] gap-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden"
        >
          <SheetHeader>
            <SheetTitle>{t('common.more')}</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain px-1 scroll-fade-y">
            {moreDestinations.map((entry) => {
              const active = entry.id === currentItem;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={fromSheet(() => onNavigate(entry.path))}
                  className={cn(sheetRow, active && 'bg-foreground/10 [&_svg]:text-foreground')}
                >
                  {entry.icon}
                  {entry.short}
                </button>
              );
            })}
            <span aria-hidden className="mx-3 my-2 h-px shrink-0 bg-border" />
            <button
              type="button"
              aria-expanded={languagesOpen}
              onClick={() => setLanguagesOpen((open) => !open)}
              className={sheetRow}
            >
              {railIcon(GlobeIcon)}
              {t('language.switch')}
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {t(LANGUAGE_LABEL_KEYS[language])}
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                strokeWidth={1.75}
                className={cn('size-4 transition-transform', languagesOpen && 'rotate-180')}
              />
            </button>
            {languagesOpen && (
              <div role="radiogroup" aria-label={t('language.switch')} className="flex flex-col">
                {LANGUAGE_ORDER.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    role="radio"
                    aria-checked={lang === language}
                    onClick={() => {
                      setLanguage(lang);
                      setLanguagesOpen(false);
                    }}
                    className={cn(sheetRow, 'h-11 pl-11 text-sm')}
                  >
                    {t(LANGUAGE_LABEL_KEYS[lang])}
                    {lang === language && (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={1.75}
                        className="ml-auto size-4 text-foreground!"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Pinned below the list, so an open language list scrolls instead of cutting it off. */}
          <div className="shrink-0 px-1">
            <button type="button" onClick={fromSheet(onLogOut)} className={sheetRow}>
              {railIcon(Logout01Icon)}
              {t('header.logout')}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {hover && (
        // The buttons carry their names, so this label only repeats them for sighted users.
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-0 left-0 z-50 ease-out max-sm:hidden motion-reduce:transition-none',
            hover.slide && tipReady && 'transition-transform duration-200'
          )}
          style={boxStyle(hover.box)}
        >
          <span
            className={cn(
              'absolute top-1/2 left-full ml-2 w-max -translate-y-1/2 rounded-md bg-foreground px-3 py-1.5 text-xs text-background transition-opacity duration-150 motion-reduce:transition-none',
              !(shown && tipReady) && 'opacity-0'
            )}
          >
            {hover.label}
            <span className="absolute top-1/2 left-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] bg-foreground" />
          </span>
        </span>
      )}
    </nav>
  );
}
