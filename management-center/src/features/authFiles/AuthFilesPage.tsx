import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Delete02Icon,
  RefreshIcon,
  UserLock01Icon,
  Upload04Icon,
} from '@hugeicons/core-free-icons';
import { useInterval } from '@/hooks/useInterval';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Button } from '@/components/ui/button';
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
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';

const PAGE_SIZE = 50;
const SKELETON_ROW_COUNT = 4;

const resolveStatusFilterMode = (
  problemOnly: boolean,
  disabledOnly: boolean
): AuthFilesStatusFilterMode => {
  if (problemOnly) return 'problem';
  if (disabledOnly) return 'disabled';
  return 'all';
};

const normalizePersistedStatusFilterMode = (value: unknown): AuthFilesStatusFilterMode | null => {
  if (value === 'disabledProblem') return 'problem';
  return isAuthFilesStatusFilterMode(value) ? value : null;
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

  const [filter, setFilter] = useState<'all' | string>('all');
  const [statusFilterMode, setStatusFilterMode] = useState<AuthFilesStatusFilterMode>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('list');
  const [sortMode, setSortMode] = useState<AuthFilesSortMode>('default');
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
  const normalizedFilter = normalizeProviderKey(String(filter));
  const problemOnly = statusFilterMode === 'problem';
  const disabledOnly = statusFilterMode === 'disabled';
  const enabledOnly = statusFilterMode === 'enabled';

  /* ---------- uiState 水合与持久化（localStorage key/形状与旧版完全一致） ---------- */

  useEffect(() => {
    const persisted = readAuthFilesUiState();
    if (persisted) {
      if (typeof persisted.filter === 'string' && persisted.filter.trim()) {
        setFilter(normalizeProviderKey(persisted.filter));
      }
      const persistedStatusFilterMode = normalizePersistedStatusFilterMode(
        persisted.statusFilterMode
      );
      if (persistedStatusFilterMode) {
        setStatusFilterMode(persistedStatusFilterMode);
      } else if (
        typeof persisted.problemOnly === 'boolean' ||
        typeof persisted.disabledOnly === 'boolean'
      ) {
        setStatusFilterMode(
          resolveStatusFilterMode(persisted.problemOnly === true, persisted.disabledOnly === true)
        );
      }
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

    writeAuthFilesUiState({
      filter,
      statusFilterMode,
      problemOnly,
      disabledOnly,
      search,
      page,
      sortMode,
    });
  }, [
    disabledOnly,
    filter,
    page,
    problemOnly,
    search,
    sortMode,
    statusFilterMode,
    uiStateHydrated,
  ]);

  const handleSortModeChange = useCallback(
    (value: string) => {
      if (!isAuthFilesSortMode(value) || value === sortMode) return;
      setSortMode(value);
      setPage(1);
    },
    [sortMode]
  );

  const handleStatusFilterModeChange = useCallback((nextMode: AuthFilesStatusFilterMode) => {
    setStatusFilterMode(nextMode);
    setPage(1);
  }, []);

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

  const activeCount = useMemo(() => files.filter((file) => file.disabled !== true).length, [files]);
  const problemCount = useMemo(() => files.filter(isProblemAuthFile).length, [files]);

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
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-excluded${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  const openModelAliasEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-model-alias${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  const clearFilters = useCallback(() => {
    setFilter('all');
    setStatusFilterMode('all');
    setSearch('');
    setPage(1);
  }, []);

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

  const isFirstRunEmpty = !loading && files.length === 0 && !error;
  const isNoResults = !loading && files.length > 0 && pageItems.length === 0;

  return (
    <Page
      wide
      title={t('nav.auth_files')}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={() => void handleHeaderRefresh()}
            disabled={loading || refreshing}
            aria-label={t('common.refresh')}
            title={t('common.refresh')}
          >
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-9 px-3 max-sm:w-9 max-sm:px-0"
            onClick={handleRefreshAllCredentials}
            disabled={
              disableControls ||
              loading ||
              refreshingAllCredentials ||
              Object.keys(manualRefreshing).length > 0
            }
            aria-label={t('auth_files.refresh_all_button')}
            title={t('auth_files.refresh_all_button')}
          >
            <HugeiconsIcon icon={UserLock01Icon} strokeWidth={1.75} data-icon="inline-start" />
            <span className="max-sm:hidden">{t('auth_files.refresh_all_button')}</span>
          </Button>
          <Button
            size="lg"
            className="h-9 px-4 max-sm:w-9 max-sm:px-0"
            onClick={handleUploadClick}
            disabled={disableControls || uploading}
            aria-label={t('auth_files.upload_button')}
          >
            <HugeiconsIcon icon={Upload04Icon} strokeWidth={1.75} data-icon="inline-start" />
            <span className="max-sm:hidden">{t('auth_files.upload_button')}</span>
          </Button>
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
        <div className="flex flex-wrap items-center gap-2">
          <SearchField
            className="basis-full"
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder={t('auth_files.search_placeholder')}
            label={t('auth_files.search_label')}
            clearLabel={t('quota_management.search_clear')}
          />
          <ProviderFilter
            className="max-sm:flex-1"
            types={existingTypes}
            counts={typeCounts}
            active={normalizedFilter}
            onChange={(type) => {
              setFilter(type);
              setPage(1);
            }}
          />
          <Select value={sortMode} onValueChange={handleSortModeChange}>
            <SelectTrigger
              aria-label={t('auth_files.sort_label')}
              className="data-[size=default]:h-9 max-sm:flex-1"
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
            className="max-sm:w-full sm:ml-auto"
            value={statusFilterMode}
            onValueChange={(value) => {
              if (isAuthFilesStatusFilterMode(value)) handleStatusFilterModeChange(value);
            }}
          >
            {statusFilterOptions.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                className="h-9 px-3 max-sm:flex-1"
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {!loading && files.length > 0 && (
          <div className="flex min-h-8 items-center justify-between gap-3">
            <p className="flex flex-wrap items-center gap-x-3 font-mono text-xs text-muted-foreground tabular-nums">
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
              size="sm"
              className="-mr-2 shrink-0 text-muted-foreground hover:text-destructive"
              disabled={disableControls || deletingAll}
              onClick={() =>
                handleDeleteAll({
                  filter,
                  problemOnly,
                  disabledOnly,
                  enabledOnly,
                  onResetFilterToAll: () => setFilter('all'),
                  onResetProblemOnly: () => setStatusFilterMode('all'),
                  onResetDisabledOnly: () => setStatusFilterMode('all'),
                  onResetEnabledOnly: () => setStatusFilterMode('all'),
                })
              }
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
          <Empty className="border border-dashed">
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
        ) : isNoResults ? (
          <Empty className="border border-dashed">
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
        dirty={prefixProxyDirty}
        onClose={closePrefixProxyEditor}
        onSave={handlePrefixProxySave}
        onChange={handlePrefixProxyChange}
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
