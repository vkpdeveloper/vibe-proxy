import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Add01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { Page, type Tab } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyDescription } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore, useNotificationStore } from '@/stores';
import { useProviderRecentRequests } from '@/components/providers/hooks/useProviderRecentRequests';
import {
  getOpenAIProviderRecentWindowStats,
  getProviderRecentWindowStats,
  getProviderUsageKey,
  type ProviderRecentUsageMap,
} from '@/components/providers/utils';
import type { OpenAIProviderConfig } from '@/types';
import { PROVIDER_LOGOS } from './brandLogos';
import { PROVIDER_BRAND_ORDER } from './descriptors';
import { ProviderLogo } from './components/ProviderLogo';
import { ProviderResourcePanel } from './components/ProviderResourcePanel';
import type { ProviderPanelControls } from './components/ProviderResourcePanel';
import { ProviderSheet, type ProviderSheetHandle } from './sheets/ProviderSheet';
import { useProviderWorkbench } from './useProviderWorkbench';
import {
  getProviderFilterState,
  readProvidersWorkbenchUiState,
  writeProvidersWorkbenchUiState,
  type ProviderFilterState,
  type ProvidersWorkbenchUiState,
} from './uiState';
import type { ProviderBrand, ProviderResource, ProviderSortBy, SortDir } from './types';
import { Hint } from '@/components/ui/tooltip';

/**
 * Page tabs take a Hugeicons icon, which is a list of SVG elements. A single `image` element
 * lets the tab show the provider's own logo inside that 24x24 icon box.
 */
const logoIcon = (brand: ProviderBrand): IconSvgElement => {
  const logo = PROVIDER_LOGOS[brand];
  return [['image', { href: logo.darkSrc ?? logo.src, x: 2, y: 2, width: 20, height: 20 }]];
};

type SheetMode = 'detail' | 'create' | 'edit';

interface SheetState {
  open: boolean;
  brand: ProviderBrand;
  mode: SheetMode;
  resource: ProviderResource | null;
}

const formatDateTime = (iso: string, locale?: string) => {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return iso;
  }
};

const matchesFilter = (r: ProviderResource, normalized: string): boolean => {
  if (!normalized) return true;
  const haystack = [
    r.identifier,
    r.name,
    r.authIndex,
    r.apiKeyPreview,
    r.apiKey,
    r.baseUrl,
    r.proxyUrl,
    r.prefix,
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  return haystack.some((v) => v.includes(normalized));
};

const getResourceSortName = (resource: ProviderResource): string =>
  (resource.name ?? resource.identifier ?? resource.apiKeyPreview ?? '').toLowerCase();

const getResourceRecentSuccess = (
  resource: ProviderResource,
  usageByProvider: ProviderRecentUsageMap
): number => {
  if (resource.brand === 'openaiCompatibility') {
    return getOpenAIProviderRecentWindowStats(resource.raw as OpenAIProviderConfig, usageByProvider)
      .success;
  }
  return getProviderRecentWindowStats(
    usageByProvider,
    getProviderUsageKey(resource.brand),
    resource.apiKey ?? undefined,
    resource.baseUrl ?? undefined
  ).success;
};

export function ProvidersWorkbenchPage() {
  const { t, i18n } = useTranslation();
  const connectionStatus = useAuthStore((s) => s.connectionStatus);
  const { showNotification, showConfirmation } = useNotificationStore();

  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;

  const workbench = useProviderWorkbench();
  const [uiState, setUiState] = useState<ProvidersWorkbenchUiState>(readProvidersWorkbenchUiState);
  const [sheetState, setSheetState] = useState<SheetState>({
    open: false,
    brand: 'gemini',
    mode: 'detail',
    resource: null,
  });
  const sheetRef = useRef<ProviderSheetHandle>(null);

  const connected = connectionStatus === 'connected';
  const { usageByProvider, refreshRecentRequests } = useProviderRecentRequests({
    enabled: connected,
  });

  const handleRefresh = useCallback(async () => {
    await Promise.allSettled([workbench.refetch(), refreshRecentRequests().catch(() => undefined)]);
  }, [refreshRecentRequests, workbench]);

  useHeaderRefresh(handleRefresh, isCurrentLayer);

  const disableMutations =
    connectionStatus !== 'connected' ||
    workbench.mutating ||
    workbench.isFetching ||
    workbench.isError;

  const persistUiState = useCallback(
    (updater: (prev: ProvidersWorkbenchUiState) => ProvidersWorkbenchUiState) => {
      setUiState((prev) => {
        const next = updater(prev);
        writeProvidersWorkbenchUiState(next);
        return next;
      });
    },
    []
  );

  const setActiveBrand = useCallback(
    (brand: ProviderBrand) => {
      persistUiState((prev) =>
        prev.activeBrand === brand ? prev : { ...prev, activeBrand: brand }
      );
    },
    [persistUiState]
  );

  // Only provider types with something configured get a tab; "New" adds any type.
  const groups = useMemo(
    () => (workbench.snapshot?.groups ?? []).filter((group) => group.resources.length > 0),
    [workbench.snapshot]
  );
  const activeBrand = groups.some((group) => group.id === uiState.activeBrand)
    ? uiState.activeBrand
    : (groups[0]?.id ?? uiState.activeBrand);
  const activeFilterState = getProviderFilterState(uiState, activeBrand);
  const filter = activeFilterState.filter;
  const providerSortBy = activeFilterState.sortBy;
  const providerSortDir = activeFilterState.sortDir;
  const activeGroup = groups.find((g) => g.id === activeBrand) ?? groups[0] ?? null;

  const updateActiveFilterState = useCallback(
    (patch: Partial<ProviderFilterState>) => {
      persistUiState((prev) => {
        const current = getProviderFilterState(prev, activeBrand);
        return {
          ...prev,
          filtersByBrand: {
            ...prev.filtersByBrand,
            [activeBrand]: {
              ...current,
              ...patch,
            },
          },
        };
      });
    },
    [activeBrand, persistUiState]
  );

  const filteredResources = useMemo(() => {
    if (!activeGroup) return [];
    const normalized = filter.trim().toLowerCase();
    return activeGroup.resources.filter((r) => matchesFilter(r, normalized));
  }, [activeGroup, filter]);

  const availableModels = useMemo(() => {
    if (!activeGroup) return [];
    const seen = new Set<string>();
    activeGroup.resources.forEach((r) => {
      r.models.forEach((name) => seen.add(name));
    });
    return Array.from(seen).sort();
  }, [activeGroup]);

  const selectedModels = useMemo(() => {
    if (availableModels.length === 0) return new Set<string>();
    const availableModelSet = new Set(availableModels);
    return new Set(activeFilterState.selectedModels.filter((name) => availableModelSet.has(name)));
  }, [activeFilterState.selectedModels, availableModels]);

  const visibleResources = useMemo(() => {
    let arr = filteredResources;
    if (selectedModels.size > 0) {
      arr = arr.filter((r) => r.models.some((name) => selectedModels.has(name)));
    }

    const sorted = [...arr].sort((a, b) => {
      const sortDiff =
        providerSortBy === 'name'
          ? getResourceSortName(a).localeCompare(getResourceSortName(b))
          : providerSortBy === 'priority'
            ? a.priority - b.priority
            : getResourceRecentSuccess(a, usageByProvider) -
              getResourceRecentSuccess(b, usageByProvider);
      const diff = sortDiff || a.originalIndex - b.originalIndex;
      return providerSortDir === 'asc' ? diff : -diff;
    });

    return sorted;
  }, [filteredResources, providerSortBy, providerSortDir, selectedModels, usageByProvider]);

  const toolbarControls = useMemo<ProviderPanelControls>(
    () => ({
      sortBy: providerSortBy,
      sortDir: providerSortDir,
      onSortBy: (value: ProviderSortBy) => updateActiveFilterState({ sortBy: value }),
      onSortDir: (value: SortDir) => updateActiveFilterState({ sortDir: value }),
      availableModels,
      selectedModels,
      onSelectedModelsChange: (next) =>
        updateActiveFilterState({
          selectedModels: Array.from(next).sort((a, b) => a.localeCompare(b)),
        }),
    }),
    [availableModels, providerSortBy, providerSortDir, selectedModels, updateActiveFilterState]
  );

  const tabs = useMemo<Tab<ProviderBrand>[]>(
    () =>
      groups.map((group) => ({
        id: group.id,
        label: t(`providersPage.providerNames.${group.id}`),
        icon: logoIcon(group.id),
      })),
    [groups, t]
  );

  const updatedAtLabel = workbench.snapshot
    ? formatDateTime(workbench.snapshot.fetchedAt, i18n.language)
    : t('providersPage.modelCatalog.notLoaded');
  const pageTitle = t('providersPage.header.title');
  const errorBanner = workbench.errorMessage ? (
    <p
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {workbench.errorMessage}
    </p>
  ) : null;

  // Picking a type also selects its tab, so the new resource is in view once it is saved.
  const openCreate = useCallback(
    (brand: ProviderBrand) => {
      setActiveBrand(brand);
      setSheetState({ open: true, brand, mode: 'create', resource: null });
    },
    [setActiveBrand]
  );

  const openView = useCallback((resource: ProviderResource) => {
    setSheetState({
      open: true,
      brand: resource.brand,
      mode: 'detail',
      resource,
    });
  }, []);

  const openEdit = useCallback((resource: ProviderResource) => {
    setSheetState({
      open: true,
      brand: resource.brand,
      mode: 'edit',
      resource,
    });
  }, []);

  const closeSheet = useCallback(() => {
    setSheetState((s) => ({ ...s, open: false }));
  }, []);

  const handleDelete = useCallback(
    (resource: ProviderResource) => {
      const name = resource.name ?? resource.apiKeyPreview ?? resource.identifier ?? '';
      showConfirmation({
        title: t('providersPage.delete.title'),
        message: t('providersPage.delete.confirm', { name }),
        variant: 'danger',
        confirmText: t('providersPage.actions.delete'),
        onConfirm: async () => {
          try {
            await workbench.deleteProvider(resource);
            showNotification(t('providersPage.toast.deleted'), 'success');
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            showNotification(`${t('notification.delete_failed')}: ${msg}`, 'error');
          }
        },
      });
    },
    [showConfirmation, showNotification, t, workbench]
  );

  const handleToggleDisabled = useCallback(
    async (resource: ProviderResource, disabled: boolean) => {
      try {
        await workbench.toggleDisabled(resource, disabled);
        showNotification(
          disabled ? t('providersPage.toast.disabled') : t('providersPage.toast.enabled'),
          'success'
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showNotification(`${t('providersPage.toast.toggleFailed')}: ${msg}`, 'error');
      }
    },
    [showNotification, t, workbench]
  );

  const handleCreated = useCallback(() => {
    showNotification(t('providersPage.toast.created'), 'success');
    closeSheet();
  }, [closeSheet, showNotification, t]);

  const handleUpdated = useCallback(() => {
    showNotification(t('providersPage.toast.updated'), 'success');
    closeSheet();
  }, [closeSheet, showNotification, t]);

  const selectBrand = (brand: ProviderBrand) => {
    const isSwitching = sheetState.open && sheetState.brand !== brand;
    const proceed =
      isSwitching && sheetRef.current
        ? sheetRef.current.confirmDiscardIfDirty()
        : Promise.resolve(true);
    void proceed.then((ok) => {
      if (!ok) return;
      setActiveBrand(brand);
      if (isSwitching) {
        closeSheet();
      }
    });
  };

  const newMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="lg" className="h-9 px-4" disabled={disableMutations}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} data-icon="inline-start" />
          {t('providersPage.actions.new')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-52">
        {PROVIDER_BRAND_ORDER.map((brand) => (
          <DropdownMenuItem
            key={brand}
            className="gap-2.5 py-1.5"
            onSelect={() => openCreate(brand)}
          >
            <ProviderLogo brand={brand} className="size-5" />
            {t(`providersPage.providerNames.${brand}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const refreshLabel = workbench.isFetching
    ? t('providersPage.actions.syncing')
    : t('providersPage.actions.refresh');
  const actions = (
    <div className="flex shrink-0 items-center gap-2">
      <Hint label={t('providersPage.header.updatedAt', { time: updatedAtLabel })}>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-9 px-3 sm:px-4"
          onClick={() => void handleRefresh()}
          disabled={workbench.isFetching}
          aria-label={refreshLabel}
        >
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} data-icon="inline-start" />
          <span className="max-sm:hidden">{refreshLabel}</span>
        </Button>
      </Hint>
      {activeGroup ? newMenu : null}
    </div>
  );

  if (!workbench.snapshot && workbench.isPending) {
    return (
      <Page title={pageTitle} actions={actions}>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </Page>
    );
  }

  return (
    <>
      {activeGroup ? (
        <Page
          title={pageTitle}
          actions={actions}
          tabs={tabs}
          tab={activeGroup.id}
          onTab={selectBrand}
        >
          {errorBanner}
          <ProviderResourcePanel
            group={activeGroup}
            filter={filter}
            onFilterChange={(value) => updateActiveFilterState({ filter: value })}
            filteredResources={visibleResources}
            selectedId={sheetState.open ? (sheetState.resource?.id ?? null) : null}
            disableMutations={disableMutations}
            usageByProvider={usageByProvider}
            toolbarControls={toolbarControls}
            onView={openView}
            onEdit={openEdit}
            onDelete={handleDelete}
            onToggleDisabled={handleToggleDisabled}
          />
        </Page>
      ) : (
        <Page title={pageTitle} actions={actions}>
          {errorBanner}
          {workbench.snapshot ? (
            <Empty className="rounded-xl border border-dashed py-10">
              <EmptyDescription>{t('providersPage.table.empty')}</EmptyDescription>
              <EmptyContent>{newMenu}</EmptyContent>
            </Empty>
          ) : null}
        </Page>
      )}

      <ProviderSheet
        ref={sheetRef}
        state={sheetState}
        onClose={closeSheet}
        onSwitchToEdit={() => {
          setSheetState((s) => (s.resource ? { ...s, mode: 'edit' } : s));
        }}
        workbench={workbench}
        onCreated={handleCreated}
        onUpdated={handleUpdated}
        mutationDisabled={disableMutations}
        usageByProvider={usageByProvider}
      />
    </>
  );
}
