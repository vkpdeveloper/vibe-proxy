/**
 * 额度查询页：提供商 tabs + 统一卡网格。
 *
 * 保留的行为契约（重设计不改）：
 * - 现有提供商保持点击加载；Devin 首次可见时主动查询一次，不轮询；
 * - cacheGeneration 会话隔离 + request-id 去重（见 useQuotaBatchLoader）；
 * - 文件列表变化后按 provider 剪枝额度缓存（已删文件不残留）；
 * - useHeaderRefresh 单槽位：本页唯一注册者，全局刷新 = 手机端刷新按钮 = 重取文件列表后批量拉当前页额度。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { DashboardSpeed01Icon, RefreshIcon, SortByDown02Icon } from '@hugeicons/core-free-icons';
import { authFilesApi } from '@/services/api';
import { Badge } from '@/components/ui/badge';
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
import { Page } from '@/components/layout/Page';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useInterval } from '@/hooks/useInterval';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { useAuthStore, useQuotaStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import { ListPagination, SearchField } from '@/features/authFiles/components/ListControls';
import { QuotaCard } from './components/QuotaCard';
import { ProviderFilter } from '@/features/authFiles/components/ProviderFilter';
import {
  QUOTA_PAGE_SIZE,
  QUOTA_SORT_MODES,
  QUOTA_TAB_ORDER,
  type QuotaSortMode,
  type QuotaTabId,
} from './constants';
import {
  buildTabCounts,
  canRefreshQuotaAfterList,
  classifyQuotaFiles,
  filterEntriesByTab,
  filterEntriesBySearch,
  hasStoredQuotaCapacity,
  hasStoredQuotaError,
  lowestStoredRemainingPercent,
  paginate,
  resolveXaiGrokBotWindow,
  sortQuotaEntries,
  type QuotaFileEntry,
} from './logic';
import { nextRecoveryMs } from './resetSchedule';
import { lowestRemainingPercent } from './quotaTimelineModel';
import { readSavedQuotaCard, resolveQuotaCard, startQuotaDetailsSync } from './quotaDetails';
import { QUOTA_ADAPTERS, getQuotaSetter, type QuotaCardState } from './providers';
import type { QuotaProviderType } from './providers/types';
import { useDevinQuotaAutoLoad } from './providers/devin/useDevinQuotaAutoLoad';
import { useQuotaActions } from './hooks/useQuotaActions';
import { useQuotaBatchLoader } from './hooks/useQuotaBatchLoader';
import { readQuotaUiState, writeQuotaUiState } from './uiState';

const TAB_IDS: string[] = ['all', ...QUOTA_TAB_ORDER];
const SKELETON_CARD_COUNT = 4;

/** How often the open page reloads credentials to pick up the server's quota poll. */
const QUOTA_POLL_RELOAD_MS = 60_000;

export function QuotaPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<QuotaTabId>(() => readQuotaUiState()?.tab ?? 'all');
  const [sortMode, setSortMode] = useState<QuotaSortMode>(
    () => readQuotaUiState()?.sortMode ?? 'default'
  );
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const disableControls = connectionStatus !== 'connected';
  const isPhone = useMediaQuery('(max-width: 639px)');
  const isWide = useMediaQuery('(min-width: 1280px)');

  /* ---------- 文件列表 ---------- */

  const sessionGeneration = useQuotaStore((state) => state.cacheGeneration);
  const [filesGeneration, setFilesGeneration] = useState<number | null>(null);
  const listRequestRef = useRef(0);
  // Background reloads pick up the server's quota poll without a skeleton flash.
  const loadFiles = useCallback(
    async (options?: { background?: boolean }) => {
      const background = options?.background === true;
      const requestId = ++listRequestRef.current;
      if (connectionStatus !== 'connected') {
        setFiles([]);
        setFilesGeneration(null);
        setLoading(false);
        return;
      }
      const isCurrent = () =>
        requestId === listRequestRef.current &&
        sessionGeneration === useQuotaStore.getState().cacheGeneration;
      if (!background) {
        setLoading(true);
        setError('');
      }
      try {
        const data = await authFilesApi.list();
        if (!isCurrent()) return;
        setFiles(data?.files || []);
        setFilesGeneration(sessionGeneration);
      } catch (err: unknown) {
        if (!isCurrent() || background) return;
        const message = err instanceof Error ? err.message : t('notification.refresh_failed');
        setError(message);
      } finally {
        if (isCurrent() && !background) setLoading(false);
      }
    },
    [connectionStatus, sessionGeneration, t]
  );

  useEffect(startQuotaDetailsSync, []);

  // The server polls provider quotas every few minutes; merge its newer numbers.
  useInterval(
    () => void loadFiles({ background: true }),
    disableControls ? null : QUOTA_POLL_RELOAD_MS
  );

  useEffect(() => {
    void loadFiles();
    return () => {
      listRequestRef.current += 1;
    };
  }, [loadFiles]);

  /* ---------- 额度缓存 ----------
   * 排在归类/排序之前：「最快恢复优先」要读它算排序键。 */

  const antigravityQuota = useQuotaStore((state) => state.antigravityQuota);
  const claudeQuota = useQuotaStore((state) => state.claudeQuota);
  const codexQuota = useQuotaStore((state) => state.codexQuota);
  const copilotQuota = useQuotaStore((state) => state.copilotQuota);
  const cursorQuota = useQuotaStore((state) => state.cursorQuota);
  const devinCliQuota = useQuotaStore((state) => state.devinCliQuota);
  const devinQuota = useQuotaStore((state) => state.devinQuota);
  const metaQuota = useQuotaStore((state) => state.metaQuota);
  const openCodeGoQuota = useQuotaStore((state) => state.openCodeGoQuota);
  const pluginQuota = useQuotaStore((state) => state.pluginQuota);
  const xaiQuota = useQuotaStore((state) => state.xaiQuota);

  const quotaByType = useMemo<Record<QuotaProviderType, Record<string, QuotaCardState>>>(
    () =>
      ({
        antigravity: antigravityQuota,
        claude: claudeQuota,
        codex: codexQuota,
        copilot: copilotQuota,
        cursor: cursorQuota,
        'devin-cli': devinCliQuota,
        devin: devinQuota,
        meta: metaQuota,
        'opencode-go': openCodeGoQuota,
        plugin: pluginQuota,
        xai: xaiQuota,
      }) as unknown as Record<QuotaProviderType, Record<string, QuotaCardState>>,
    [
      antigravityQuota,
      claudeQuota,
      codexQuota,
      copilotQuota,
      cursorQuota,
      devinCliQuota,
      devinQuota,
      metaQuota,
      openCodeGoQuota,
      pluginQuota,
      xaiQuota,
    ]
  );

  /* ---------- 归类 / 过滤 / 排序 / 分页 ---------- */

  // 只在「最快恢复优先」下订阅分钟时钟。默认序下不门控的话，pageItems 每分钟
  // 换一次身份，会反复空转下面那个「刷新全部」的 loading 下降沿 effect。
  const tick = useNow(sortMode === 'soonest');
  const sortNow = sortMode === 'soonest' ? tick : 0;

  const entries = useMemo(() => classifyQuotaFiles(files), [files]);
  const tabCounts = useMemo(() => buildTabCounts(entries), [entries]);
  // Providers without credentials stay out of the tab bar.
  const visibleTabs = TAB_IDS.filter((id) => id === 'all' || id === tab || tabCounts[id] > 0);
  const filteredEntries = useMemo(
    () => filterEntriesBySearch(filterEntriesByTab(entries, tab), search),
    [entries, tab, search]
  );
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  /* Saved cards and the server's quota poll are merged in by resolveQuotaCard.
     Grok Bot usage is a per-account xAI allowance collected by the backend
     over the computer-hub WebSocket. It lands on the credential's stored
     quota_capacity snapshot (`grok-bot`), so each xAI card merges in its own
     window — distinct from the Cursor-plan Grok Bot meter on cursor cards. */
  const getQuota = useCallback(
    (entry: QuotaFileEntry): QuotaCardState | undefined => {
      const state = resolveQuotaCard(
        entry.type,
        entry.file,
        quotaByType[entry.type][getQuotaCacheKey(entry.file)]
      );
      if (entry.type === 'xai' && state) {
        const grokBot = resolveXaiGrokBotWindow(entry.file);
        if (grokBot) {
          return { ...state, grokBot } as QuotaCardState;
        }
      }
      return state;
    },
    [quotaByType]
  );

  const resolveSortKey = useCallback(
    (entry: QuotaFileEntry) => {
      if (sortMode === 'soonest') return nextRecoveryMs(entry.type, getQuota(entry), sortNow);
      // Cards that were never refreshed here still show the server's stored snapshot.
      return (
        lowestRemainingPercent(entry.type, getQuota(entry)) ?? lowestStoredRemainingPercent(entry)
      );
    },
    [getQuota, sortMode, sortNow]
  );
  // 排序在分页之前：否则「最快恢复」只在当前页内成立。
  const sortedEntries = useMemo(
    () => sortQuotaEntries(filteredEntries, sortMode, resolveSortKey),
    [filteredEntries, sortMode, resolveSortKey]
  );

  const { pageItems, currentPage, totalPages } = useMemo(
    () => paginate(sortedEntries, page, QUOTA_PAGE_SIZE),
    [sortedEntries, page]
  );

  const handleTabChange = useCallback((next: string) => {
    setTab(next as QuotaTabId);
    setPage(1);
    writeQuotaUiState({ tab: next as QuotaTabId });
  }, []);

  const handleSortModeChange = useCallback((next: string) => {
    setSortMode(next as QuotaSortMode);
    setPage(1);
    writeQuotaUiState({ sortMode: next as QuotaSortMode });
  }, []);

  // Credentials whose last read failed and that have nothing loaded to show instead.
  const attentionCount = useMemo(
    () =>
      entries.filter((entry) => {
        const status = quotaByType[entry.type][getQuotaCacheKey(entry.file)]?.status;
        const loaded =
          status === 'success' ||
          readSavedQuotaCard(entry.type, entry.file) ||
          hasStoredQuotaCapacity(entry.file);
        return !loaded && (status === 'error' || hasStoredQuotaError(entry.file));
      }).length,
    [entries, quotaByType]
  );

  // 剪枝：文件列表落定后，各 provider 缓存只保留仍存在的凭证
  useEffect(() => {
    if (loading || error || filesGeneration !== sessionGeneration) return;
    const survivorsByType = new Map<QuotaProviderType, Set<string>>(
      QUOTA_TAB_ORDER.map((type) => [type, new Set<string>()])
    );
    entries.forEach((entry) => survivorsByType.get(entry.type)?.add(getQuotaCacheKey(entry.file)));

    QUOTA_TAB_ORDER.forEach((type) => {
      const survivors = survivorsByType.get(type) ?? new Set<string>();
      const setQuota = getQuotaSetter(QUOTA_ADAPTERS[type]);
      setQuota((prev) => {
        const staleKeys = Object.keys(prev).filter((name) => !survivors.has(name));
        if (staleKeys.length === 0) return prev;
        const next = { ...prev };
        staleKeys.forEach((name) => delete next[name]);
        return next;
      });
    });
  }, [entries, error, filesGeneration, loading, sessionGeneration]);

  /* ---------- 加载与操作 ---------- */

  const { batchLoading, loadQuota } = useQuotaBatchLoader();
  const { resettingQuotaName, refreshQuota, resetQuota } = useQuotaActions(disableControls);

  const pendingRefreshRef = useRef<number | null>(null);
  const prevLoadingRef = useRef(loading);

  // 刷新全部：先重取文件列表，待其落定（loading 下降沿）再批量拉当前页额度
  const handleRefreshAll = useCallback(() => {
    if (disableControls) return;
    pendingRefreshRef.current = sessionGeneration;
    return loadFiles();
  }, [disableControls, loadFiles, sessionGeneration]);
  // The top bar's refresh (desktop) does the same as the phone's page button.
  useHeaderRefresh(handleRefreshAll);

  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = loading;

    const requestedSession = pendingRefreshRef.current;
    if (requestedSession === null) return;
    if (requestedSession !== sessionGeneration) {
      pendingRefreshRef.current = null;
      return;
    }
    if (loading || !wasLoading) return;

    pendingRefreshRef.current = null;
    if (
      canRefreshQuotaAfterList(
        requestedSession,
        sessionGeneration,
        filesGeneration,
        Boolean(error),
        disableControls
      )
    ) {
      void loadQuota(pageItems);
    }
  }, [disableControls, error, filesGeneration, loading, loadQuota, pageItems, sessionGeneration]);

  useDevinQuotaAutoLoad(
    pageItems,
    disableControls ||
      loading ||
      batchLoading ||
      Boolean(error) ||
      filesGeneration !== sessionGeneration,
    loadQuota
  );

  const canUseActions = !disableControls && !loading && filesGeneration === sessionGeneration;

  /* ---------- 渲染 ---------- */

  const isEmpty = !loading && filteredEntries.length === 0;
  // Alternating keeps the sort order reading left to right, row by row.
  const columns = isWide
    ? [
        pageItems.filter((_, index) => index % 2 === 0),
        pageItems.filter((_, index) => index % 2 === 1),
      ]
    : [pageItems];

  const emptyTitle = search.trim()
    ? t('quota_management.search_empty_title')
    : tab === 'all'
      ? t('quota_management.empty_title')
      : t(`${QUOTA_ADAPTERS[tab].i18nPrefix}.empty_title`);
  const emptyDescription = search.trim()
    ? t('quota_management.search_empty_desc')
    : tab === 'all'
      ? t('quota_management.empty_desc')
      : t(`${QUOTA_ADAPTERS[tab].i18nPrefix}.empty_desc`);

  return (
    <Page
      wide
      title={t('nav_short.quota')}
      actions={
        <div className="flex items-center gap-2">
          {attentionCount > 0 && (
            <Badge variant="secondary" className="gap-1.5">
              <span className="size-1.5 rounded-full bg-warning" />
              {t('quota_management.meta_attention', { count: attentionCount })}
            </Badge>
          )}
          {isPhone && (
            <Button
              size="lg"
              variant="ghost"
              className="size-10 px-0!"
              onClick={handleRefreshAll}
              disabled={disableControls || loading || batchLoading}
              aria-label={t('common.refresh')}
            >
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} data-icon="inline-start" />
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4 max-sm:gap-3">
        {/* Phones keep search, filter and sort on one row: sort shrinks to an icon. */}
        <div className="flex flex-wrap items-center gap-2 max-sm:flex-nowrap">
          <SearchField
            className="min-w-48 flex-1 basis-full max-sm:h-10 max-sm:min-w-0 max-sm:basis-0 sm:basis-0"
            value={search}
            onChange={handleSearchChange}
            placeholder={
              isPhone
                ? t('quota_management.search_placeholder_short')
                : t('quota_management.search_placeholder')
            }
            label={t('quota_management.search_label')}
            clearLabel={t('quota_management.search_clear')}
          />
          <ProviderFilter
            types={visibleTabs}
            counts={tabCounts}
            active={tab}
            onChange={handleTabChange}
            align={isPhone ? 'end' : 'start'}
          />
          <Select value={sortMode} onValueChange={handleSortModeChange}>
            <SelectTrigger
              aria-label={t('quota_management.sort_label')}
              className="data-[size=default]:h-9 max-sm:relative max-sm:size-10 max-sm:justify-center max-sm:p-0 max-sm:data-[size=default]:h-10 max-sm:*:data-[slot=select-value]:sr-only max-sm:[&>svg:last-child]:hidden"
            >
              <HugeiconsIcon
                icon={SortByDown02Icon}
                strokeWidth={1.75}
                className={sortMode === 'default' ? 'sm:hidden' : 'text-primary sm:hidden'}
              />
              {/* On phones the label is hidden, so a dot marks a non-default sort. */}
              {sortMode !== 'default' && (
                <span
                  aria-hidden
                  className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary sm:hidden"
                />
              )}
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end" collisionPadding={16}>
              {QUOTA_SORT_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`quota_management.sort_${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {loading ? (
          <div className="grid gap-3 xl:grid-cols-2" aria-hidden="true">
            {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
              <div key={index} className="h-36 rounded-xl border bg-card" />
            ))}
          </div>
        ) : isEmpty ? (
          // Desktop empty states are plain muted text; phones keep the framed version.
          <Empty className="border border-dashed sm:border-0 sm:py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="sm:hidden">
                <HugeiconsIcon icon={DashboardSpeed01Icon} strokeWidth={1.75} />
              </EmptyMedia>
              <EmptyTitle className="sm:font-normal sm:text-muted-foreground">
                {emptyTitle}
              </EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
            {(search.trim() || tab !== 'all') && (
              <EmptyContent>
                <Button
                  variant="outline"
                  onClick={() => (search.trim() ? handleSearchChange('') : handleTabChange('all'))}
                >
                  {search.trim() ? t('quota_management.search_clear') : t('auth_files.filter_all')}
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          // Two fixed column lists rather than a grid or CSS columns: cards differ a lot in
          // height, grid rows left holes, and CSS columns moved cards between columns whenever
          // one expanded. Here an expanding card only pushes down its own column.
          <div className="flex items-start gap-3">
            {columns.map((column, columnIndex) => (
              <div key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-3">
                {column.map((entry) => (
                  <QuotaCard
                    key={`${entry.type}:${getQuotaCacheKey(entry.file)}`}
                    entry={entry}
                    quota={getQuota(entry)}
                    canRefresh={canUseActions && !entry.file.disabled}
                    resetting={resettingQuotaName === getQuotaCacheKey(entry.file)}
                    onRefresh={() => void refreshQuota(entry.file, QUOTA_ADAPTERS[entry.type])}
                    onReset={(targetId) =>
                      resetQuota(entry.file, QUOTA_ADAPTERS[entry.type], targetId)
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {!loading && filteredEntries.length > QUOTA_PAGE_SIZE && (
          <ListPagination
            page={currentPage}
            totalPages={totalPages}
            count={filteredEntries.length}
            onPage={(next) => setPage(Math.min(totalPages, Math.max(1, next)))}
          />
        )}
      </div>
    </Page>
  );
}
