import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { usePhone } from '@/components/layout/pageBar';
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
  // HugeiconsIcon uses each element's `key` as its React key.
  return [
    ['image', { key: 'logo', href: logo.darkSrc ?? logo.src, x: 2, y: 2, width: 20, height: 20 }],
  ];
};

/** The providers named in the empty state's line, plus Gemini. */
const EMPTY_STATE_BRANDS: ProviderBrand[] = ['openaiCompatibility', 'claude', 'gemini'];

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

  const phone = usePhone();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Phones pick the provider from a bottom sheet (rendered once, below) instead of a dropdown.
  const newMenu = (label: string) => {
    const trigger = (
      <Button
        type="button"
        size="lg"
        className="h-9 px-4 max-sm:h-10"
        disabled={disableMutations}
        onClick={phone ? () => setPickerOpen(true) : undefined}
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} data-icon="inline-start" />
        {label}
      </Button>
    );
    if (phone) return trigger;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" collisionPadding={16} className="w-auto min-w-52">
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
  };

  // Phones put the page actions where the top bar's refresh sits, so they keep their own.
  const actions = (
    <div className="flex shrink-0 items-center gap-2">
      <Hint label={t('providersPage.header.updatedAt', { time: updatedAtLabel })}>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="max-sm:size-10 max-sm:px-0 sm:hidden"
          onClick={() => void handleRefresh()}
          disabled={workbench.isFetching}
          aria-label={t('common.refresh')}
        >
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} data-icon="inline-start" />
        </Button>
      </Hint>
      {activeGroup ? newMenu(t('providersPage.actions.new')) : null}
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
        // Wide so the empty state centres on the whole content area.
        <Page title={pageTitle} actions={actions} wide>
          {errorBanner}
          {workbench.snapshot ? (
            // Phones show it as a card; wider screens as plain text, like other empty pages.
            <Empty className="flex-none px-5 py-8 max-sm:border max-sm:border-solid max-sm:bg-card sm:py-24">
              <EmptyHeader>
                <div className="mb-2 flex gap-2 sm:hidden" aria-hidden="true">
                  {EMPTY_STATE_BRANDS.map((brand) => (
                    <ProviderLogo key={brand} brand={brand} className="size-9 rounded-lg" />
                  ))}
                </div>
                <EmptyTitle className="text-base">{t('providersPage.table.emptyTitle')}</EmptyTitle>
                <EmptyDescription>{t('providersPage.table.empty')}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>{newMenu(t('providersPage.actions.addKey'))}</EmptyContent>
            </Empty>
          ) : null}
        </Page>
      )}

      {phone && (
        <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
          <SheetContent side="bottom" className="gap-0" aria-describedby={undefined}>
            <SheetHeader className="pt-1 pr-14">
              <SheetTitle>{t('providersPage.actions.addKey')}</SheetTitle>
            </SheetHeader>
            <div className="flex min-h-0 flex-col overflow-y-auto px-2 pb-3">
              {PROVIDER_BRAND_ORDER.map((brand) => (
                <button
                  key={brand}
                  type="button"
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-medium outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                  onClick={() => {
                    setPickerOpen(false);
                    openCreate(brand);
                  }}
                >
                  <ProviderLogo brand={brand} className="size-7 rounded-md" />
                  {t(`providersPage.providerNames.${brand}`)}
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
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
