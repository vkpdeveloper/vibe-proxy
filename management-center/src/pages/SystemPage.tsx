import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AiBrain01Icon,
  ArrowUpRight01Icon,
  BookOpen01Icon,
  GithubIcon,
  InformationCircleIcon,
  LinkSquare02Icon,
  RefreshIcon,
  SourceCodeIcon,
  UserLock01Icon,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Private } from '@/components/ui/private';
import { Switch } from '@/components/ui/switch';
import { Page, Section, type Tab } from '@/components/layout/Page';
import { Logo } from '@/components/brand';
import { cn } from '@/lib/utils';
import {
  useAuthStore,
  useConfigStore,
  useNotificationStore,
  useModelsStore,
  useThemeStore,
} from '@/stores';
import { configApi, versionApi } from '@/services/api';
import { useApiKeysForModels } from '@/hooks/useApiKeysForModels';
import { formatDateTimeValue } from '@/utils/format';
import { classifyModels } from '@/utils/models';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import iconGemini from '@/assets/icons/gemini.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconMeta from '@/assets/icons/meta.svg';
import iconDevinLight from '@/assets/icons/devin.svg';
import iconDevinDark from '@/assets/icons/devin-dark.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconGlm from '@/assets/icons/glm.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconGrokDark from '@/assets/icons/grok-dark.svg';
import iconDeepseek from '@/assets/icons/deepseek.svg';
import iconMinimax from '@/assets/icons/minimax.svg';

const MODEL_CATEGORY_ICONS: Record<string, string | { light: string; dark: string }> = {
  devin: { light: iconDevinLight, dark: iconDevinDark },
  gpt: { light: iconOpenaiLight, dark: iconOpenaiDark },
  claude: iconClaude,
  meta: iconMeta,
  gemini: iconGemini,
  qwen: iconQwen,
  glm: iconGlm,
  grok: { light: iconGrok, dark: iconGrokDark },
  deepseek: iconDeepseek,
  minimax: iconMinimax,
};

const LINKS = [
  {
    href: 'https://github.com/router-for-me/CLIProxyAPI',
    icon: GithubIcon,
    title: 'system_info.link_main_repo',
    description: 'system_info.link_main_repo_desc',
  },
  {
    href: 'https://github.com/router-for-me/Cli-Proxy-API-Management-Center',
    icon: SourceCodeIcon,
    title: 'system_info.link_webui_repo',
    description: 'system_info.link_webui_repo_desc',
  },
  {
    href: 'https://help.router-for.me/',
    icon: BookOpen01Icon,
    title: 'system_info.link_docs',
    description: 'system_info.link_docs_desc',
  },
] as const;

type SystemTab = 'about' | 'models' | 'links' | 'storage';
const TAB_IDS: SystemTab[] = ['about', 'models', 'links', 'storage'];

const STATUS_DOT = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
  muted: 'bg-faint',
} as const;

const parseVersionSegments = (version?: string | null) => {
  if (!version) return null;
  const cleaned = version.trim().replace(/^v/i, '');
  if (!cleaned) return null;
  const parts = cleaned
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((segment) => Number.parseInt(segment, 10))
    .filter(Number.isFinite);
  return parts.length ? parts : null;
};

const compareVersions = (latest?: string | null, current?: string | null) => {
  const latestParts = parseVersionSegments(latest);
  const currentParts = parseVersionSegments(current);
  if (!latestParts || !currentParts) return null;
  const length = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < length; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return 1;
    if (l < c) return -1;
  }
  return 0;
};

export function SystemPage() {
  const { t, i18n } = useTranslation();
  const { showNotification } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const auth = useAuthStore();
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const modelsError = useModelsStore((state) => state.error);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: SystemTab = TAB_IDS.find((id) => id === tabParam) ?? 'about';

  const [modelStatus, setModelStatus] = useState<{
    type: 'success' | 'warning' | 'error' | 'muted';
    message: string;
  }>();
  const [requestLogModalOpen, setRequestLogModalOpen] = useState(false);
  const [requestLogDraft, setRequestLogDraft] = useState(false);
  const [requestLogTouched, setRequestLogTouched] = useState(false);
  const [requestLogSaving, setRequestLogSaving] = useState(false);
  const [checkingVersion, setCheckingVersion] = useState(false);

  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const otherLabel = useMemo(
    () => (i18n.language?.toLowerCase().startsWith('zh') ? '其他' : 'Other'),
    [i18n.language]
  );
  const groupedModels = useMemo(() => classifyModels(models, { otherLabel }), [models, otherLabel]);
  const requestLogEnabled = config?.requestLog ?? false;
  const requestLogDirty = requestLogDraft !== requestLogEnabled;
  const canEditRequestLog = auth.connectionStatus === 'connected' && Boolean(config);

  const notRecorded = t('system_info.version_unknown');
  const appVersion = __APP_COMMIT__ || notRecorded;
  const appBuilt = formatDateTimeValue(__APP_BUILD_TIME__, i18n.language) || notRecorded;
  const apiVersion = auth.serverVersion || notRecorded;
  const apiBuilt = formatDateTimeValue(auth.serverBuildDate, i18n.language) || notRecorded;

  const tabs: Tab<SystemTab>[] = [
    { id: 'about', label: t('system_info.tab_about'), icon: InformationCircleIcon },
    { id: 'models', label: t('system_info.models_title'), icon: AiBrain01Icon },
    { id: 'links', label: t('system_info.quick_links_title'), icon: LinkSquare02Icon },
    { id: 'storage', label: t('system_info.clear_login_title'), icon: UserLock01Icon },
  ];

  const getIconForCategory = (categoryId: string): string | null => {
    const iconEntry = MODEL_CATEGORY_ICONS[categoryId];
    if (!iconEntry) return null;
    if (typeof iconEntry === 'string') return iconEntry;
    return resolvedTheme === 'dark' ? iconEntry.dark : iconEntry.light;
  };

  const resolveApiKeysForModels = useApiKeysForModels();

  const fetchModels = async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
    if (auth.connectionStatus !== 'connected') {
      setModelStatus({
        type: 'warning',
        message: t('notification.connection_required'),
      });
      return;
    }

    if (!auth.apiBase) {
      showNotification(t('notification.connection_required'), 'warning');
      return;
    }

    setModelStatus({ type: 'muted', message: t('system_info.models_loading') });
    try {
      const apiKeys = await resolveApiKeysForModels({ force: forceRefresh });
      const primaryKey = apiKeys[0];
      const list = await fetchModelsFromStore(auth.apiBase, primaryKey, forceRefresh);
      const hasModels = list.length > 0;
      setModelStatus({
        type: hasModels ? 'success' : 'warning',
        message: hasModels
          ? t('system_info.models_count', { count: list.length })
          : t('system_info.models_empty'),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      const suffix = message ? `: ${message}` : '';
      const text = `${t('system_info.models_error')}${suffix}`;
      setModelStatus({ type: 'error', message: text });
    }
  };

  const clearLoginStorage = () => {
    auth.logout();
    if (typeof localStorage === 'undefined') return;
    const keysToRemove = [STORAGE_KEY_AUTH, 'isLoggedIn', 'apiBase', 'apiUrl', 'managementKey'];
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    showNotification(t('notification.login_storage_cleared'), 'success');
  };

  const openRequestLogModal = useCallback(() => {
    setRequestLogTouched(false);
    setRequestLogDraft(requestLogEnabled);
    setRequestLogModalOpen(true);
  }, [requestLogEnabled]);

  // Seven quick taps on the version row open the hidden request-log switch.
  const handleInfoVersionTap = useCallback(() => {
    versionTapCount.current += 1;
    if (versionTapTimer.current) {
      clearTimeout(versionTapTimer.current);
    }

    if (versionTapCount.current >= 7) {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
      openRequestLogModal();
      return;
    }

    versionTapTimer.current = setTimeout(() => {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
    }, 1500);
  }, [openRequestLogModal]);

  const handleRequestLogClose = useCallback(() => {
    setRequestLogModalOpen(false);
    setRequestLogTouched(false);
  }, []);

  const handleRequestLogSave = async () => {
    if (!canEditRequestLog) return;
    if (!requestLogDirty) {
      setRequestLogModalOpen(false);
      return;
    }

    const previous = requestLogEnabled;
    setRequestLogSaving(true);
    updateConfigValue('request-log', requestLogDraft);

    try {
      await configApi.updateRequestLog(requestLogDraft);
      clearCache('request-log');
      showNotification(t('notification.request_log_updated'), 'success');
      setRequestLogModalOpen(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('request-log', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setRequestLogSaving(false);
    }
  };

  const handleVersionCheck = useCallback(async () => {
    setCheckingVersion(true);
    try {
      const data = await versionApi.checkLatest();
      const latestRaw = data?.['latest-version'] ?? data?.latest_version ?? data?.latest ?? '';
      const latest = typeof latestRaw === 'string' ? latestRaw : String(latestRaw ?? '');
      const comparison = compareVersions(latest, auth.serverVersion);

      if (!latest) {
        showNotification(t('system_info.version_check_error'), 'error');
        return;
      }

      if (comparison === null) {
        showNotification(t('system_info.version_current_missing'), 'warning');
        return;
      }

      if (comparison > 0) {
        showNotification(t('system_info.version_update_available', { version: latest }), 'warning');
      } else {
        showNotification(t('system_info.version_is_latest'), 'success');
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      const suffix = message ? `: ${message}` : '';
      showNotification(`${t('system_info.version_check_error')}${suffix}`, 'error');
    } finally {
      setCheckingVersion(false);
    }
  }, [auth.serverVersion, showNotification, t]);

  useEffect(() => {
    fetchConfig().catch(() => {
      // ignore
    });
  }, [fetchConfig]);

  useEffect(() => {
    if (requestLogModalOpen && !requestLogTouched) {
      setRequestLogDraft(requestLogEnabled);
    }
  }, [requestLogModalOpen, requestLogTouched, requestLogEnabled]);

  useEffect(() => {
    return () => {
      if (versionTapTimer.current) {
        clearTimeout(versionTapTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.connectionStatus, auth.apiBase]);

  const connectionDot =
    auth.connectionStatus === 'connected'
      ? 'bg-success'
      : auth.connectionStatus === 'connecting'
        ? 'bg-warning'
        : 'bg-faint';

  return (
    <Page
      title={t('system_info.title')}
      tabs={tabs}
      tab={tab}
      onTab={(next) => setSearchParams(next === 'about' ? {} : { tab: next }, { replace: true })}
    >
      {tab === 'about' && (
        <Section title={t('system_info.about_title')} icon={<Logo className="size-6" />}>
          <div className="divide-y overflow-hidden rounded-xl border bg-card text-sm">
            {/* A plain row to the eye; also the seven-tap target for the request log switch. */}
            <button
              type="button"
              className="flex w-full cursor-default items-center justify-between gap-6 px-4 py-3 text-left outline-none focus-visible:bg-muted/50"
              onClick={handleInfoVersionTap}
            >
              <span className="text-muted-foreground">{t('system_info.dashboard_version')}</span>
              <span className="truncate font-mono text-xs">{appVersion}</span>
            </button>
            <div className="flex items-center justify-between gap-6 px-4 py-3">
              <span className="text-muted-foreground">{t('system_info.dashboard_built')}</span>
              <span className="truncate font-mono text-xs">{appBuilt}</span>
            </div>
            <div className="flex items-center justify-between gap-6 px-4 py-2">
              <span className="text-muted-foreground">{t('system_info.proxy_version')}</span>
              <span className="flex min-w-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="max-w-full truncate font-mono text-xs">{apiVersion}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={checkingVersion}
                  onClick={() => void handleVersionCheck()}
                >
                  {t('system_info.version_check_button')}
                </Button>
              </span>
            </div>
            <div className="flex items-center justify-between gap-6 px-4 py-3">
              <span className="text-muted-foreground">{t('system_info.proxy_built')}</span>
              <span className="truncate font-mono text-xs">{apiBuilt}</span>
            </div>
            <div className="flex items-center justify-between gap-6 px-4 py-3">
              <span className="shrink-0 text-muted-foreground">{t('system_info.connection')}</span>
              <span className="flex min-w-0 flex-col items-end gap-1">
                <span className="flex items-center gap-2">
                  <span className={cn('size-2 rounded-full', connectionDot)} />
                  {t(`common.${auth.connectionStatus}_status`)}
                </span>
                {auth.apiBase && (
                  <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
                    <Private>{auth.apiBase}</Private>
                  </span>
                )}
              </span>
            </div>
          </div>
        </Section>
      )}

      {tab === 'models' && (
        <Section
          title={t('system_info.models_title')}
          actions={
            <Button
              variant="outline"
              size="lg"
              className="h-9"
              disabled={modelsLoading}
              onClick={() => void fetchModels({ forceRefresh: true })}
            >
              <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" strokeWidth={1.75} />
              {t('common.refresh')}
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-muted-foreground">{t('system_info.models_desc')}</p>
            {modelStatus && (
              <span className="flex items-center gap-2 text-[13px]">
                <span className={cn('size-2 rounded-full', STATUS_DOT[modelStatus.type])} />
                <span className={modelStatus.type === 'error' ? 'text-destructive' : undefined}>
                  {modelStatus.message}
                </span>
              </span>
            )}
            {modelsError && <p className="text-[13px] text-destructive">{modelsError}</p>}
          </div>
          {modelsLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : models.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={AiBrain01Icon} strokeWidth={1.75} />
                </EmptyMedia>
                <EmptyTitle>{t('system_info.models_empty')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y overflow-hidden rounded-xl border bg-card">
              {groupedModels.map((group) => {
                const iconSrc = getIconForCategory(group.id);
                return (
                  <div key={group.id} className="flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2.5 text-sm font-medium">
                        {iconSrc ? (
                          <img src={iconSrc} alt="" className="size-5 rounded" />
                        ) : (
                          <HugeiconsIcon
                            icon={AiBrain01Icon}
                            className="size-5 text-muted-foreground"
                            strokeWidth={1.75}
                          />
                        )}
                        {group.label}
                      </span>
                      <span className="font-mono text-xs text-faint">{group.items.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((model) => (
                        <Badge
                          key={`${model.name}-${model.alias ?? 'default'}`}
                          variant="secondary"
                          className="h-auto max-w-full gap-1.5 font-mono font-normal"
                          title={model.description || ''}
                        >
                          <span className="truncate">{model.name}</span>
                          {model.alias && (
                            <span className="truncate text-muted-foreground">{model.alias}</span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {tab === 'links' && (
        <Section title={t('system_info.quick_links_title')}>
          <ItemGroup className="gap-2">
            {LINKS.map((link) => (
              <Item key={link.href} variant="outline" asChild>
                <a href={link.href} target="_blank" rel="noopener noreferrer">
                  <ItemMedia variant="icon">
                    <HugeiconsIcon icon={link.icon} strokeWidth={1.75} />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle>{t(link.title)}</ItemTitle>
                    <ItemDescription>{t(link.description)}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <HugeiconsIcon
                      icon={ArrowUpRight01Icon}
                      className="size-4 text-muted-foreground"
                      strokeWidth={2}
                    />
                  </ItemActions>
                </a>
              </Item>
            ))}
          </ItemGroup>
        </Section>
      )}

      {tab === 'storage' && (
        <Section title={t('system_info.clear_login_title')}>
          <Item variant="outline">
            <ItemContent>
              <ItemDescription>{t('system_info.clear_login_desc')}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">{t('system_info.clear_login_button')}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('system_info.clear_login_title')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('system_info.clear_login_confirm')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={clearLoginStorage}>
                      {t('common.confirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </ItemActions>
          </Item>
        </Section>
      )}

      <Dialog
        open={requestLogModalOpen}
        onOpenChange={(open) => {
          if (!open && !requestLogSaving) handleRequestLogClose();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('basic_settings.request_log_title')}</DialogTitle>
          </DialogHeader>
          <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-[13px] text-warning">
            {t('basic_settings.request_log_warning')}
          </p>
          <Field orientation="horizontal" className="justify-between">
            <FieldLabel htmlFor="request-log-enabled">
              {t('basic_settings.request_log_enable')}
            </FieldLabel>
            <Switch
              id="request-log-enabled"
              checked={requestLogDraft}
              disabled={!canEditRequestLog || requestLogSaving}
              onCheckedChange={(value) => {
                setRequestLogDraft(value);
                setRequestLogTouched(true);
              }}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={handleRequestLogClose} disabled={requestLogSaving}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => void handleRequestLogSave()}
              disabled={!canEditRequestLog || !requestLogDirty || requestLogSaving}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
