import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Analytics01Icon,
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
  Refresh01Icon,
  Settings01Icon,
} from '@hugeicons/core-free-icons';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { boxStyle, NavIndicator, useSlidingNav } from '@/components/layout/nav';
import { cn } from '@/lib/utils';
import { MainRoutes } from '@/router/MainRoutes';
import { authFilesApi } from '@/services/api';
import { useAuthStore, useConfigStore, useLanguageStore, useNotificationStore } from '@/stores';
import { AUTH_FILES_CHANGED_EVENT } from '@/features/authFiles/authFilesEvents';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { LANGUAGE_LABEL_KEYS, LANGUAGE_ORDER } from '@/utils/constants';

/** A destination in the rail. `phone` ones stay in the bottom bar; the rest move into "More". */
interface Destination {
  id: string;
  path: string;
  label: string;
  icon: ReactNode;
  phone?: boolean;
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

/** Phones get the bottom bar, so a few destinations move into a menu there. */
function usePhone() {
  const query = '(max-width: 639px)';
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setPhone(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return phone;
}

export function MainLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const logout = useAuthStore((state) => state.logout);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [authFilesCount, setAuthFilesCount] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const authFilesCountRequestRef = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
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
        icon: railIcon(DashboardSquare01Icon),
        phone: true,
      },
    ],
    [
      {
        id: 'api-keys',
        path: '/api-keys',
        label: t('nav.client_api_keys'),
        icon: railIcon(Key01Icon),
      },
      {
        id: 'auth-files',
        path: '/auth-files',
        label: t('nav.auth_files'),
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
      { id: 'oauth', path: '/oauth', label: t('nav.oauth'), icon: railIcon(Login03Icon) },
    ],
    [
      {
        id: 'usage',
        path: '/usage',
        label: t('nav.usage'),
        icon: railIcon(Analytics01Icon),
        phone: true,
      },
      {
        id: 'quota',
        path: '/quota',
        label: t('nav.quota_management'),
        icon: railIcon(DashboardSpeed01Icon),
        phone: true,
      },
      { id: 'logs', path: '/logs', label: t('nav.logs'), icon: railIcon(File01Icon), phone: true },
    ],
    [
      {
        id: 'config',
        path: '/config',
        label: t('nav.config_management'),
        icon: railIcon(Settings01Icon),
      },
      {
        id: 'system',
        path: '/system',
        label: t('nav.system_info'),
        icon: railIcon(InformationCircleIcon),
      },
    ],
  ];
  const destinations = groups.flat();

  const pathname = location.pathname;
  const currentDestination = destinations.find((entry) => isActivePath(entry.path, pathname));
  const pageName =
    currentDestination?.label ??
    (pathname.startsWith('/ai-providers')
      ? t('nav.ai_providers')
      : pathname.startsWith('/quick-start')
        ? t('nav.quick_start')
        : '');

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
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 px-3 sm:px-4">
        <Logo className="size-7" />
        <span className="text-lg text-faint">/</span>
        <nav className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate font-medium">{pageName}</span>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('header.refresh_all')}
                disabled={refreshing}
                onClick={() => void handleRefreshAll()}
                className="text-muted-foreground"
              >
                <HugeiconsIcon icon={Refresh01Icon} strokeWidth={1.75} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('header.refresh_all')}</TooltipContent>
          </Tooltip>
          <div
            className={cn(
              'flex items-center gap-2 text-xs',
              live ? 'text-muted-foreground' : 'text-warning'
            )}
          >
            <span className={cn('size-2 rounded-full', live ? 'bg-success' : 'bg-warning')} />
            {statusLabel}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <Rail
          groups={groups}
          activeItem={activeItem}
          currentItem={railItem}
          onNavigate={(path) => navigate(path)}
          onLogOut={logout}
        />

        <main
          ref={mainRef}
          className="relative mx-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-xl border bg-background sm:mr-3 sm:mb-3 sm:ml-0"
        >
          <MainRoutes />
        </main>
      </div>
    </div>
  );
}

const railButton =
  'relative size-10 rounded-lg text-muted-foreground hover:bg-transparent dark:hover:bg-transparent aria-expanded:bg-transparent dark:aria-expanded:bg-transparent';

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

  const destinations = groups.flat();
  const moreDestinations = destinations.filter((entry) => !entry.phone);
  const separator = <span aria-hidden className="my-1 h-px w-6 shrink-0 bg-border max-sm:hidden" />;

  const languageMenu = (
    <DropdownMenuRadioGroup value={language} onValueChange={setLanguage}>
      {LANGUAGE_ORDER.map((lang) => (
        <DropdownMenuRadioItem key={lang} value={lang}>
          {t(LANGUAGE_LABEL_KEYS[lang])}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );

  return (
    <nav
      {...navProps}
      className="relative order-last flex shrink-0 items-center justify-around gap-1 px-2 py-1.5 sm:order-none sm:w-14 sm:flex-col sm:justify-start sm:px-0 sm:py-2"
    >
      {hover && (
        <NavIndicator
          box={hover.box}
          shown={hover.shown}
          slide={hover.slide}
          className="rounded-lg bg-muted/50"
        />
      )}
      {current && (
        <NavIndicator box={current.box} slide={current.slide} className="rounded-lg bg-accent" />
      )}

      {groups.map((group, index) => (
        <div key={group[0].id} className="contents">
          {index > 0 && separator}
          {group.map((entry) => {
            return (
              <Button
                key={entry.id}
                {...itemProps(
                  entry.id,
                  entry.count ? `${entry.label} · ${entry.count.value}` : entry.label
                )}
                variant="ghost"
                size="icon-lg"
                aria-label={entry.count ? `${entry.label}, ${entry.count.label}` : entry.label}
                aria-current={activeItem === entry.id ? 'page' : undefined}
                onClick={() => onNavigate(entry.path)}
                className={cn(
                  railButton,
                  !entry.phone && 'max-sm:hidden',
                  activeItem === entry.id && 'text-foreground'
                )}
              >
                {entry.icon}
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
          {languageMenu}
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

      {/* Phones only: the destinations that don't fit the bottom bar, the language and log out. */}
      <DropdownMenu onOpenChange={(open) => open && hide()}>
        <DropdownMenuTrigger asChild>
          <Button
            {...itemProps('more', t('common.more'))}
            variant="ghost"
            size="icon-lg"
            aria-label={t('common.more')}
            className={cn(railButton, 'sm:hidden', activeItem === 'more' && 'text-foreground')}
          >
            {railIcon(MoreHorizontalIcon)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-60">
          {moreDestinations.map((entry) => (
            <DropdownMenuItem
              key={entry.id}
              onSelect={() => onNavigate(entry.path)}
              className={cn('h-9', entry.id === currentItem && 'text-primary')}
            >
              {entry.icon}
              {entry.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="h-9">
              {railIcon(GlobeIcon)}
              {t('language.switch')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">{languageMenu}</DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem className="h-9" onSelect={onLogOut}>
            {railIcon(Logout01Icon)}
            {t('header.logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {hover && (
        // The buttons carry their names, so this label only repeats them for sighted users.
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-0 left-0 z-50 ease-out motion-reduce:transition-none',
            hover.slide && tipReady && 'transition-transform duration-200'
          )}
          style={boxStyle(hover.box)}
        >
          <span
            className={cn(
              'absolute bottom-full left-1/2 mb-2 w-max -translate-x-1/2 rounded-md bg-foreground px-3 py-1.5 text-xs text-background transition-opacity duration-150 motion-reduce:transition-none sm:top-1/2 sm:bottom-auto sm:left-full sm:mb-0 sm:ml-2 sm:translate-x-0 sm:-translate-y-1/2',
              !(shown && tipReady) && 'opacity-0'
            )}
          >
            {hover.label}
            <span className="absolute bottom-0 left-1/2 size-2.5 -translate-x-1/2 translate-y-1/2 rotate-45 rounded-[2px] bg-foreground sm:top-1/2 sm:bottom-auto sm:left-0 sm:-translate-y-1/2" />
          </span>
        </span>
      )}
    </nav>
  );
}
