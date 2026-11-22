import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Delete02Icon,
  GithubIcon,
  PlugSocketIcon,
  RefreshIcon,
  Search01Icon,
  Settings02Icon,
  Store01Icon,
} from '@hugeicons/core-free-icons';
import { Page, Section } from '@/components/layout/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { cn } from '@/lib/utils';
import { pluginsApi, pluginStoreApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { getErrorMessage, isRecord } from '@/utils/helpers';
import type {
  PluginConfigField,
  PluginListEntry,
  PluginListResponse,
  PluginStoreEntry,
} from '@/types';
import {
  buildPluginConfigDraft,
  buildPluginConfigPatch,
  normalizePluginConfigFieldType,
  type PluginConfigDraft,
} from './pluginConfigDraft';
import {
  getPluginTitle,
  notifyPluginResourcesChanged,
  resolvePluginAssetURL,
} from './pluginResources';
import { waitForPluginState } from './pluginPolling';
import { getPluginLogo } from './pluginLogo';
import { Notice, PluginLogo } from './components/PluginParts';

type PluginRuntimeWaitStatus = 'ready' | 'globalDisabled' | 'timeout';

const hasStatus = (error: unknown, status: number) => isRecord(error) && error.status === status;

const hasRestartRequired = (value: unknown) => isRecord(value) && value.restart_required === true;

const hasRestartRequiredError = (error: unknown) =>
  isRecord(error) && (hasRestartRequired(error.details) || hasRestartRequired(error.data));

export function PluginsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const clearConfigCache = useConfigStore((state) => state.clearCache);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);

  const [data, setData] = useState<PluginListResponse | null>(null);
  const [storeLogos, setStoreLogos] = useState<{
    apiBase: string;
    managementKey: string;
    entries: PluginStoreEntry[];
  } | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingPlugin, setEditingPlugin] = useState<PluginListEntry | null>(null);
  const [draft, setDraft] = useState<PluginConfigDraft | null>(null);
  const [mutatingID, setMutatingID] = useState('');
  const [deletingID, setDeletingID] = useState('');
  const [openingConfigID, setOpeningConfigID] = useState('');
  const configRequestSeq = useRef(0);

  const connected = connectionStatus === 'connected';

  const loadPlugins = useCallback(async () => {
    if (!connected) {
      setLoading(false);
      setError(t('notification.connection_required'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const plugins = await pluginsApi.list();
      setData(plugins);
    } catch (err: unknown) {
      setError(
        hasStatus(err, 404)
          ? t('plugin_management.unsupported_backend')
          : getErrorMessage(err, t('plugin_management.load_failed'))
      );
    } finally {
      setLoading(false);
    }
  }, [connected, t]);

  const waitForPluginRuntimeState = useCallback(
    async (id: string, enabled: boolean): Promise<PluginRuntimeWaitStatus> => {
      const result = await waitForPluginState(id, (item, response) =>
        enabled
          ? !response.pluginsEnabled || (item.registered && item.effectiveEnabled)
          : !item.effectiveEnabled
      );
      setData(result.response);
      if (enabled && !result.response.pluginsEnabled) {
        return 'globalDisabled';
      }
      return result.timedOut ? 'timeout' : 'ready';
    },
    []
  );

  useHeaderRefresh(loadPlugins, connected);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  useEffect(() => {
    setStoreLogos(null);
    if (!connected || !data) return;
    let cancelled = false;
    void pluginStoreApi.list().then(
      (response) => {
        if (!cancelled) {
          setStoreLogos({ apiBase, managementKey, entries: response.plugins });
        }
      },
      () => {
        // Store metadata is optional; its failure must not block plugin management.
      }
    );
    return () => {
      cancelled = true;
    };
  }, [connected, apiBase, managementKey, data]);

  const logoEntries =
    connected && storeLogos?.apiBase === apiBase && storeLogos.managementKey === managementKey
      ? storeLogos.entries
      : [];

  const pluginStats = useMemo(() => {
    const plugins = data?.plugins ?? [];
    return {
      registered: plugins.filter((plugin) => plugin.registered).length,
      effective: plugins.filter((plugin) => plugin.effectiveEnabled).length,
    };
  }, [data?.plugins]);

  const visiblePlugins = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const plugins = data?.plugins ?? [];
    if (!query) return plugins;

    return plugins.filter((plugin) => {
      const haystack = [
        plugin.id,
        plugin.path,
        plugin.metadata?.name,
        plugin.metadata?.author,
        plugin.metadata?.version,
        plugin.metadata?.githubRepository,
        ...plugin.menus.map((menu) => `${menu.menu} ${menu.path} ${menu.description}`),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [data?.plugins, filter]);

  const resolvePluginAsset = useCallback(
    (value: string) => resolvePluginAssetURL(value, apiBase),
    [apiBase]
  );

  const openConfigSheet = async (plugin: PluginListEntry) => {
    if (openingConfigID || mutatingID || deletingID) return;

    const requestSeq = configRequestSeq.current + 1;
    configRequestSeq.current = requestSeq;
    setOpeningConfigID(plugin.id);
    setEditingPlugin(plugin);
    setDraft(null);

    try {
      const currentConfig = await pluginsApi.getConfig(plugin.id);
      if (configRequestSeq.current !== requestSeq) return;

      setDraft(buildPluginConfigDraft(plugin, currentConfig));
    } catch (err: unknown) {
      if (configRequestSeq.current !== requestSeq) return;

      setEditingPlugin(null);
      setDraft(null);
      showNotification(
        hasStatus(err, 404)
          ? t('plugin_management.config_not_found')
          : `${t('plugin_management.config_load_failed')}: ${getErrorMessage(
              err,
              t('plugin_management.config_load_failed')
            )}`,
        'error'
      );
    } finally {
      if (configRequestSeq.current === requestSeq) {
        setOpeningConfigID('');
      }
    }
  };

  const closeConfigSheet = () => {
    if (mutatingID || openingConfigID || deletingID) return;
    setEditingPlugin(null);
    setDraft(null);
  };

  const updateDraft = (updater: (current: PluginConfigDraft) => PluginConfigDraft) => {
    setDraft((current) => (current ? updater(current) : current));
  };

  const handleTogglePlugin = async (plugin: PluginListEntry, enabled: boolean) => {
    if (deletingID) return;
    setMutatingID(plugin.id);
    try {
      await pluginsApi.updateEnabled(plugin.id, enabled);
      clearConfigCache();
      const status = await waitForPluginRuntimeState(plugin.id, enabled);
      if (status === 'ready') {
        notifyPluginResourcesChanged();
        showNotification(t('plugin_management.toggle_success'), 'success');
      } else {
        showNotification(
          t(
            status === 'globalDisabled'
              ? 'plugin_management.global_disabled_hint'
              : 'plugin_management.runtime_pending'
          ),
          'warning'
        );
      }
    } catch (err: unknown) {
      showNotification(
        `${t('plugin_management.toggle_failed')}: ${getErrorMessage(
          err,
          t('plugin_management.toggle_failed')
        )}`,
        'error'
      );
    } finally {
      setMutatingID('');
    }
  };

  const handleDeletePlugin = (plugin: PluginListEntry) => {
    if (!connected || mutatingID || openingConfigID || deletingID) return;

    const name = getPluginTitle(plugin);
    showConfirmation({
      title: t('plugin_management.delete_confirm_title'),
      message: t('plugin_management.delete_confirm_message', { name, id: plugin.id }),
      variant: 'danger',
      confirmText: t('plugin_management.delete_plugin'),
      onConfirm: async () => {
        setDeletingID(plugin.id);
        setMutatingID(plugin.id);
        try {
          const result = await pluginsApi.deletePlugin(plugin.id);
          clearConfigCache();
          if (editingPlugin?.id === plugin.id) {
            setEditingPlugin(null);
            setDraft(null);
          }
          await loadPlugins();
          notifyPluginResourcesChanged();
          showNotification(t('plugin_management.delete_success'), 'success');
          if (result.restartRequired) {
            showNotification(t('plugin_management.delete_restart_required'), 'warning');
          }
        } catch (err: unknown) {
          const restartRequired = hasRestartRequiredError(err);
          const fallback = restartRequired
            ? t('plugin_management.delete_restart_required')
            : t('plugin_management.delete_failed');
          showNotification(
            `${t('plugin_management.delete_failed')}: ${getErrorMessage(err, fallback)}`,
            restartRequired ? 'warning' : 'error'
          );
        } finally {
          setDeletingID('');
          setMutatingID('');
        }
      },
    });
  };

  const handleSaveConfig = async () => {
    if (!editingPlugin || !draft || openingConfigID || mutatingID || deletingID) return;
    const { patch, errors } = buildPluginConfigPatch(draft, editingPlugin.configFields, t);

    if (Object.keys(errors).length > 0) {
      setDraft({ ...draft, errors });
      showNotification(t('plugin_management.validation_failed'), 'warning');
      return;
    }

    if (Object.keys(patch).length === 0) {
      setEditingPlugin(null);
      setDraft(null);
      showNotification(t('plugin_management.save_success'), 'success');
      return;
    }

    setMutatingID(editingPlugin.id);
    try {
      await pluginsApi.patchConfig(editingPlugin.id, patch);
      clearConfigCache();
      const enabledChanged =
        typeof patch.enabled === 'boolean' && patch.enabled !== editingPlugin.enabled;
      const status = enabledChanged
        ? await waitForPluginRuntimeState(editingPlugin.id, patch.enabled === true)
        : await loadPlugins().then((): PluginRuntimeWaitStatus => 'ready');
      if (status === 'ready') {
        notifyPluginResourcesChanged();
      }
      setEditingPlugin(null);
      setDraft(null);
      if (status === 'ready') {
        showNotification(t('plugin_management.save_success'), 'success');
      } else {
        showNotification(
          t(
            status === 'globalDisabled'
              ? 'plugin_management.global_disabled_hint'
              : 'plugin_management.runtime_pending'
          ),
          'warning'
        );
      }
    } catch (err: unknown) {
      showNotification(
        `${t('plugin_management.save_failed')}: ${getErrorMessage(
          err,
          t('plugin_management.save_failed')
        )}`,
        'error'
      );
    } finally {
      setMutatingID('');
    }
  };

  const handleFieldTextChange =
    (fieldName: string) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      updateDraft((current) => ({
        ...current,
        values: { ...current.values, [fieldName]: value },
        errors: { ...current.errors, [fieldName]: '' },
        touchedFields: { ...current.touchedFields, [fieldName]: true },
      }));
    };

  const handleFieldBooleanChange = (fieldName: string, value: boolean) => {
    updateDraft((current) => ({
      ...current,
      values: { ...current.values, [fieldName]: value },
      errors: { ...current.errors, [fieldName]: '' },
      touchedFields: { ...current.touchedFields, [fieldName]: true },
    }));
  };

  const handlePriorityChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    updateDraft((current) => ({
      ...current,
      priority: value,
      errors: { ...current.errors, priority: '' },
      priorityTouched: true,
    }));
  };

  const renderFieldEditor = (field: PluginConfigField) => {
    if (!draft) return null;
    const fieldType = normalizePluginConfigFieldType(field);
    const value = draft.values[field.name];
    const textValue = typeof value === 'string' ? value : '';
    const errorText = draft.errors[field.name];
    const fieldId = `plugin-field-${field.name}`;

    if (fieldType === 'boolean') {
      return (
        <Field key={field.name} orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={fieldId} className="font-mono">
              {field.name}
            </FieldLabel>
            {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
          </FieldContent>
          <Switch
            id={fieldId}
            checked={value === true}
            onCheckedChange={(nextValue) => handleFieldBooleanChange(field.name, nextValue)}
          />
        </Field>
      );
    }

    let control: ReactNode;
    if (fieldType === 'enum' && field.enumValues.length > 0) {
      control = (
        <Select
          value={textValue}
          onValueChange={(nextValue) =>
            updateDraft((current) => ({
              ...current,
              values: { ...current.values, [field.name]: nextValue },
              errors: { ...current.errors, [field.name]: '' },
              touchedFields: { ...current.touchedFields, [field.name]: true },
            }))
          }
        >
          <SelectTrigger id={fieldId} className="w-full data-[size=default]:h-9">
            <SelectValue placeholder={t('plugin_management.select_placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {field.enumValues.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    } else if (fieldType === 'array' || fieldType === 'object') {
      control = (
        <Textarea
          id={fieldId}
          className="min-h-28 font-mono text-[12.5px] md:text-[12.5px]"
          value={textValue}
          onChange={handleFieldTextChange(field.name)}
          placeholder={fieldType === 'array' ? '[]' : '{}'}
          spellCheck={false}
          aria-invalid={Boolean(errorText) || undefined}
        />
      );
    } else {
      control = (
        <Input
          id={fieldId}
          className="h-9"
          value={textValue}
          onChange={handleFieldTextChange(field.name)}
          inputMode={fieldType === 'integer' || fieldType === 'number' ? 'decimal' : undefined}
          aria-invalid={Boolean(errorText) || undefined}
        />
      );
    }

    return (
      <Field key={field.name} data-invalid={Boolean(errorText) || undefined}>
        <FieldLabel htmlFor={fieldId} className="font-mono">
          {field.name}
        </FieldLabel>
        {control}
        {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
        {errorText ? <FieldError>{errorText}</FieldError> : null}
      </Field>
    );
  };

  const savingConfig = Boolean(editingPlugin && mutatingID === editingPlugin.id);
  const plugins = data?.plugins ?? [];
  const busy = Boolean(mutatingID || deletingID);

  return (
    <>
      <Page
        title={t('plugin_management.title')}
        actions={
          <div className="flex items-center gap-2">
            {data ? (
              <Badge variant="secondary" className="gap-1.5 max-sm:hidden">
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    data.pluginsEnabled ? 'bg-success' : 'bg-faint'
                  )}
                />
                {data.pluginsEnabled
                  ? t('plugin_management.global_enabled')
                  : t('plugin_management.global_disabled')}
              </Badge>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-lg"
                  aria-label={t('plugin_management.refresh')}
                  onClick={loadPlugins}
                  disabled={!connected || loading || busy}
                >
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('plugin_management.refresh')}</TooltipContent>
            </Tooltip>
            <Button
              size="lg"
              className="h-9 px-3 max-sm:w-9 max-sm:px-0"
              onClick={() => navigate('/plugin-store')}
            >
              <HugeiconsIcon icon={Store01Icon} data-icon="inline-start" strokeWidth={1.75} />
              <span className="max-sm:sr-only">{t('plugin_store.title')}</span>
            </Button>
          </div>
        }
      >
        <Section
          title={t('plugin_management.discovered')}
          actions={
            data && plugins.length > 0 ? (
              <Badge variant="secondary" className="tabular-nums">
                {t('plugin_management.effective')} {pluginStats.effective}/{pluginStats.registered}
              </Badge>
            ) : null
          }
        >
          {error ? <Notice tone="error">{error}</Notice> : null}
          {data && !data.pluginsEnabled ? (
            <Notice tone="warning">{t('plugin_management.global_disabled_hint')}</Notice>
          ) : null}

          {plugins.length > 0 || filter ? (
            <InputGroup className="h-9">
              <InputGroupAddon>
                <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('plugin_management.search_placeholder')}
                aria-label={t('plugin_management.search_label')}
              />
            </InputGroup>
          ) : null}

          {loading && !data ? (
            <ItemGroup className="gap-2">
              {Array.from({ length: 3 }, (_, index) => (
                <Item key={index} variant="outline" size="sm" aria-hidden="true">
                  <div className="size-9 rounded-lg bg-muted" />
                  <ItemContent className="gap-2">
                    <div className="h-3.5 w-40 rounded bg-muted" />
                    <div className="h-3 w-24 rounded bg-muted/60" />
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          ) : visiblePlugins.length === 0 ? (
            error ? null : (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={PlugSocketIcon} strokeWidth={1.75} />
                  </EmptyMedia>
                  <EmptyTitle>{t('plugin_management.no_plugins')}</EmptyTitle>
                  <EmptyDescription>{t('plugin_management.no_plugins_desc')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          ) : (
            <ItemGroup className="gap-2">
              {visiblePlugins.map((plugin) => {
                const logo = resolvePluginAsset(getPluginLogo(plugin, logoEntries));
                const github = plugin.metadata?.githubRepository.trim();
                const actionBusy = Boolean(mutatingID || openingConfigID || deletingID);
                const version = plugin.metadata?.version;
                const author = plugin.metadata?.author;
                const meta = [version, author, plugin.path].filter(Boolean).join(' · ');
                const title = getPluginTitle(plugin);

                return (
                  <Item key={plugin.id} variant="outline" size="sm" className="bg-card">
                    <PluginLogo key={logo} src={logo} />
                    <ItemContent className="min-w-0">
                      <ItemTitle className="max-w-full flex-wrap">
                        <span className="min-w-0 truncate">{title}</span>
                        <span
                          className={cn(
                            'size-2 shrink-0 rounded-full',
                            plugin.effectiveEnabled ? 'bg-success' : 'bg-faint'
                          )}
                          title={
                            plugin.effectiveEnabled
                              ? t('plugin_management.status_effective')
                              : t('plugin_management.status_inactive')
                          }
                        />
                        {!plugin.registered ? (
                          <Badge variant="outline" className="text-warning">
                            {t('plugin_management.not_registered')}
                          </Badge>
                        ) : null}
                        {!plugin.configured ? (
                          <Badge variant="secondary">{t('plugin_management.not_configured')}</Badge>
                        ) : null}
                        {plugin.supportsOAuth ? (
                          <Badge variant="secondary">{t('plugin_management.oauth')}</Badge>
                        ) : null}
                      </ItemTitle>
                      <ItemDescription className="truncate font-mono text-xs" title={meta}>
                        {plugin.id}
                        {meta ? <span className="text-faint"> · {meta}</span> : null}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="gap-0.5">
                      {github ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              aria-label={t('plugin_management.open_repository')}
                            >
                              <a href={github} target="_blank" rel="noreferrer">
                                <HugeiconsIcon icon={GithubIcon} strokeWidth={1.75} />
                              </a>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('plugin_management.open_repository')}</TooltipContent>
                        </Tooltip>
                      ) : null}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('plugin_management.edit_config')}
                            onClick={() => openConfigSheet(plugin)}
                            disabled={!connected || actionBusy}
                          >
                            <HugeiconsIcon icon={Settings02Icon} strokeWidth={1.75} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('plugin_management.edit_config')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('plugin_management.delete_plugin')}
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeletePlugin(plugin)}
                            disabled={!connected || actionBusy}
                          >
                            <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('plugin_management.delete_plugin')}</TooltipContent>
                      </Tooltip>
                      <Switch
                        className="ml-2"
                        checked={plugin.enabled}
                        onCheckedChange={(enabled) => handleTogglePlugin(plugin, enabled)}
                        disabled={!connected || actionBusy}
                        aria-label={`${t('plugin_management.enabled')}: ${title}`}
                      />
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          )}

          {data ? (
            <p className="text-[13px] text-muted-foreground">
              {t('plugin_management.plugins_dir')}:{' '}
              <span className="font-mono text-xs text-foreground">
                {data.pluginsDir || 'plugins'}
              </span>
            </p>
          ) : null}
        </Section>
      </Page>

      <Sheet
        open={Boolean(editingPlugin && draft)}
        onOpenChange={(open) => {
          if (!open) closeConfigSheet();
        }}
      >
        <SheetContent
          className="w-full gap-0 sm:max-w-lg"
          showCloseButton={!savingConfig}
          onEscapeKeyDown={(event) => savingConfig && event.preventDefault()}
          onInteractOutside={(event) => savingConfig && event.preventDefault()}
        >
          <SheetHeader className="border-b px-5 py-4 pr-12">
            <SheetTitle>
              {editingPlugin
                ? t('plugin_management.config_title', { name: getPluginTitle(editingPlugin) })
                : t('plugin_management.edit_config')}
            </SheetTitle>
            <SheetDescription className="truncate font-mono text-xs">
              {editingPlugin?.id}
            </SheetDescription>
          </SheetHeader>
          {draft && editingPlugin ? (
            <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-5 py-5">
              <FieldSet>
                <FieldLegend>{t('plugin_management.base_settings')}</FieldLegend>
                <FieldGroup>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel htmlFor="plugin-enabled">
                        {t('plugin_management.enabled')}
                      </FieldLabel>
                      <FieldDescription>{t('plugin_management.enabled_hint')}</FieldDescription>
                    </FieldContent>
                    <Switch
                      id="plugin-enabled"
                      checked={draft.enabled}
                      onCheckedChange={(enabled) =>
                        updateDraft((current) => ({
                          ...current,
                          enabled,
                          enabledTouched: true,
                        }))
                      }
                    />
                  </Field>
                  <Field data-invalid={Boolean(draft.errors.priority) || undefined}>
                    <FieldLabel htmlFor="plugin-priority">
                      {t('plugin_management.priority')}
                    </FieldLabel>
                    <Input
                      id="plugin-priority"
                      className="h-9"
                      value={draft.priority}
                      onChange={handlePriorityChange}
                      inputMode="numeric"
                      aria-invalid={Boolean(draft.errors.priority) || undefined}
                    />
                    {draft.errors.priority ? (
                      <FieldError>{draft.errors.priority}</FieldError>
                    ) : null}
                  </Field>
                </FieldGroup>
              </FieldSet>

              <FieldSet>
                <FieldLegend>{t('plugin_management.config_fields')}</FieldLegend>
                {editingPlugin.configFields.length > 0 ? (
                  <FieldGroup>
                    {editingPlugin.configFields.map((field) => renderFieldEditor(field))}
                  </FieldGroup>
                ) : (
                  <FieldDescription>{t('plugin_management.no_config_fields')}</FieldDescription>
                )}
              </FieldSet>
            </div>
          ) : null}
          <SheetFooter className="flex-row justify-end border-t px-5 py-3">
            <Button
              variant="outline"
              size="lg"
              className="px-4"
              onClick={closeConfigSheet}
              disabled={savingConfig}
            >
              {t('common.cancel')}
            </Button>
            <Button size="lg" className="px-4" onClick={handleSaveConfig} disabled={savingConfig}>
              {t('common.save')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
