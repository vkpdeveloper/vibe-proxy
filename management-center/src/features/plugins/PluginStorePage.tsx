import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  Download04Icon,
  GithubIcon,
  LinkSquare02Icon,
  RefreshIcon,
  Search01Icon,
  Shield01Icon,
  Store01Icon,
} from '@hugeicons/core-free-icons';
import { Page, Section } from '@/components/layout/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyContent,
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
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { cn } from '@/lib/utils';
import { pluginStoreApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { getErrorMessage, isRecord } from '@/utils/helpers';
import type { PluginStoreEntry, PluginStoreResponse } from '@/types';
import {
  buildRepositoryURL,
  isDefaultPluginStoreSource,
  isOfficialPlugin,
  notifyPluginResourcesChanged,
  resolvePluginAssetURL,
} from './pluginResources';
import { PluginInstallGateModal } from './components/PluginInstallGateModal';
import { Notice, PluginLogo } from './components/PluginParts';
import {
  buildGitHubReleasesPageURL,
  fetchPluginReleaseVersions,
  isValidManualReleaseTag,
  supportsPluginVersionSelection,
  type PluginReleaseVersion,
} from './pluginReleaseVersions';
import { waitForPluginStoreState } from './pluginPolling';

type StoreStatusFilter = 'all' | 'installed' | 'notInstalled' | 'updates';
type InstallVersionMode = 'latest' | 'release' | 'manual';

interface StoreLoadError {
  kind: 'unsupported' | 'registry' | 'generic';
  message: string;
}

const getErrorStatus = (error: unknown): number | undefined =>
  isRecord(error) && typeof error.status === 'number' ? error.status : undefined;

const getErrorDetailMessage = (error: unknown): string => {
  if (!isRecord(error) || !isRecord(error.details)) return '';
  const message = error.details.message;
  return typeof message === 'string' ? message.trim() : '';
};

const DESCRIPTION_COLLAPSED_LINES = 2;

const getStoreEntryTitle = (entry: PluginStoreEntry) => entry.name || entry.id;
const getStoreEntryKey = (entry: PluginStoreEntry) => entry.storeId || entry.id;
const getDescriptionDOMID = (entryKey: string) =>
  `plugin-store-desc-${encodeURIComponent(entryKey)}`;
const normalizePluginVersion = (version: string) => version.trim().replace(/^v/i, '');
const formatPluginVersion = (version: string) => {
  const trimmed = version.trim();
  if (!trimmed) return '';
  return /^v/i.test(trimmed) ? trimmed : `v${trimmed}`;
};
const pluginVersionMatches = (left: string, right: string) =>
  normalizePluginVersion(left) === normalizePluginVersion(right);
const formatInstallType = (installType: string) =>
  installType
    .trim()
    .split('-')
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
const releaseVersionsCache = new Map<string, PluginReleaseVersion[]>();

const formatReleaseDate = (value: string, locale: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

interface PluginInstallOptionsModalProps {
  entry: PluginStoreEntry | null;
  isUpdate: boolean;
  version: string;
  installing: boolean;
  onVersionChange: (version: string) => void;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

function PluginInstallOptionsModal({
  entry,
  isUpdate,
  version,
  installing,
  onVersionChange,
  onClose,
  onConfirm,
}: PluginInstallOptionsModalProps) {
  const { i18n, t } = useTranslation();
  const [versionMode, setVersionMode] = useState<InstallVersionMode>('latest');
  const [showPrerelease, setShowPrerelease] = useState(false);
  const [releaseVersions, setReleaseVersions] = useState<PluginReleaseVersion[]>([]);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseError, setReleaseError] = useState('');
  const [loadedReleaseKey, setLoadedReleaseKey] = useState('');

  const entryKey = entry ? getStoreEntryKey(entry) : '';
  const entryRepository = entry?.repository ?? '';
  const supportsVersionSelection = entry
    ? supportsPluginVersionSelection(entry.installType)
    : false;
  const releasePageURL =
    entry && supportsVersionSelection ? buildGitHubReleasesPageURL(entry.repository) : '';
  const releaseCacheKey = entryKey
    ? `${entryKey}|${entryRepository.trim()}|${entry?.installType.trim().toLowerCase() ?? ''}`
    : '';

  if (releaseCacheKey !== loadedReleaseKey) {
    const cached = releaseCacheKey ? releaseVersionsCache.get(releaseCacheKey) : undefined;
    setLoadedReleaseKey(releaseCacheKey);
    setVersionMode('latest');
    setShowPrerelease(false);
    setReleaseVersions(cached ?? []);
    setReleaseError(
      entryKey && supportsVersionSelection && !releasePageURL
        ? t('plugin_store.install_version_non_github')
        : ''
    );
    setReleaseLoading(Boolean(entryKey && supportsVersionSelection && releasePageURL && !cached));
  }

  useEffect(() => {
    if (!entryKey || !supportsVersionSelection || !releasePageURL) return;

    if (releaseVersionsCache.has(releaseCacheKey)) return;

    let active = true;

    fetchPluginReleaseVersions(entryRepository)
      .then((releases) => {
        if (!active) return;
        releaseVersionsCache.set(releaseCacheKey, releases);
        setReleaseVersions(releases);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setReleaseError(getErrorMessage(err, t('plugin_store.install_versions_load_failed')));
      })
      .finally(() => {
        if (!active) return;
        setReleaseLoading(false);
      });

    return () => {
      active = false;
    };
  }, [entryKey, entryRepository, releaseCacheKey, releasePageURL, supportsVersionSelection, t]);

  const stableReleaseVersions = useMemo(
    () => releaseVersions.filter((release) => !release.prerelease),
    [releaseVersions]
  );
  const visibleReleaseVersions = useMemo(
    () =>
      showPrerelease ? releaseVersions : releaseVersions.filter((release) => !release.prerelease),
    [releaseVersions, showPrerelease]
  );
  const latestRelease = stableReleaseVersions[0] ?? releaseVersions[0] ?? null;
  const releaseOptions = useMemo(
    () =>
      visibleReleaseVersions.map((release) => {
        const releaseTitle =
          release.name && release.name !== release.tagName
            ? `${release.tagName} - ${release.name}`
            : release.tagName;
        const releaseDate = formatReleaseDate(release.publishedAt, i18n.language);
        const labelParts = [
          releaseTitle,
          releaseDate,
          release.prerelease ? t('plugin_store.install_version_prerelease_badge') : '',
          release.assetNames.length > 0
            ? t('plugin_store.install_version_assets_count', {
                count: release.assetNames.length,
              })
            : '',
        ].filter(Boolean);
        return {
          value: release.tagName,
          label: labelParts.join(' · '),
        };
      }),
    [i18n.language, t, visibleReleaseVersions]
  );

  useEffect(() => {
    if (!supportsVersionSelection || versionMode !== 'release') return;
    if (visibleReleaseVersions.length === 0) {
      if (version) onVersionChange('');
      return;
    }
    if (visibleReleaseVersions.some((release) => release.tagName === version)) return;
    onVersionChange(visibleReleaseVersions[0].tagName);
  }, [onVersionChange, supportsVersionSelection, version, versionMode, visibleReleaseVersions]);

  if (!entry) return null;

  const title = isUpdate
    ? t('plugin_store.update_confirm_title')
    : t('plugin_store.install_confirm_title');
  const requestedVersion =
    !supportsVersionSelection || versionMode === 'latest' ? '' : version.trim();
  const displayVersion = requestedVersion || entry.version;
  const target = displayVersion
    ? `${getStoreEntryTitle(entry)} ${formatPluginVersion(displayVersion)}`
    : getStoreEntryTitle(entry);
  const message = isUpdate
    ? t('plugin_store.update_confirm_message', { target })
    : t('plugin_store.install_confirm_message', { target });
  const latestVersionLabel = entry.version
    ? formatPluginVersion(entry.version)
    : latestRelease
      ? formatPluginVersion(latestRelease.tagName)
      : t('plugin_store.install_version_latest');
  const hasPrereleaseVersions = releaseVersions.some((release) => release.prerelease);
  const releaseModeDisabled = installing || (releaseLoading && releaseVersions.length === 0);
  const manualVersionInvalid =
    supportsVersionSelection &&
    versionMode === 'manual' &&
    Boolean(version.trim()) &&
    !isValidManualReleaseTag(version);
  const currentVersionSelected =
    Boolean(requestedVersion) &&
    Boolean(entry.installedVersion) &&
    pluginVersionMatches(entry.installedVersion, requestedVersion);
  const confirmDisabled =
    (supportsVersionSelection && versionMode === 'release' && !requestedVersion) ||
    (supportsVersionSelection && versionMode === 'manual' && !isValidManualReleaseTag(version)) ||
    currentVersionSelected;

  const handleVersionModeChange = (nextMode: InstallVersionMode) => {
    if (installing) return;
    if (!supportsVersionSelection && nextMode !== 'latest') return;
    setVersionMode(nextMode);
    if (nextMode === 'latest') {
      onVersionChange('');
      return;
    }
    if (nextMode === 'release') {
      onVersionChange(visibleReleaseVersions[0]?.tagName ?? '');
      return;
    }
    onVersionChange('');
  };

  const handleClose = () => {
    if (installing) return;
    onClose();
  };

  const versionModes: Array<{
    mode: InstallVersionMode;
    title: string;
    hint: string;
    disabled: boolean;
  }> = [
    {
      mode: 'latest',
      title: t('plugin_store.install_version_latest_mode'),
      hint: t('plugin_store.install_version_latest_hint', { version: latestVersionLabel }),
      disabled: installing,
    },
    ...(supportsVersionSelection
      ? [
          {
            mode: 'release' as const,
            title: t('plugin_store.install_version_release_mode'),
            hint: releaseLoading
              ? t('plugin_store.install_versions_loading')
              : t('plugin_store.install_version_release_hint'),
            disabled: releaseModeDisabled,
          },
          {
            mode: 'manual' as const,
            title: t('plugin_store.install_version_manual_mode'),
            hint: t('plugin_store.install_version_manual_hint'),
            disabled: installing,
          },
        ]
      : []),
  ];

  return (
    <Dialog
      open={Boolean(entry)}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-lg"
        showCloseButton={!installing}
        onEscapeKeyDown={(event) => installing && event.preventDefault()}
        onInteractOutside={(event) => installing && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <FieldSet>
          <FieldLegend variant="label" id="plugin-store-install-version-mode">
            {t('plugin_store.install_version_label')}
          </FieldLegend>
          <RadioGroup
            value={versionMode}
            onValueChange={(next) => handleVersionModeChange(next as InstallVersionMode)}
            aria-labelledby="plugin-store-install-version-mode"
          >
            {versionModes.map((item) => (
              <FieldLabel
                key={item.mode}
                htmlFor={`plugin-store-install-version-${item.mode}`}
                className={cn(item.disabled && 'pointer-events-none opacity-50')}
              >
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>{item.title}</FieldTitle>
                    <FieldDescription>{item.hint}</FieldDescription>
                  </FieldContent>
                  <RadioGroupItem
                    id={`plugin-store-install-version-${item.mode}`}
                    value={item.mode}
                    disabled={item.disabled}
                  />
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>

          {supportsVersionSelection && versionMode === 'release' ? (
            <Field>
              {releaseError ? (
                <FieldError>
                  {t('plugin_store.install_versions_load_failed')}: {releaseError}
                </FieldError>
              ) : null}
              {!releaseLoading && !releaseError && releaseVersions.length === 0 ? (
                <FieldDescription>{t('plugin_store.install_versions_empty')}</FieldDescription>
              ) : null}
              {!releaseLoading &&
              !releaseError &&
              releaseVersions.length > 0 &&
              visibleReleaseVersions.length === 0 ? (
                <FieldDescription>
                  {t('plugin_store.install_versions_only_prerelease')}
                </FieldDescription>
              ) : null}
              <Select
                value={version}
                onValueChange={onVersionChange}
                disabled={installing || releaseLoading || releaseOptions.length === 0}
              >
                <SelectTrigger
                  aria-label={t('plugin_store.install_version_release_select')}
                  className="w-full data-[size=default]:h-9"
                >
                  <SelectValue
                    placeholder={t('plugin_store.install_version_release_placeholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {releaseOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasPrereleaseVersions ? (
                <Field orientation="horizontal">
                  <Checkbox
                    id="plugin-store-show-prerelease"
                    checked={showPrerelease}
                    onCheckedChange={(checked) => setShowPrerelease(checked === true)}
                    disabled={installing}
                  />
                  <FieldLabel htmlFor="plugin-store-show-prerelease" className="font-normal">
                    {t('plugin_store.install_version_show_prerelease')}
                  </FieldLabel>
                </Field>
              ) : null}
            </Field>
          ) : null}

          {supportsVersionSelection && versionMode === 'manual' ? (
            <Field data-invalid={manualVersionInvalid || undefined}>
              <Input
                id="plugin-store-install-version"
                className="h-9 font-mono"
                value={version}
                onChange={(event) => onVersionChange(event.target.value)}
                placeholder={t('plugin_store.install_version_manual_placeholder')}
                disabled={installing}
                autoComplete="off"
                spellCheck={false}
                aria-label={t('plugin_store.install_version_manual_mode')}
                aria-invalid={manualVersionInvalid}
              />
              {manualVersionInvalid ? (
                <FieldError>{t('plugin_store.install_version_manual_error')}</FieldError>
              ) : null}
            </Field>
          ) : null}

          {currentVersionSelected ? (
            <FieldError>
              {t('plugin_store.install_version_current_selected', {
                version: formatPluginVersion(entry.installedVersion),
              })}
            </FieldError>
          ) : null}

          {supportsVersionSelection && releasePageURL ? (
            <a
              className="inline-flex w-fit items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              href={releasePageURL}
              target="_blank"
              rel="noreferrer"
            >
              {t('plugin_store.install_version_releases_link')}
              <HugeiconsIcon icon={LinkSquare02Icon} className="size-3.5" strokeWidth={1.75} />
            </a>
          ) : null}
        </FieldSet>
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={handleClose} disabled={installing}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={isOfficialPlugin(entry) ? 'default' : 'destructive'}
            size="lg"
            onClick={onConfirm}
            disabled={confirmDisabled || installing}
          >
            {isUpdate ? t('plugin_store.update') : t('plugin_store.install')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PluginStorePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const clearConfigCache = useConfigStore((state) => state.clearCache);
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [data, setData] = useState<PluginStoreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<StoreLoadError | null>(null);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StoreStatusFilter>('all');
  const [installingKey, setInstallingKey] = useState('');
  const [restartRequiredKeys, setRestartRequiredKeys] = useState<string[]>([]);
  const [expandedDescriptionKeys, setExpandedDescriptionKeys] = useState<string[]>([]);
  const [overflowingDescriptionKeys, setOverflowingDescriptionKeys] = useState<string[]>([]);
  const descriptionRefs = useRef<Record<string, HTMLParagraphElement | null>>({});

  // Multi-step install gauntlet, shown only for non-official (third-party) plugins.
  const [gateOpen, setGateOpen] = useState(false);
  const [gateEntry, setGateEntry] = useState<PluginStoreEntry | null>(null);
  const [gateIsUpdate, setGateIsUpdate] = useState(false);
  const [gateRequestedVersion, setGateRequestedVersion] = useState('');

  const [installOptionsEntry, setInstallOptionsEntry] = useState<PluginStoreEntry | null>(null);
  const [installOptionsIsUpdate, setInstallOptionsIsUpdate] = useState(false);
  const [installVersion, setInstallVersion] = useState('');

  const connected = connectionStatus === 'connected';

  const loadStore = useCallback(async () => {
    if (!connected) {
      setLoading(false);
      setError({ kind: 'generic', message: t('notification.connection_required') });
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const store = await pluginStoreApi.list();
      setData(store);
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      if (status === 404) {
        setError({ kind: 'unsupported', message: t('plugin_store.unsupported_backend') });
      } else if (status === 502) {
        const detail = getErrorDetailMessage(err);
        setError({
          kind: 'registry',
          message: detail
            ? `${t('plugin_store.registry_failed')}: ${detail}`
            : t('plugin_store.registry_failed'),
        });
      } else {
        setError({
          kind: 'generic',
          message: getErrorMessage(err, t('plugin_store.load_failed')),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [connected, t]);

  useHeaderRefresh(loadStore, connected);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

  const stats = useMemo(() => {
    const plugins = data?.plugins ?? [];
    const installed = plugins.filter((plugin) => plugin.installed).length;
    return {
      total: plugins.length,
      installed,
      notInstalled: plugins.length - installed,
      updates: plugins.filter((plugin) => plugin.installed && plugin.updateAvailable).length,
    };
  }, [data?.plugins]);

  const visiblePlugins = useMemo(() => {
    const plugins = data?.plugins ?? [];
    const byStatus = plugins.filter((plugin) => {
      if (statusFilter === 'installed') return plugin.installed;
      if (statusFilter === 'notInstalled') return !plugin.installed;
      if (statusFilter === 'updates') return plugin.installed && plugin.updateAvailable;
      return true;
    });

    const query = filter.trim().toLowerCase();
    if (!query) return byStatus;

    return byStatus.filter((plugin) => {
      const haystack = [
        plugin.id,
        plugin.name,
        plugin.description,
        plugin.author,
        plugin.repository,
        plugin.sourceName,
        plugin.sourceUrl,
        plugin.license,
        ...plugin.tags,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [data?.plugins, filter, statusFilter]);

  const statusFilters: Array<{ key: StoreStatusFilter; label: string; count: number }> = [
    { key: 'all', label: t('plugin_store.filter_all'), count: stats.total },
    { key: 'installed', label: t('plugin_store.filter_installed'), count: stats.installed },
    {
      key: 'notInstalled',
      label: t('plugin_store.filter_not_installed'),
      count: stats.notInstalled,
    },
    { key: 'updates', label: t('plugin_store.filter_updates'), count: stats.updates },
  ];

  const restartNames = restartRequiredKeys.map((key) => {
    const entry = data?.plugins.find((plugin) => getStoreEntryKey(plugin) === key);
    return entry ? getStoreEntryTitle(entry) : key;
  });

  const hasActiveFilters = Boolean(filter.trim()) || statusFilter !== 'all';

  const expandedDescriptionKeySet = useMemo(
    () => new Set(expandedDescriptionKeys),
    [expandedDescriptionKeys]
  );
  const overflowingDescriptionKeySet = useMemo(
    () => new Set(overflowingDescriptionKeys),
    [overflowingDescriptionKeys]
  );

  const registerDescriptionRef = useCallback((id: string, node: HTMLParagraphElement | null) => {
    if (node) {
      descriptionRefs.current[id] = node;
    } else {
      delete descriptionRefs.current[id];
    }
  }, []);

  const measureDescriptionOverflow = useCallback(() => {
    const nextIDs = Object.entries(descriptionRefs.current)
      .filter(([, node]) => {
        if (!node) return false;
        const computed = window.getComputedStyle(node);
        const lineHeight = Number.parseFloat(computed.lineHeight);
        if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
          return node.scrollHeight > node.clientHeight + 1;
        }
        return node.scrollHeight > lineHeight * DESCRIPTION_COLLAPSED_LINES + 1;
      })
      .map(([id]) => id);

    setOverflowingDescriptionKeys((current) => {
      if (current.length === nextIDs.length && current.every((id) => nextIDs.includes(id))) {
        return current;
      }
      return nextIDs;
    });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(measureDescriptionOverflow);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [measureDescriptionOverflow, visiblePlugins]);

  useEffect(() => {
    const handleResize = () => {
      window.requestAnimationFrame(measureDescriptionOverflow);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [measureDescriptionOverflow]);

  const toggleDescription = useCallback((id: string) => {
    setExpandedDescriptionKeys((current) =>
      current.includes(id) ? current.filter((currentID) => currentID !== id) : [...current, id]
    );
  }, []);

  const runInstall = useCallback(
    async (entry: PluginStoreEntry, isUpdate: boolean, requestedVersion = '') => {
      const entryKey = getStoreEntryKey(entry);
      const failedKey = isUpdate ? 'plugin_store.update_failed' : 'plugin_store.install_failed';
      const version = requestedVersion.trim();
      setInstallingKey(entryKey);
      try {
        const result = await pluginStoreApi.install(entry.id, {
          sourceId: entry.sourceId || undefined,
          version: version || undefined,
        });
        clearConfigCache();
        const sourceId = result.sourceId || entry.sourceId;
        const installedState = await waitForPluginStoreState(
          entry.id,
          sourceId,
          (plugin) =>
            plugin.installed &&
            plugin.configured &&
            (!version || pluginVersionMatches(plugin.installedVersion, version))
        );
        setData(installedState.response);
        if (
          installedState.timedOut ||
          !installedState.plugin?.installed ||
          !installedState.plugin.configured
        ) {
          showNotification(t('plugin_store.status_pending'), 'warning');
          return;
        }

        if (result.restartRequired) {
          setRestartRequiredKeys((current) =>
            current.includes(entryKey) ? current : [...current, entryKey]
          );
          showNotification(
            isUpdate ? t('plugin_store.update_success') : t('plugin_store.install_success'),
            'success'
          );
          showNotification(t('plugin_store.restart_required_notice'), 'warning');
          return;
        }

        if (!installedState.response.pluginsEnabled) {
          showNotification(
            isUpdate ? t('plugin_store.update_success') : t('plugin_store.install_success'),
            'success'
          );
          showNotification(t('plugin_store.global_disabled_hint'), 'warning');
          return;
        }

        if (installedState.plugin.enabled) {
          const registeredState = await waitForPluginStoreState(
            entry.id,
            sourceId,
            (plugin) => plugin.registered && plugin.effectiveEnabled
          );
          setData(registeredState.response);
          if (
            registeredState.timedOut ||
            !registeredState.plugin?.registered ||
            !registeredState.plugin.effectiveEnabled
          ) {
            showNotification(t('plugin_store.registration_pending'), 'warning');
            return;
          }
          notifyPluginResourcesChanged();
        }

        showNotification(
          isUpdate ? t('plugin_store.update_success') : t('plugin_store.install_success'),
          'success'
        );
      } catch (err: unknown) {
        showNotification(`${t(failedKey)}: ${getErrorMessage(err, t(failedKey))}`, 'error');
        throw err;
      } finally {
        setInstallingKey('');
      }
    },
    [clearConfigCache, showNotification, t]
  );

  const handleInstall = (entry: PluginStoreEntry) => {
    const isUpdate = entry.installed && entry.updateAvailable;
    setInstallOptionsEntry(entry);
    setInstallOptionsIsUpdate(isUpdate);
    setInstallVersion('');
  };

  const handleInstallOptionsClose = useCallback(() => {
    if (installingKey) return;
    setInstallOptionsEntry(null);
    setInstallVersion('');
  }, [installingKey]);

  const handleInstallOptionsConfirm = useCallback(async () => {
    if (!installOptionsEntry) return;
    const requestedVersion = installVersion.trim();

    // Third-party plugins must clear the multi-step confirmation gauntlet first.
    if (!isOfficialPlugin(installOptionsEntry)) {
      setGateEntry(installOptionsEntry);
      setGateIsUpdate(installOptionsIsUpdate);
      setGateRequestedVersion(requestedVersion);
      setGateOpen(true);
      setInstallOptionsEntry(null);
      setInstallVersion('');
      return;
    }

    try {
      await runInstall(installOptionsEntry, installOptionsIsUpdate, requestedVersion);
      setInstallOptionsEntry(null);
      setInstallVersion('');
    } catch {
      // runInstall already surfaced a notification; keep the modal available for correction.
    }
  }, [installOptionsEntry, installOptionsIsUpdate, installVersion, runInstall]);

  const handleGateConfirm = useCallback(async () => {
    if (!gateEntry) return;
    await runInstall(gateEntry, gateIsUpdate, gateRequestedVersion);
    setGateOpen(false);
    setGateRequestedVersion('');
  }, [gateEntry, gateIsUpdate, gateRequestedVersion, runInstall]);

  const handleGateClose = useCallback(() => {
    setGateOpen(false);
    setGateRequestedVersion('');
  }, []);

  const renderCard = (entry: PluginStoreEntry) => {
    const entryKey = getStoreEntryKey(entry);
    const logo = resolvePluginAssetURL(entry.logo, apiBase);
    const repositoryURL = buildRepositoryURL(entry.repository);
    const homepageURL = /^https?:\/\//i.test(entry.homepage) ? entry.homepage : '';
    const isUpdate = entry.installed && entry.updateAvailable;
    const isOfficial = isOfficialPlugin(entry);
    const versionText =
      isUpdate && entry.installedVersion && entry.version
        ? t('plugin_store.version_arrow', { from: entry.installedVersion, to: entry.version })
        : entry.installed && entry.installedVersion
          ? `v${entry.installedVersion}`
          : entry.version
            ? `v${entry.version}`
            : '';
    const sourceName = isDefaultPluginStoreSource(entry)
      ? t('plugin_store.cli_proxy_api_source')
      : entry.sourceName;
    const sourceText = sourceName ? t('plugin_store.source_name', { source: sourceName }) : '';
    const metaItems = [versionText, sourceText, entry.author, entry.license].filter(Boolean);
    const isInstalling = installingKey === entryKey;
    const hasPendingInstall = Boolean(installingKey);
    const missingAuth = entry.authRequired && !entry.authConfigured;
    const isDescriptionExpanded = expandedDescriptionKeySet.has(entryKey);
    const isDescriptionOverflowing = overflowingDescriptionKeySet.has(entryKey);
    const descriptionID = getDescriptionDOMID(entryKey);
    const installTypeText = entry.installType ? formatInstallType(entry.installType) : '';
    const platformText =
      entry.platforms.length > 0
        ? t('plugin_store.platforms', {
            platforms: entry.platforms
              .map((platform) => `${platform.goos}/${platform.goarch}`)
              .join(', '),
          })
        : '';
    const authText = entry.authRequired
      ? entry.authConfigured
        ? t('plugin_store.auth_configured')
        : t('plugin_store.auth_required')
      : '';
    const actionDisabled = !connected || missingAuth || (hasPendingInstall && !isInstalling);
    const actionTitle = missingAuth ? t('plugin_store.auth_required_hint') : undefined;

    const linkButton = (href: string, label: string, icon: typeof GithubIcon) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon" aria-label={label}>
            <a href={href} target="_blank" rel="noreferrer">
              <HugeiconsIcon icon={icon} strokeWidth={1.75} />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );

    return (
      <Item key={entryKey} variant="outline" className="items-start bg-card">
        <PluginLogo src={logo} />
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full flex-wrap">
            <span className="min-w-0 truncate">{getStoreEntryTitle(entry)}</span>
            {!isOfficial ? (
              <Badge variant="outline" className="text-warning">
                <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
                {t('plugin_store.badge_untrusted')}
              </Badge>
            ) : null}
            {isUpdate ? (
              <Badge variant="outline" className="text-primary">
                {t('plugin_store.badge_update')}
              </Badge>
            ) : entry.installed ? (
              <Badge variant="secondary" className="gap-1.5">
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    entry.effectiveEnabled ? 'bg-success' : 'bg-faint'
                  )}
                />
                {entry.effectiveEnabled
                  ? t('plugin_store.badge_effective')
                  : t('plugin_store.badge_installed')}
              </Badge>
            ) : null}
            {entry.authRequired ? (
              <Badge
                variant={entry.authConfigured ? 'secondary' : 'outline'}
                className={cn(!entry.authConfigured && 'text-warning')}
              >
                {authText}
              </Badge>
            ) : null}
          </ItemTitle>
          <span className="truncate font-mono text-xs text-faint">{entry.id}</span>
          {entry.description ? (
            <div className="flex flex-col items-start gap-0.5">
              <p
                id={descriptionID}
                ref={(node) => registerDescriptionRef(entryKey, node)}
                className={cn(
                  'text-sm leading-normal text-muted-foreground',
                  !isDescriptionExpanded && 'line-clamp-2'
                )}
              >
                {entry.description}
              </p>
              {isDescriptionOverflowing ? (
                <button
                  type="button"
                  className="text-xs text-faint transition-colors hover:text-foreground"
                  onClick={() => toggleDescription(entryKey)}
                  aria-expanded={isDescriptionExpanded}
                  aria-controls={descriptionID}
                >
                  {t(
                    isDescriptionExpanded
                      ? 'plugin_store.description_show_less'
                      : 'plugin_store.description_show_more'
                  )}
                </button>
              ) : null}
            </div>
          ) : null}
          {metaItems.length > 0 || installTypeText || platformText ? (
            <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {metaItems.map((item, index) => (
                <span
                  key={`${entryKey}-meta-${index}`}
                  className={cn(index === 0 && versionText && 'font-mono text-foreground')}
                >
                  {item}
                </span>
              ))}
              {installTypeText ? (
                <span>{t('plugin_store.install_type', { type: installTypeText })}</span>
              ) : null}
              {platformText ? <span>{platformText}</span> : null}
            </p>
          ) : null}
          {entry.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {entry.tags.map((tag) => (
                <Badge
                  key={`${entryKey}-tag-${tag}`}
                  variant="outline"
                  className="font-normal text-muted-foreground"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </ItemContent>
        <ItemActions className="gap-0.5 max-sm:w-full max-sm:justify-end">
          {repositoryURL
            ? linkButton(repositoryURL, t('plugin_store.open_repository'), GithubIcon)
            : null}
          {homepageURL
            ? linkButton(homepageURL, t('plugin_store.open_homepage'), LinkSquare02Icon)
            : null}
          {!entry.installed || entry.updateAvailable ? (
            <Button
              variant={entry.installed ? 'default' : 'outline'}
              className="ml-1.5"
              onClick={() => handleInstall(entry)}
              disabled={actionDisabled || isInstalling}
              title={actionTitle}
            >
              <HugeiconsIcon
                icon={entry.installed ? RefreshIcon : Download04Icon}
                data-icon="inline-start"
                strokeWidth={1.75}
              />
              {entry.installed ? t('plugin_store.update') : t('plugin_store.install')}
            </Button>
          ) : null}
          {entry.installed ? (
            <Button variant="outline" className="ml-1.5" onClick={() => navigate('/plugins')}>
              {t('plugin_store.manage')}
            </Button>
          ) : null}
        </ItemActions>
      </Item>
    );
  };

  return (
    <>
      <Page
        title={t('plugin_store.title')}
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
                  ? t('plugin_store.global_enabled')
                  : t('plugin_store.global_disabled')}
              </Badge>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-lg"
                  aria-label={t('plugin_store.refresh')}
                  onClick={loadStore}
                  disabled={!connected || loading}
                >
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('plugin_store.refresh')}</TooltipContent>
            </Tooltip>
          </div>
        }
      >
        <Section
          title={t('plugin_store.stat_available')}
          actions={
            data && stats.total > 0 ? (
              <Badge variant="secondary" className="tabular-nums">
                {stats.total}
              </Badge>
            ) : null
          }
        >
          <Item variant="muted" size="sm" role="note" className="items-start">
            <HugeiconsIcon
              icon={Shield01Icon}
              className="mt-0.5 size-[18px] shrink-0 text-warning"
              strokeWidth={1.75}
            />
            <ItemContent>
              <ItemTitle>{t('plugin_store.security_banner_title')}</ItemTitle>
              <ItemDescription className="line-clamp-none">
                {t('plugin_store.security_banner_text')}
              </ItemDescription>
            </ItemContent>
          </Item>

          {error ? (
            <Notice tone="error" className="flex items-center justify-between gap-3">
              <span>{error.message}</span>
              {error.kind !== 'unsupported' ? (
                <Button variant="outline" size="sm" onClick={loadStore} disabled={loading}>
                  {t('plugin_store.retry')}
                </Button>
              ) : null}
            </Notice>
          ) : null}

          {data?.sourceErrors.length ? (
            <Notice tone="warning">
              <p className="font-medium">{t('plugin_store.source_errors_title')}</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {data.sourceErrors.map((sourceError, index) => {
                  const sourceLabel =
                    sourceError.sourceName || sourceError.sourceUrl || sourceError.sourceId;
                  return (
                    <li key={`${sourceError.sourceId}-${sourceError.sourceUrl}-${index}`}>
                      <span>{sourceLabel}</span>
                      {sourceError.message ? (
                        <span className="text-warning/80">: {sourceError.message}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Notice>
          ) : null}

          {data && !data.pluginsEnabled ? (
            <Notice tone="warning">{t('plugin_store.global_disabled_hint')}</Notice>
          ) : null}

          {restartNames.length > 0 ? (
            <Notice tone="warning">
              {t('plugin_store.restart_required_banner', { plugins: restartNames.join(', ') })}
            </Notice>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="h-9 min-w-48 flex-1">
              <InputGroupAddon>
                <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('plugin_store.search_placeholder')}
                aria-label={t('plugin_store.search_label')}
              />
            </InputGroup>
            <ButtonGroup aria-label={t('plugin_store.filter_label')} className="max-sm:hidden">
              {statusFilters.map((item) => (
                <Button
                  key={item.key}
                  variant={statusFilter === item.key ? 'secondary' : 'outline'}
                  size="lg"
                  className="h-9"
                  onClick={() => setStatusFilter(item.key)}
                  aria-pressed={statusFilter === item.key}
                >
                  {item.label}
                  <span className="text-xs text-muted-foreground tabular-nums">{item.count}</span>
                </Button>
              ))}
            </ButtonGroup>
            <Select
              value={statusFilter}
              onValueChange={(next) => setStatusFilter(next as StoreStatusFilter)}
            >
              <SelectTrigger
                aria-label={t('plugin_store.filter_label')}
                className="w-full data-[size=default]:h-9 sm:hidden"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusFilters.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                    <span className="text-muted-foreground tabular-nums">{item.count}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading && !data ? (
            <ItemGroup className="gap-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Item key={index} variant="outline" aria-hidden="true">
                  <div className="size-9 rounded-lg bg-muted" />
                  <ItemContent className="gap-2">
                    <div className="h-3.5 w-40 rounded bg-muted" />
                    <div className="h-3 w-64 max-w-full rounded bg-muted/60" />
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          ) : visiblePlugins.length === 0 ? (
            !error ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={Store01Icon} strokeWidth={1.75} />
                  </EmptyMedia>
                  <EmptyTitle>
                    {stats.total === 0
                      ? t('plugin_store.no_plugins')
                      : t('plugin_store.no_matches')}
                  </EmptyTitle>
                  <EmptyDescription>
                    {stats.total === 0
                      ? t('plugin_store.no_plugins_desc')
                      : t('plugin_store.no_matches_desc')}
                  </EmptyDescription>
                </EmptyHeader>
                {stats.total > 0 && hasActiveFilters ? (
                  <EmptyContent>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFilter('');
                        setStatusFilter('all');
                      }}
                    >
                      {t('plugin_store.clear_filters')}
                    </Button>
                  </EmptyContent>
                ) : null}
              </Empty>
            ) : null
          ) : (
            <ItemGroup className="gap-2">
              {visiblePlugins.map((entry) => renderCard(entry))}
            </ItemGroup>
          )}

          {data ? (
            <p className="text-[13px] text-muted-foreground">
              {t('plugin_store.plugins_dir')}:{' '}
              <span className="font-mono text-xs text-foreground">
                {data.pluginsDir || 'plugins'}
              </span>
            </p>
          ) : null}
        </Section>
      </Page>

      <PluginInstallGateModal
        open={gateOpen}
        entry={gateEntry}
        isUpdate={gateIsUpdate}
        installing={gateEntry ? installingKey === getStoreEntryKey(gateEntry) : false}
        onClose={handleGateClose}
        onConfirm={handleGateConfirm}
      />
      <PluginInstallOptionsModal
        entry={installOptionsEntry}
        isUpdate={installOptionsIsUpdate}
        version={installVersion}
        installing={
          installOptionsEntry ? installingKey === getStoreEntryKey(installOptionsEntry) : false
        }
        onVersionChange={setInstallVersion}
        onClose={handleInstallOptionsClose}
        onConfirm={handleInstallOptionsConfirm}
      />
    </>
  );
}
