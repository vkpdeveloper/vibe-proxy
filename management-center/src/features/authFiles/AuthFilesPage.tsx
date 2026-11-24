import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckmarkSquare02Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  RefreshIcon,
  SortByDown02Icon,
  UserLock01Icon,
  Upload04Icon,
} from '@hugeicons/core-free-icons';
import { useInterval } from '@/hooks/useInterval';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Page } from '@/components/layout/Page';
import { usePhone } from '@/components/layout/pageBar';
import { copyToClipboard } from '@/utils/clipboard';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import {
  getTypeLabel,
  isProblemAuthFile,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
} from '@/features/authFiles/constants';
import { AuthFileCard } from '@/features/authFiles/components/AuthFileCard';
import { AuthFileDetailsSheet } from '@/features/authFiles/components/AuthFileDetailsSheet';
import { getAuthFileRefreshKey } from '@/features/authFiles/manualRefresh';
import { canPreferAccount, isPreferredAccount } from '@/features/authFiles/accountPreference';
import { AuthFileRefreshResults } from '@/features/authFiles/components/AuthFileRefreshResults';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { BatchActionBar } from '@/features/authFiles/components/BatchActionBar';
import { ListPagination, SearchField } from '@/features/authFiles/components/ListControls';
import { OAuthExcludedCard } from '@/features/authFiles/components/OAuthExcludedCard';
import { OAuthModelAliasCard } from '@/features/authFiles/components/OAuthModelAliasCard';
import { ProviderFilter } from '@/features/authFiles/components/ProviderFilter';
import { invalidateAuthFileDerivedCaches } from '@/features/authFiles/cacheInvalidation';
import {
  buildWildcardSearch,
  matchesAuthFileSearch,
  sortAuthFiles,
} from '@/features/authFiles/logic';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import {
  isAuthFilesStatusFilterMode,
  isAuthFilesSortMode,
  readAuthFilesUiState,
  writeAuthFilesUiState,
  type AuthFilesStatusFilterMode,
  type AuthFilesSortMode,
} from '@/features/authFiles/uiState';
import { cn } from '@/lib/utils';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { Hint } from '@/components/ui/tooltip';

const PAGE_SIZE = 50;
const SKELETON_ROW_COUNT = 4;

// Links (e.g. from Home) use ?status=problem|active|disabled and ?provider=<id>.
const STATUS_URL_VALUES = {
  problem: 'problem',
  enabled: 'active',
  disabled: 'disabled',
} satisfies Partial<Record<AuthFilesStatusFilterMode, string>>;

const statusFromUrl = (value: string | null): AuthFilesStatusFilterMode => {
  if (value === 'active') return 'enabled';
  if (value === 'problem' || value === 'disabled') return value;
  return 'all';
};

const providerFromUrl = (value: string | null) =>
  value?.trim() ? normalizeProviderKey(value) : 'all';

const filterSearchParams = (provider: string, status: AuthFilesStatusFilterMode) => {
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', STATUS_URL_VALUES[status]);
  if (provider !== 'all') params.set('provider', provider);
  return params;
};

export function AuthFilesPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const quotaDrainRouting = useConfigStore(
    (state) => state.config?.routingStrategy === 'quota-drain'
  );
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const navigate = useNavigate();
  const phone = usePhone();

  // The URL holds the provider and status filters, so a link (Home's "1 problem") and the rail's
  // plain /auth-files always show what they name.
  const [searchParams, setSearchParams] = useSearchParams();
  const normalizedFilter = providerFromUrl(searchParams.get('provider'));
  const statusFilterMode = statusFromUrl(searchParams.get('status'));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('list');
  const [sortMode, setSortMode] = useState<AuthFilesSortMode>('default');
  // Phones show selection checkboxes only in select mode; desktop always shows them.
  const [selectMode, setSelectMode] = useState(false);
  const [uiStateHydrated, setUiStateHydrated] = useState(false);

  const {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
    invalidateModels,
  } = useAuthFilesModels();

  const invalidateDerivedCaches = useCallback(
    (names?: string[]) => invalidateAuthFileDerivedCaches(invalidateModels, names),
    [invalidateModels]
  );

  const {
    files,
    selectedFiles,
    selectionCount,
    loading,
    refreshing,
    error,
    uploading,
    deleting,
    deletingAll,
    statusUpdating,
    manualRefreshing,
    preferringAccount,
    handlePreferAccount,
    refreshingAllCredentials,
    refreshResults,
    closeRefreshResults,
    handleRefreshAllCredentials,
    cooldownResetting,
    batchStatusUpdating,
    fileInputRef,
    loadFiles,
    handleUploadClick,
    handleFileChange,
    handleDelete,
    handleDeleteAll,
    handleManualRefresh,
    handleCooldownReset,
    handleStatusToggle,
    toggleSelect,
    selectAllVisible,
    invertVisibleSelection,
    deselectAll,
    batchDownload,
    batchSetStatus,
    batchDelete,
  } = useAuthFilesData({ onFilesMutated: invalidateDerivedCaches });

  const {
    excluded,
    excludedError,
    modelAlias,
    modelAliasError,
    allProviderModels,
    loadExcluded,
    loadModelAlias,
    deleteExcluded,
    deleteModelAlias,
    handleMappingUpdate,
    handleDeleteLink,
    handleToggleFork,
    handleRenameAlias,
    handleDeleteAlias,
  } = useAuthFilesOauth({ viewMode, files });

  const {
    prefixProxyEditor,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  } = useAuthFilesPrefixProxyEditor({
    disableControls: connectionStatus !== 'connected' || refreshingAllCredentials,
    loadFiles,
    onFilesMutated: invalidateDerivedCaches,
  });

  const disableControls = connectionStatus !== 'connected' || refreshingAllCredentials;
  const problemOnly = statusFilterMode === 'problem';
  const disabledOnly = statusFilterMode === 'disabled';
  const enabledOnly = statusFilterMode === 'enabled';

  /* ---------- uiState 水合与持久化 ---------- */

  // Search, page and sort are remembered; the filters live in the URL.
  useEffect(() => {
    const persisted = readAuthFilesUiState();
    if (persisted) {
      if (typeof persisted.search === 'string') {
        setSearch(persisted.search);
      }
      if (typeof persisted.page === 'number' && Number.isFinite(persisted.page)) {
        setPage(Math.max(1, Math.round(persisted.page)));
      }
      if (isAuthFilesSortMode(persisted.sortMode)) {
        setSortMode(persisted.sortMode);
      }
    }

    setUiStateHydrated(true);
  }, []);

  useEffect(() => {
    if (!uiStateHydrated) return;
    writeAuthFilesUiState({ search, page, sortMode });
  }, [page, search, sortMode, uiStateHydrated]);

  // Replace, so filter changes don't pile up in history. Calls made in one event all start from
  // the same URL and don't combine, so a caller names every filter it changes.
  const pickFilters = useCallback(
    (next: { filter?: string; statusFilterMode?: AuthFilesStatusFilterMode }) => {
      setSearchParams(
        (current) =>
          filterSearchParams(
            next.filter ?? providerFromUrl(current.get('provider')),
            next.statusFilterMode ?? statusFromUrl(current.get('status'))
          ),
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Any filter change, from this page or a link, starts at the first page. Skips the mount so a
  // remembered page survives a reload.
  const filterKey = `${normalizedFilter}|${statusFilterMode}`;
  const filterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (filterKeyRef.current === filterKey) return;
    filterKeyRef.current = filterKey;
    setPage(1);
  }, [filterKey]);

  const handleSortModeChange = useCallback(
    (value: string) => {
      if (!isAuthFilesSortMode(value) || value === sortMode) return;
      setSortMode(value);
      setPage(1);
    },
    [sortMode]
  );

  /* ---------- 数据加载：首载前台（骨架屏），此后一律后台（不清空网格） ---------- */

  const initialLoadDoneRef = useRef(false);

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([loadFiles({ background: true }), loadExcluded(), loadModelAlias()]);
  }, [loadFiles, loadExcluded, loadModelAlias]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    if (!isCurrentLayer) return;
    void loadFiles(initialLoadDoneRef.current ? { background: true } : undefined);
    initialLoadDoneRef.current = true;
    loadExcluded();
    loadModelAlias();
  }, [isCurrentLayer, loadFiles, loadExcluded, loadModelAlias]);

  useInterval(
    () => {
      void loadFiles({ background: true }).catch(() => {});
    },
    isCurrentLayer ? 240_000 : null
  );

  /* ---------- 过滤 / 排序 / 分页 memos ---------- */

  const existingTypes = useMemo(() => {
    const types = new Set<string>(['all']);
    files.forEach((file) => {
      const type = normalizeProviderKey(String(file.type ?? file.provider ?? ''));
      if (type) types.add(type);
    });
    return Array.from(types);
  }, [files]);

  const filesMatchingStatusFilters = useMemo(
    () =>
      files.filter((file) => {
        if (enabledOnly && file.disabled === true) return false;
        if (disabledOnly && file.disabled !== true) return false;
        if (problemOnly && !isProblemAuthFile(file)) return false;
        return true;
      }),
    [disabledOnly, enabledOnly, files, problemOnly]
  );

  const statusFilterOptions = useMemo(
    () =>
      [
        { value: 'all', label: t('auth_files.problem_filter_all') },
        { value: 'enabled', label: t('auth_files.problem_filter_enabled') },
        { value: 'disabled', label: t('auth_files.problem_filter_disabled') },
        { value: 'problem', label: t('auth_files.problem_filter_problem') },
      ] satisfies Array<{ value: AuthFilesStatusFilterMode; label: string }>,
    [t]
  );

  const sortOptions = useMemo(
    () => [
      { value: 'default', label: t('auth_files.sort_default') },
      { value: 'az', label: t('auth_files.sort_az') },
      { value: 'priority', label: t('auth_files.sort_priority') },
    ],
    [t]
  );

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: filesMatchingStatusFilters.length };
    filesMatchingStatusFilters.forEach((file) => {
      const type = normalizeProviderKey(String(file.type ?? file.provider ?? ''));
      if (!type) return;
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [filesMatchingStatusFilters]);

  const normalizedSearch = search.trim();
  const wildcardSearch = useMemo(() => buildWildcardSearch(normalizedSearch), [normalizedSearch]);

  const filtered = useMemo(
    () =>
      filesMatchingStatusFilters.filter((item) => {
        const type = normalizeProviderKey(String(item.type ?? item.provider ?? ''));
        const matchType = normalizedFilter === 'all' || type === normalizedFilter;
        return matchType && matchesAuthFileSearch(item, normalizedSearch, wildcardSearch);
      }),
    [filesMatchingStatusFilters, normalizedFilter, normalizedSearch, wildcardSearch]
  );

  const sorted = useMemo(() => sortAuthFiles(filtered, sortMode), [filtered, sortMode]);

  // What each status tab would show with the current provider and search.
  const statusCounts = useMemo(() => {
    const counts: Record<AuthFilesStatusFilterMode, number> = {
      all: 0,
      enabled: 0,
      disabled: 0,
      problem: 0,
    };
    files.forEach((file) => {
      const type = normalizeProviderKey(String(file.type ?? file.provider ?? ''));
      if (normalizedFilter !== 'all' && type !== normalizedFilter) return;
      if (!matchesAuthFileSearch(file, normalizedSearch, wildcardSearch)) return;
      counts.all += 1;
      counts[file.disabled === true ? 'disabled' : 'enabled'] += 1;
      if (isProblemAuthFile(file)) counts.problem += 1;
    });
    return counts;
  }, [files, normalizedFilter, normalizedSearch, wildcardSearch]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = useMemo(() => sorted.slice(start, start + PAGE_SIZE), [sorted, start]);
  const selectablePageItems = useMemo(
    () => pageItems.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [pageItems]
  );
  const selectableFilteredItems = useMemo(
    () => sorted.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [sorted]
  );
  const selectedNames = useMemo(() => Array.from(selectedFiles), [selectedFiles]);
  const selectedHasStatusUpdating = useMemo(
    () =>
      files.some(
        (file) =>
          selectedFiles.has(file.name) && statusUpdating[getAuthFileRefreshKey(file)] === true
      ),
    [files, selectedFiles, statusUpdating]
  );
  const batchStatusButtonsDisabled =
    disableControls ||
    selectedNames.length === 0 ||
    batchStatusUpdating ||
    selectedHasStatusUpdating;

  /* ---------- 头部遥测计数 ---------- */

  // Counted like Home: a problem account is not active.
  const problemCount = useMemo(() => files.filter(isProblemAuthFile).length, [files]);
  const activeCount = useMemo(
    () => files.filter((file) => file.disabled !== true).length - problemCount,
    [files, problemCount]
  );

  /* ---------- 杂项 ---------- */

  const copyTextWithNotification = useCallback(
    async (text: string) => {
      const copied = await copyToClipboard(text);
      showNotification(
        copied
          ? t('notification.link_copied', { defaultValue: 'Copied to clipboard' })
          : t('notification.copy_failed', { defaultValue: 'Copy failed' }),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const openExcludedEditor = useCallback(
    (provider?: string) => {
      const providerValue = (
        provider || (normalizedFilter !== 'all' ? normalizedFilter : '')
      ).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-excluded${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [navigate, normalizedFilter]
  );

  const openModelAliasEditor = useCallback(
    (provider?: string) => {
      const providerValue = (
        provider || (normalizedFilter !== 'all' ? normalizedFilter : '')
      ).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-model-alias${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [navigate, normalizedFilter]
  );

  const clearFilters = useCallback(() => {
    pickFilters({ filter: 'all', statusFilterMode: 'all' });
    setSearch('');
    setPage(1);
  }, [pickFilters]);

  const deleteAllButtonLabel = (() => {
    if (enabledOnly || disabledOnly) {
      return t('auth_files.delete_filtered_result_button');
    }
    if (problemOnly) {
      return normalizedFilter === 'all'
        ? t('auth_files.delete_problem_button')
        : t('auth_files.delete_problem_button_with_type', {
            type: getTypeLabel(t, normalizedFilter),
          });
    }
    return normalizedFilter === 'all'
      ? t('auth_files.delete_all_button')
      : `${t('common.delete')} ${getTypeLabel(t, normalizedFilter)}`;
  })();

  const deleteAll = () =>
    handleDeleteAll({
      filter: normalizedFilter,
      problemOnly,
      disabledOnly,
      enabledOnly,
      // The URL updates once per event, so each reset clears both filters: whichever one was
      // set, the other is already "all".
      onResetFilterToAll: () => pickFilters({ filter: 'all', statusFilterMode: 'all' }),
      onResetProblemOnly: () => pickFilters({ filter: 'all', statusFilterMode: 'all' }),
      onResetDisabledOnly: () => pickFilters({ filter: 'all', statusFilterMode: 'all' }),
      onResetEnabledOnly: () => pickFilters({ filter: 'all', statusFilterMode: 'all' }),
    });

  // Selection only covers what the list shows, so changing the filters or leaving the page
  // clears it rather than leaving hidden accounts selected under the batch bar.
  useEffect(() => {
    deselectAll();
  }, [deselectAll, normalizedFilter, normalizedSearch, statusFilterMode]);
  useEffect(() => {
    if (isCurrentLayer) return;
    deselectAll();
    setSelectMode(false);
  }, [deselectAll, isCurrentLayer]);

  const listFiltered = statusFilterMode !== 'all' || normalizedFilter !== 'all';
  const selecting = selectMode || selectionCount > 0;
  const toggleSelectMode = () => {
    if (selecting) deselectAll();
    setSelectMode(!selecting);
  };
  const refreshAllDisabled =
    disableControls ||
    loading ||
    refreshingAllCredentials ||
    Object.keys(manualRefreshing).length > 0;

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const changeProvider = (type: string) => pickFilters({ filter: type });
  const changeStatusFilter = (value: string) => {
    if (isAuthFilesStatusFilterMode(value)) pickFilters({ statusFilterMode: value });
  };
  // Phones skip the provider picker with a single provider, and tabs that would show nothing new:
  // an empty tab, or one matching every credential that All already shows. Problems always
  // appear when there are any.
  const showProviderPicker = existingTypes.length > 2 || normalizedFilter !== 'all';
  const visibleStatusOptions = statusFilterOptions.filter((option) => {
    const count = statusCounts[option.value];
    if (option.value === 'all' || option.value === statusFilterMode) return true;
    if (option.value === 'problem') return count > 0;
    return count > 0 && count < statusCounts.all;
  });
  // A lone "All" tab filters nothing, so the strip drops it.
  const showStatusTabs = visibleStatusOptions.length > 1;

  const isFirstRunEmpty = !loading && files.length === 0 && !error;
  const isNoResults = !loading && files.length > 0 && pageItems.length === 0;

  return (
    <Page
      wide
      title={t('nav.auth_files')}
      actions={
        <div className="flex items-center gap-2 max-sm:gap-0">
          {/* Desktop reloads from the top bar's refresh. */}
          <Hint label={t('common.refresh')}>
            <Button
              variant="ghost"
              size="icon-lg"
              className="max-sm:size-10 sm:hidden"
              onClick={() => void handleHeaderRefresh()}
              disabled={loading || refreshing}
              aria-label={t('common.refresh')}
            >
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} />
            </Button>
          </Hint>
          <Hint label={t('auth_files.refresh_all_button')}>
            <Button
              variant="outline"
              size="lg"
              className="h-9 px-3 max-sm:hidden"
              onClick={handleRefreshAllCredentials}
              disabled={refreshAllDisabled}
              aria-label={t('auth_files.refresh_all_button')}
            >
              <HugeiconsIcon icon={UserLock01Icon} strokeWidth={1.75} data-icon="inline-start" />
              {t('auth_files.refresh_all_button')}
            </Button>
          </Hint>
          <Hint label={t('auth_files.upload_button')}>
            <Button
              size="lg"
              className="h-9 px-4 max-sm:hidden"
              onClick={handleUploadClick}
              disabled={disableControls || uploading}
              aria-label={t('auth_files.upload_button')}
            >
              <HugeiconsIcon icon={Upload04Icon} strokeWidth={1.75} data-icon="inline-start" />
              {t('auth_files.upload_button')}
            </Button>
          </Hint>
          {/* Phones fold the occasional page actions into one menu; select mode swaps it for Done. */}
          {phone && selecting ? (
            <Button variant="ghost" className="h-10 px-3 font-medium" onClick={toggleSelectMode}>
              {t('auth_files.select_done')}
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 sm:hidden"
                  aria-label={t('common.more')}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.75} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" collisionPadding={16} className="w-auto min-w-52">
                <DropdownMenuItem
                  onSelect={handleUploadClick}
                  disabled={disableControls || uploading}
                >
                  <HugeiconsIcon icon={Upload04Icon} strokeWidth={1.75} />
                  {t('auth_files.upload_button')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={handleRefreshAllCredentials}
                  disabled={refreshAllDisabled}
                >
                  <HugeiconsIcon icon={UserLock01Icon} strokeWidth={1.75} />
                  {t('auth_files.refresh_all_button')}
                </DropdownMenuItem>
                {files.length > 0 && (
                  <>
                    <DropdownMenuItem onSelect={toggleSelectMode}>
                      <HugeiconsIcon icon={CheckmarkSquare02Icon} strokeWidth={1.75} />
                      {t('auth_files.select_mode')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={deleteAll}
                      disabled={disableControls || deletingAll}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
                      {deleteAllButtonLabel}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        hidden
        onChange={handleFileChange}
      />

      <section className="flex flex-col gap-4" aria-label={t('auth_files.title_section')}>
        {phone ? (
          <div className="flex flex-col gap-2">
            {/* Search, provider and sort share one row, like Quota; sort shrinks to an icon. */}
            <div className="flex items-center gap-2">
              <SearchField
                className="h-10 min-w-0 flex-1 [&_input]:text-ellipsis"
                value={search}
                onChange={changeSearch}
                placeholder={t('auth_files.search_placeholder_short')}
                label={t('auth_files.search_label')}
                clearLabel={t('quota_management.search_clear')}
              />
              {showProviderPicker && (
                <ProviderFilter
                  types={existingTypes}
                  counts={typeCounts}
                  active={normalizedFilter}
                  onChange={changeProvider}
                  align="end"
                />
              )}
              <Select value={sortMode} onValueChange={handleSortModeChange}>
                <SelectTrigger
                  aria-label={t('auth_files.sort_label')}
                  className="size-10 justify-center p-0 data-[size=default]:h-10 *:data-[slot=select-value]:sr-only [&>svg:last-child]:hidden"
                >
                  <HugeiconsIcon
                    icon={SortByDown02Icon}
                    strokeWidth={1.75}
                    className={sortMode === 'default' ? undefined : 'text-primary'}
                  />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="end" collisionPadding={16}>
                  {sortOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showStatusTabs && (
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                aria-label={t('auth_files.problem_filter_label')}
                className="w-full"
                value={statusFilterMode}
                onValueChange={changeStatusFilter}
              >
                {visibleStatusOptions.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className="min-w-0 flex-1 gap-1.5 px-2"
                  >
                    {option.label}
                    <span
                      // Muted grey on the raised selected tile falls under 4.5:1, so the selected
                      // count takes a dimmed foreground instead.
                      className={cn(
                        'text-[13px]',
                        option.value === 'problem' && statusCounts.problem > 0
                          ? 'text-warning'
                          : 'text-muted-foreground in-data-[state=on]:text-foreground/70'
                      )}
                    >
                      {statusCounts[option.value]}
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              className="basis-full"
              value={search}
              onChange={changeSearch}
              placeholder={t('auth_files.search_placeholder')}
              label={t('auth_files.search_label')}
              clearLabel={t('quota_management.search_clear')}
            />
            <ProviderFilter
              types={existingTypes}
              counts={typeCounts}
              active={normalizedFilter}
              onChange={changeProvider}
            />
            <Select value={sortMode} onValueChange={handleSortModeChange}>
              <SelectTrigger
                aria-label={t('auth_files.sort_label')}
                className="data-[size=default]:h-9"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {sortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              aria-label={t('auth_files.problem_filter_label')}
              className="sm:ml-auto"
              value={statusFilterMode}
              onValueChange={changeStatusFilter}
            >
              {statusFilterOptions.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value} className="h-8 px-3">
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}

        {!loading && files.length > 0 && (
          <div className="flex min-h-8 items-center justify-between gap-3 max-sm:hidden">
            <p className="flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
              <span>{t('auth_files.meta_total', { count: files.length })}</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                {t('auth_files.meta_active', { count: activeCount })}
              </span>
              {problemCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-warning">
                  <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
                  {t('auth_files.meta_problem', { count: problemCount })}
                </span>
              )}
            </p>
            <Button
              variant="ghost"
              className="-mr-2.5 shrink-0 text-muted-foreground hover:text-destructive"
              disabled={disableControls || deletingAll}
              onClick={deleteAll}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} data-icon="inline-start" />
              {deleteAllButtonLabel}
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {loading ? (
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(min(30rem,100%),1fr))] items-start gap-3"
            aria-hidden="true"
          >
            {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
              <div key={index} className="h-28 rounded-xl border bg-card" />
            ))}
          </div>
        ) : isFirstRunEmpty ? (
          <Empty className="border border-dashed sm:border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={UserLock01Icon} strokeWidth={1.75} />
              </EmptyMedia>
              <EmptyTitle>{t('auth_files.empty_title')}</EmptyTitle>
              <EmptyDescription>{t('auth_files.empty_desc')}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center">
              <Button onClick={handleUploadClick} disabled={disableControls || uploading}>
                {t('auth_files.upload_button')}
              </Button>
              <Button variant="outline" onClick={() => navigate('/oauth')}>
                {t('auth_files.empty_oauth_link')}
              </Button>
            </EmptyContent>
          </Empty>
        ) : isNoResults && problemOnly && !normalizedSearch ? (
          // Nothing to fix is good news, not an empty search.
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t('auth_files.no_problems')}
          </p>
        ) : isNoResults ? (
          <Empty className="border border-dashed sm:border-0">
            <EmptyHeader>
              <EmptyTitle>{t('auth_files.search_empty_title')}</EmptyTitle>
              <EmptyDescription>{t('auth_files.search_empty_desc')}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={clearFilters}>
                {t('auth_files.no_results_clear')}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div
            role="list"
            className="grid grid-cols-[repeat(auto-fill,minmax(min(30rem,100%),1fr))] items-start gap-3"
          >
            {pageItems.map((file) => (
              <AuthFileCard
                key={getQuotaCacheKey(file)}
                file={file}
                selected={selectedFiles.has(file.name)}
                selecting={selecting}
                disableControls={disableControls}
                deleting={deleting}
                statusUpdating={statusUpdating}
                manualRefreshing={manualRefreshing}
                showAccountPreference={quotaDrainRouting && canPreferAccount(file)}
                accountPreferred={isPreferredAccount(file, files)}
                accountPreferenceUpdating={preferringAccount !== null}
                accountPreferenceLoading={preferringAccount === getQuotaCacheKey(file)}
                onPreferAccount={handlePreferAccount}
                cooldownResetting={cooldownResetting}
                onShowModels={showModels}
                onManualRefresh={handleManualRefresh}
                onCooldownReset={handleCooldownReset}
                onOpenPrefixProxyEditor={openPrefixProxyEditor}
                onDelete={(name) => void handleDelete(name)}
                onToggleStatus={handleStatusToggle}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}

        {!loading && sorted.length > PAGE_SIZE && (
          <ListPagination
            page={currentPage}
            totalPages={totalPages}
            count={sorted.length}
            onPage={(next) => setPage(Math.min(totalPages, Math.max(1, next)))}
          />
        )}
      </section>

      {/* The config sections cover every account, so they step aside while the list is filtered. */}
      {!listFiltered && (
        <>
          <OAuthExcludedCard
            disableControls={disableControls}
            excludedError={excludedError}
            excluded={excluded}
            onRetry={loadExcluded}
            onAdd={() => openExcludedEditor()}
            onEdit={openExcludedEditor}
            onDelete={deleteExcluded}
          />

          <OAuthModelAliasCard
            disableControls={disableControls}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onRetry={loadModelAlias}
            onAdd={() => openModelAliasEditor()}
            onEditProvider={openModelAliasEditor}
            onDeleteProvider={deleteModelAlias}
            modelAliasError={modelAliasError}
            modelAlias={modelAlias}
            allProviderModels={allProviderModels}
            onUpdate={handleMappingUpdate}
            onDeleteLink={handleDeleteLink}
            onToggleFork={handleToggleFork}
            onRenameAlias={handleRenameAlias}
            onDeleteAlias={handleDeleteAlias}
          />
        </>
      )}

      {/* Room for the floating selection toolbar so it never covers the last row. */}
      <div aria-hidden="true" className="-mt-10 h-(--auth-files-action-bar-height,0px) shrink-0" />

      <AuthFileRefreshResults results={refreshResults} onClose={closeRefreshResults} />

      <AuthFileModelsModal
        open={modelsModalOpen}
        fileType={modelsFileType}
        loading={modelsLoading}
        error={modelsError}
        models={modelsList}
        excluded={excluded}
        onClose={closeModelsModal}
        onCopyText={copyTextWithNotification}
      />

      <AuthFileDetailsSheet
        disableControls={disableControls}
        editor={prefixProxyEditor}
        file={files.find((item) => item.name === prefixProxyEditor?.fileName) ?? null}
        dirty={prefixProxyDirty}
        onClose={closePrefixProxyEditor}
        onSave={handlePrefixProxySave}
        onChange={handlePrefixProxyChange}
        onManualRefresh={handleManualRefresh}
        manualRefreshing={manualRefreshing}
      />

      <BatchActionBar
        selectionCount={selectionCount}
        selectablePageCount={selectablePageItems.length}
        selectableFilteredCount={selectableFilteredItems.length}
        disableControls={disableControls}
        batchStatusDisabled={batchStatusButtonsDisabled}
        onSelectPage={() => selectAllVisible(pageItems)}
        onSelectFiltered={() => selectAllVisible(sorted)}
        onInvertPage={() => invertVisibleSelection(pageItems)}
        onDeselectAll={deselectAll}
        onDownload={() => void batchDownload(selectedNames)}
        onEnable={() => batchSetStatus(selectedNames, true)}
        onDisable={() => batchSetStatus(selectedNames, false)}
        onDelete={() => batchDelete(selectedNames)}
      />
    </Page>
  );
}
