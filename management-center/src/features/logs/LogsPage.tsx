import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowExpand01Icon,
  ArrowShrink01Icon,
  Cancel01Icon,
  Copy01Icon,
  Delete02Icon,
  Download01Icon,
  File01Icon,
  FilterHorizontalIcon,
  MoreHorizontalIcon,
  PlayIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldContent, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetHeader,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Hint } from '@/components/ui/tooltip';
import { lockScroll, unlockScroll } from '@/components/legacy/scrollLock';
import { usePhone } from '@/components/layout/pageBar';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { cn } from '@/lib/utils';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { logsApi, responseDataToText, type ErrorLogFile } from '@/services/api/logs';
import { INITIAL_VISIBLE_LINES } from './model/logBuffer';
import { useLogStream } from './hooks/useLogStream';
import { copyToClipboard } from '@/utils/clipboard';
import { getErrorMessage } from '@/utils/helpers';
import { downloadBlob } from '@/utils/download';
import {
  createLogParserCache,
  searchLogEntries,
  filterLogEntries,
  splitLogTimestamp,
  withDateDividers,
  type LogEntry,
} from '@/features/logs/model/logSelectors';
import { EmailPrivacyText } from '@/components/common/EmailPrivacyText';
import { formatDateTimeValue, formatDateValue, parseDateValue } from '@/utils/format';
import { HTTP_METHODS, STATUS_GROUPS, type LogState } from './model/logTypes';
import { createLogRequestGuard } from './model/logRequests';
import { errorLogViewerReducer } from './model/errorLogViewer';
import { shouldExitLogFullscreen } from './model/logFullscreen';
import { useLogFilters } from './hooks/useLogFilters';
import { isNearBottom, useLogScroller } from './hooks/useLogScroller';
import { CopyButton } from '@/components/ui/copy-button';
import {
  parseErrorLogName,
  logInstant,
  requestLogStatus,
  responseErrorMessage,
  responseSectionStart,
} from './model/logTime';

const INITIAL_DISPLAY_LINES = INITIAL_VISIBLE_LINES;
const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
/** Radix Select reserves the empty string, so "all levels" needs its own value. */
const ALL_LEVELS = 'all';
const OPEN_OVERLAY_SELECTOR =
  '.modal-overlay, [role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]';

type TabType = 'logs' | 'errors';

/** Bottom sheets on phone: rounded top, never taller than most of the screen. */
const SHEET_CLASS =
  'max-h-[85dvh] gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)] outline-none';

/** Keeps the rows clear of the open detail panel (448px wide) where both fit with the path. */
const PANEL_ROOM = 'xl:pr-[27rem]';

const formatSize = (size?: number) => (size ? `${(size / 1024).toFixed(1)} KB` : '');

/** Log rows: one tab stop for the whole list, arrow keys move between rows. */
const ROW_SELECTOR = '[role="button"][data-log-id]';

function siblingRow(row: Element, forward: boolean) {
  let node = forward ? row.nextElementSibling : row.previousElementSibling;
  while (node && !node.matches(ROW_SELECTOR)) {
    node = forward ? node.nextElementSibling : node.previousElementSibling;
  }
  return node;
}

/** The colored bar at the start of a row: failures first, then requests, then everything else. */
function rowTone(line: LogEntry) {
  const status = line.statusCode ?? 0;
  if (line.level === 'error' || line.level === 'fatal' || status >= 500) return 'bg-destructive';
  if (line.level === 'warn' || status >= 400) return 'bg-warning';
  if (line.method) return 'bg-primary';
  return 'bg-faint';
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const levelTone: Record<NonNullable<LogEntry['level']>, string> = {
  trace: 'text-faint',
  debug: 'text-faint',
  info: 'text-muted-foreground',
  warn: 'text-warning',
  error: 'text-destructive',
  fatal: 'text-destructive',
};

function statusTone(code: number) {
  if (code >= 500) return 'text-destructive';
  if (code >= 400) return 'text-warning';
  if (code >= 300) return 'text-muted-foreground';
  // Phone shows one request per row, so green on every success would drown out failures.
  return 'text-success max-sm:text-muted-foreground';
}

function Notice({
  tone = 'muted',
  children,
}: {
  tone?: 'muted' | 'warning' | 'error';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-center gap-2 border-b px-10 py-2 text-xs max-sm:px-4',
        tone === 'muted' && 'text-muted-foreground',
        tone === 'warning' && 'bg-warning/8 text-warning',
        tone === 'error' && 'bg-destructive/8 text-destructive'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          tone === 'muted' && 'bg-faint',
          tone === 'warning' && 'bg-warning',
          tone === 'error' && 'bg-destructive'
        )}
      />
      {children}
    </div>
  );
}

function FilterChips({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Field>
      <FieldTitle>{title}</FieldTitle>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </Field>
  );
}

function FilterChip({
  active,
  count,
  disabled,
  title,
  onToggle,
  children,
}: {
  active: boolean;
  count: number;
  disabled?: boolean;
  title?: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={active}
      onPressedChange={onToggle}
      disabled={disabled}
      title={title}
      className={cn(
        'max-w-full font-mono text-xs data-[state=on]:border-primary/60 data-[state=on]:bg-primary/12 data-[state=on]:text-foreground max-sm:h-10 max-sm:px-3 max-sm:data-[state=off]:text-foreground max-sm:data-[state=on]:border-primary max-sm:data-[state=on]:bg-primary/25',
        count === 0 && !active && 'max-sm:hidden'
      )}
    >
      <span className="truncate">{children}</span>
      <span className="font-sans text-faint group-data-[state=on]/toggle:text-muted-foreground max-sm:text-muted-foreground max-sm:group-data-[state=on]/toggle:text-foreground">
        {count}
      </span>
    </Toggle>
  );
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Field orientation="horizontal" className="relative max-sm:min-h-11 max-sm:items-center">
      <FieldContent>
        {/* On phone the label stretches over the whole row, so any tap toggles the switch. */}
        <FieldLabel htmlFor={id} className="max-sm:after:absolute max-sm:after:inset-0">
          {label}
        </FieldLabel>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  );
}

export function LogsPage() {
  const { t, i18n } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const config = useConfigStore((state) => state.config);
  const requestLogEnabled = config?.requestLog ?? false;

  const [activeTab, setActiveTab] = useState<TabType>('logs');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [hideManagementLogs, setHideManagementLogs] = useLocalStorage(
    'logsPage.hideManagementLogs',
    true
  );
  const [showRawLogs, setShowRawLogs] = useLocalStorage('logsPage.showRawLogs', false);
  const [wrapLogs, setWrapLogs] = useLocalStorage('logsPage.wrapLogs', false);
  const [showLineDetails, setShowLineDetails] = useLocalStorage('logsPage.showLineDetails', false);
  const [structuredFiltersExpanded, setStructuredFiltersExpanded] = useState(false);
  const [errorLogs, setErrorLogs] = useState<ErrorLogFile[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);
  const [errorLogsError, setErrorLogsError] = useState('');
  const [errorLogViewer, dispatchErrorLogViewer] = useReducer(errorLogViewerReducer, {
    status: 'closed',
  });
  const selectedErrorLog = errorLogViewer.status === 'closed' ? null : errorLogViewer.item;
  const viewerText = errorLogViewer.status === 'ready' ? errorLogViewer.text : '';
  const viewerStatus = useMemo(() => requestLogStatus(viewerText), [viewerText]);
  const viewerResponseAt = useMemo(() => responseSectionStart(viewerText), [viewerText]);
  const viewerErrorMessage = useMemo(() => responseErrorMessage(viewerText), [viewerText]);
  const viewerFile = selectedErrorLog && parseErrorLogName(selectedErrorLog.name);
  const viewerScrollRef = useRef<HTMLDivElement>(null);
  const viewerResponseRef = useRef<HTMLSpanElement>(null);
  const viewerBarRef = useRef<HTMLDivElement>(null);
  const [viewerAtResponse, setViewerAtResponse] = useState(false);
  // Where the viewer scrolls to put the response right under the sticky bar, clamped to
  // what it can reach when the response is short.
  const viewerResponseTop = () => {
    const container = viewerScrollRef.current;
    const target = viewerResponseRef.current;
    if (!container || !target) return null;
    const top = target.offsetTop - (viewerBarRef.current?.offsetHeight ?? 0);
    return Math.min(top, container.scrollHeight - container.clientHeight);
  };
  const [viewerRequestId, setViewerRequestId] = useState<string | null>(null);
  const [requestLogDownloading, setRequestLogDownloading] = useState(false);
  const [fullscreenLogs, setFullscreenLogs] = useState(false);
  const [detail, setDetail] = useState<LogEntry | null>(null);
  const [focusedRowId, setFocusedRowId] = useState<number | null>(null);
  // The row the detail panel showed last, for focus to return to once it closes.
  const lastDetailId = useRef<number | null>(null);
  useEffect(() => {
    if (detail) lastDetailId.current = detail.id;
  }, [detail]);
  const phone = usePhone();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [requests] = useState(() => ({
    session: createLogRequestGuard(),
    errors: createLogRequestGuard(),
    viewer: createLogRequestGuard(),
  }));

  const {
    logBuffer,
    serverOffset,
    visibleCount,
    setVisibleCount,
    lastUpdated,
    catchingUp,
    wasReset,
    loading,
    clearingLogs,
    error,
    autoRefresh,
    setAutoRefresh,
    cpaNeedsFileLogging,
    showFileLoggingRequired,
    loadLogs,
    clearLogs,
  } = useLogStream({
    active: activeTab === 'logs',
    isFollowing: () => isNearBottom(logViewerRef.current),
    onFollow: () => requestScrollToBottom(),
  });

  const disableControls = connectionStatus !== 'connected';
  const autoRefreshDisabled = disableControls || showFileLoggingRequired;
  const clearDisabled = disableControls || clearingLogs || showFileLoggingRequired;

  const downloadLogs = () => {
    const text = logBuffer.buffer.join('\n');
    downloadBlob({ filename: 'logs.txt', blob: new Blob([text], { type: 'text/plain' }) });
    showNotification(t('logs.download_success'), 'success');
  };

  const loadErrorLogs = async () => {
    if (useAuthStore.getState().connectionStatus !== 'connected') {
      setLoadingErrors(false);
      return;
    }
    const request = requests.errors.invalidate();
    setLoadingErrors(true);
    setErrorLogsError('');
    try {
      const res = await logsApi.fetchErrorLogs();
      if (!requests.errors.isCurrent(request)) return;
      // API 返回 { files: [...] }
      setErrorLogs(Array.isArray(res.files) ? res.files : []);
    } catch (err: unknown) {
      if (!requests.errors.isCurrent(request)) return;
      console.error('Failed to load error logs:', err);
      setErrorLogs([]);
      const message = getErrorMessage(err);
      setErrorLogsError(
        message ? `${t('logs.error_logs_load_error')}: ${message}` : t('logs.error_logs_load_error')
      );
    } finally {
      if (requests.errors.isCurrent(request)) setLoadingErrors(false);
    }
  };

  useHeaderRefresh(() => (activeTab === 'errors' ? loadErrorLogs() : loadLogs(false)));

  const downloadErrorLog = async (name: string) => {
    const session = requests.session.capture();
    try {
      const response = await logsApi.downloadErrorLog(name);
      if (!requests.session.isCurrent(session)) return;
      downloadBlob({ filename: name, blob: new Blob([response.data], { type: 'text/plain' }) });
      showNotification(t('logs.error_log_download_success'), 'success');
    } catch (err: unknown) {
      if (!requests.session.isCurrent(session)) return;
      const message = getErrorMessage(err);
      showNotification(
        `${t('notification.download_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    }
  };

  const openErrorLog = async (item: ErrorLogFile, byRequestId?: string) => {
    setViewerRequestId(byRequestId ?? null);
    setViewerAtResponse(false);
    const requestId = requests.viewer.invalidate();
    dispatchErrorLogViewer({ type: 'open', item });

    try {
      if (item.size && item.size > 2 * 1024 * 1024) throw new Error(t('logs.preview_too_large'));
      const response = byRequestId
        ? await logsApi.downloadRequestLogById(byRequestId)
        : await logsApi.downloadErrorLog(item.name);
      if (response.data instanceof Blob && response.data.size > 2 * 1024 * 1024) {
        throw new Error(t('logs.preview_too_large'));
      }
      const text = await responseDataToText(response.data);
      if (!requests.viewer.isCurrent(requestId)) return;
      dispatchErrorLogViewer({ type: 'ready', text });
    } catch (err: unknown) {
      if (!requests.viewer.isCurrent(requestId)) return;
      // Most requests have no saved log, so a lookup that finds none is not an error.
      if (
        byRequestId &&
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        err.status === 404
      ) {
        dispatchErrorLogViewer({ type: 'missing' });
        return;
      }
      const message = getErrorMessage(err);
      dispatchErrorLogViewer({
        type: 'error',
        message: message
          ? `${t('logs.error_log_open_failed')}: ${message}`
          : t('logs.error_log_open_failed'),
      });
    }
  };

  const closeErrorLogViewer = () => {
    requests.viewer.invalidate();
    dispatchErrorLogViewer({ type: 'close' });
  };

  const copySelectedErrorLog = async () => {
    if (errorLogViewer.status !== 'ready' || !errorLogViewer.text) return;
    const session = requests.session.capture();
    const ok = await copyToClipboard(errorLogViewer.text);
    if (!requests.session.isCurrent(session)) return;
    showNotification(
      ok
        ? t('logs.error_log_copy_success')
        : t('logs.copy_failed', { defaultValue: 'Copy failed' }),
      ok ? 'success' : 'error'
    );
  };

  useEffect(() => {
    const resetErrors = () => {
      requests.errors.invalidate();
      setErrorLogs([]);
      setLoadingErrors(false);
      setErrorLogsError('');
    };
    const invalidateSession = () => {
      requests.session.invalidate();
      requests.errors.invalidate();
      requests.viewer.invalidate();
    };

    // Store subscriptions invalidate synchronously, before a response can beat effect cleanup.
    const unsubscribeAuth = useAuthStore.subscribe((next, previous) => {
      if (
        next.apiBase === previous.apiBase &&
        next.managementKey === previous.managementKey &&
        next.connectionStatus === previous.connectionStatus &&
        next.isAuthenticated === previous.isAuthenticated
      )
        return;
      invalidateSession();
      resetErrors();
      dispatchErrorLogViewer({ type: 'close' });
      setViewerRequestId(null);
      setRequestLogDownloading(false);
    });
    const unsubscribeConfig = useConfigStore.subscribe((next, previous) => {
      if (next.config?.requestLog !== previous.config?.requestLog) resetErrors();
    });
    return () => {
      unsubscribeAuth();
      unsubscribeConfig();
      invalidateSession();
    };
  }, [requests]);

  useEffect(() => {
    if (activeTab !== 'errors') return;
    if (connectionStatus !== 'connected') return;
    void loadErrorLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, connectionStatus, apiBase, managementKey, requestLogEnabled]);

  const [parseEntries] = useState(createLogParserCache);
  const entries = useMemo(() => parseEntries(logBuffer), [logBuffer, parseEntries]);
  const [levelFilter, setLevelFilter] = useState('');
  const trimmedSearchQuery = deferredSearchQuery.trim();
  const isSearching = trimmedSearchQuery.length > 0;
  const parsedSearchLines = useMemo(
    () => searchLogEntries(entries, trimmedSearchQuery, hideManagementLogs),
    [entries, trimmedSearchQuery, hideManagementLogs]
  );

  const filters = useLogFilters({ parsedLines: parsedSearchLines });
  const structuredFiltersPanelId = 'logs-structured-filters';
  const structuredFilterCount =
    filters.methodFilters.length + filters.statusFilters.length + filters.pathFilters.length;
  const phoneFilterCount = structuredFilterCount + (levelFilter ? 1 : 0);

  const filteredParsedLines = useMemo(
    () =>
      filterLogEntries(parsedSearchLines, {
        methods: filters.methodFilterSet,
        statuses: filters.statusFilterSet,
        paths: filters.pathFilterSet,
        level: levelFilter,
      }),
    [
      parsedSearchLines,
      filters.methodFilterSet,
      filters.statusFilterSet,
      filters.pathFilterSet,
      levelFilter,
    ]
  );
  const removedCount = logBuffer.buffer.length - filteredParsedLines.length;
  const filteredLines = useMemo(
    () => filteredParsedLines.map((line) => line.raw),
    [filteredParsedLines]
  );
  const logState = useMemo<LogState>(
    () => ({
      buffer: filteredLines,
      visibleFrom: Math.max(0, filteredLines.length - visibleCount),
    }),
    [filteredLines, visibleCount]
  );
  const setLogState: Dispatch<SetStateAction<LogState>> = (update) => {
    const next = typeof update === 'function' ? update(logState) : update;
    setVisibleCount(next.buffer.length - next.visibleFrom);
  };
  const parsedVisibleLines = filteredParsedLines.slice(logState.visibleFrom);
  // The row keyboard users return to: the last one they focused, else the newest.
  const tabRowId = parsedVisibleLines.some((line) => line.id === focusedRowId)
    ? focusedRowId
    : parsedVisibleLines.at(-1)?.id;
  // Rows and dividers show the viewer's own clock and date.
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { timeStyle: 'medium' }),
    [i18n.language]
  );

  const {
    canLoadMore,
    handleLogScroll,
    logViewerRef,
    requestScrollToBottom,
    isFollowing,
    resumeFollowing,
    pendingLines,
    historyEvicted,
    atBottom,
  } = useLogScroller({
    logState,
    setLogState,
    bufferStart: logBuffer.bufferStart,
    loading,
    isSearching,
    filteredLineCount: filteredLines.length,
    hasStructuredFilters: filters.hasStructuredFilters,
    showRawLogs,
    wrapLogs,
  });

  // A filter change swaps out the rows the reading position was anchored to, so it
  // returns to the latest lines instead of reporting a lost position. This runs after
  // the scroller's layout effect and before paint.
  const showLatest = useEffectEvent(resumeFollowing);
  useLayoutEffect(() => {
    showLatest();
    setVisibleCount(INITIAL_DISPLAY_LINES);
  }, [
    setVisibleCount,
    trimmedSearchQuery,
    hideManagementLogs,
    levelFilter,
    filters.methodFilterSet,
    filters.statusFilterSet,
    filters.pathFilterSet,
  ]);

  const rowElement = (id: number) =>
    logViewerRef.current?.querySelector<HTMLElement>(`${ROW_SELECTOR}[data-log-id="${id}"]`);

  const copyLogLine = async (raw: string) => {
    const ok = await copyToClipboard(raw);
    if (ok) {
      showNotification(t('logs.copy_success', { defaultValue: 'Copied to clipboard' }), 'success');
    } else {
      showNotification(t('logs.copy_failed', { defaultValue: 'Copy failed' }), 'error');
    }
  };

  const downloadRequestLog = async (id: string) => {
    const session = requests.session.capture();
    setRequestLogDownloading(true);
    try {
      const response = await logsApi.downloadRequestLogById(id);
      if (!requests.session.isCurrent(session)) return;
      downloadBlob({
        filename: `request-${id}.log`,
        blob: new Blob([response.data], { type: 'text/plain' }),
      });
      showNotification(t('logs.request_log_download_success'), 'success');
    } catch (err: unknown) {
      if (!requests.session.isCurrent(session)) return;
      const message = getErrorMessage(err);
      showNotification(
        `${t('notification.download_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      if (requests.session.isCurrent(session)) setRequestLogDownloading(false);
    }
  };

  useEffect(() => {
    if (!fullscreenLogs) return;

    // A transformed ancestor (the page transition layer) would trap `position: fixed`
    // inside it, so lift those transforms while the viewer covers the screen.
    const lifted: Array<[HTMLElement, string]> = [];
    for (let node = containerRef.current?.parentElement; node; node = node.parentElement) {
      if (getComputedStyle(node).transform === 'none') continue;
      lifted.push([node, node.style.transform]);
      node.style.transform = 'none';
    }
    lockScroll();

    const handleEscape = (event: KeyboardEvent) => {
      if (!shouldExitLogFullscreen(event, !!document.querySelector(OPEN_OVERLAY_SELECTOR))) return;
      setFullscreenLogs(false);
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      for (const [node, transform] of lifted) node.style.transform = transform;
      unlockScroll();
    };
  }, [fullscreenLogs]);

  // "/" jumps to the search box, like a terminal pager.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      if (!searchRef.current) return;
      event.preventDefault();
      searchRef.current.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const readStatusKey =
    catchingUp && autoRefresh
      ? 'logs.read_status_catching_up'
      : autoRefresh
        ? 'logs.read_status_live'
        : 'logs.read_status_paused';
  const live = autoRefresh && !disableControls;
  const lastUpdatedText =
    lastUpdated &&
    t('logs.last_updated', { time: new Date(lastUpdated).toLocaleTimeString(i18n.language) });
  const bufferScope = t('logs.buffer_scope', {
    count: logBuffer.buffer.length.toLocaleString(i18n.language),
    matched: filteredLines.length.toLocaleString(i18n.language),
  });
  const fullscreenLabel = fullscreenLogs
    ? t('logs.exit_fullscreen_button')
    : t('logs.fullscreen_button');

  const selectTab = (tab: TabType) => {
    if (tab === 'errors') setFullscreenLogs(false);
    setActiveTab(tab);
  };

  // Each tab has its own toolbar, so the control remounts on a switch; this puts focus back on
  // the selected item when the switch came from the control itself.
  const refocusTab = useRef(false);
  const focusSelectedTab = (element: HTMLButtonElement | null) => {
    if (!element || !refocusTab.current) return;
    refocusTab.current = false;
    element.focus();
  };

  // The shared segmented control; full width on phones.
  const tabs = (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      aria-label={t('nav_short.logs')}
      className={phone ? 'w-full' : undefined}
      value={activeTab}
      // Radix sends an empty value when the active tab is pressed again; keep it.
      onValueChange={(value) => {
        if (value !== 'logs' && value !== 'errors') return;
        refocusTab.current = true;
        selectTab(value);
      }}
    >
      {(['logs', 'errors'] as const).map((tab) => (
        <ToggleGroupItem
          key={tab}
          ref={activeTab === tab ? focusSelectedTab : undefined}
          value={tab}
          className={phone ? 'flex-1' : 'px-3'}
        >
          {t(tab === 'logs' ? 'logs.tab_logs' : 'logs.tab_errors')}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );

  const levelSelect = (className: string) => (
    <Select
      value={levelFilter || ALL_LEVELS}
      onValueChange={(value) => setLevelFilter(value === ALL_LEVELS ? '' : value)}
    >
      <SelectTrigger aria-label={t('logs.level_filter')} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_LEVELS}>{t('logs.all_levels')}</SelectItem>
        {LEVELS.map((level) => (
          <SelectItem key={level} value={level}>
            {level.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const onRowKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>, line: LogEntry) => {
    if (event.target !== event.currentTarget) return;
    const row = event.currentTarget;
    const rows = row.parentElement?.querySelectorAll<HTMLElement>(ROW_SELECTOR);
    let target: Element | null | undefined;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setDetail(line);
      return;
    }
    if (event.key === 'ArrowDown') target = siblingRow(row, true);
    else if (event.key === 'ArrowUp') target = siblingRow(row, false);
    else if (event.key === 'Home') target = rows?.[0];
    else if (event.key === 'End') target = rows?.[rows.length - 1];
    else return;
    event.preventDefault();
    if (target instanceof HTMLElement) target.focus();
  };

  const renderRow = (line: LogEntry) => {
    const failed =
      line.level === 'error' || line.level === 'fatal' || (line.statusCode ?? 0) >= 500;
    const tone = rowTone(line);
    const time = line.timestamp ? logInstant(line.timestamp, serverOffset) : null;
    const text = wrapLogs ? 'whitespace-pre-wrap break-all' : 'truncate';
    const open = detail?.id === line.id;
    return (
      <div
        key={line.id}
        data-log-id={line.id}
        role="button"
        tabIndex={line.id === tabRowId ? 0 : -1}
        aria-current={open || undefined}
        className={cn(
          'group/row relative flex cursor-pointer items-start gap-3 px-10 py-[5px] leading-5 outline-none hover:bg-muted/60 focus-within:bg-muted/60 sm:focus-visible:ring-2 sm:focus-visible:ring-ring/50 sm:focus-visible:ring-inset',
          'max-sm:mx-2 max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-0.5 max-sm:rounded-lg max-sm:px-2 max-sm:py-1.5',
          failed && 'bg-destructive/8 hover:bg-destructive/12',
          open && (failed ? 'sm:bg-destructive/15' : 'sm:bg-muted')
        )}
        // A row opens the whole entry, unless the click ended a text selection.
        onClick={() => {
          if (window.getSelection()?.type === 'Range') return;
          setDetail(line);
        }}
        onKeyDown={(event) => onRowKeyDown(event, line)}
        onFocus={(event) => {
          if (event.target !== event.currentTarget) return;
          setFocusedRowId(line.id);
          // The desktop panel follows the row as arrow keys move through the list.
          if (detail && !phone) setDetail(line);
        }}
      >
        {/* The bar marks warnings and failures only, so they stand out. */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-[7px] left-7 h-4 w-[3px] rounded-full max-sm:inset-y-2 max-sm:left-0 max-sm:h-auto',
            tone,
            (tone === 'bg-primary' || tone === 'bg-faint') && 'hidden'
          )}
        />
        <span className="w-[5.5rem] shrink-0 whitespace-nowrap text-faint tabular-nums max-sm:col-start-1 max-sm:row-start-2 max-sm:w-auto max-sm:font-sans max-sm:text-xs max-sm:leading-4 max-sm:text-muted-foreground max-sm:normal-nums">
          {time
            ? timeFormat.format(time)
            : line.timestamp && splitLogTimestamp(line.timestamp).time}
        </span>
        <span
          className={cn(
            'w-11 shrink-0 text-[11px] uppercase max-sm:hidden',
            line.level && levelTone[line.level]
          )}
        >
          {line.level}
        </span>
        <span
          className={cn(
            'flex min-w-0 flex-1 items-start gap-x-2 max-sm:col-start-1 max-sm:row-start-1',
            wrapLogs && 'flex-wrap',
            failed ? 'text-destructive' : 'text-foreground'
          )}
        >
          {line.method && <span className="shrink-0 text-muted-foreground">{line.method}</span>}
          {line.path && (
            <span className={cn('min-w-0', text)} title={line.path}>
              {/* Phone rows are narrow and the query is nearly always the same; the detail
                  sheet keeps the full path. */}
              {phone ? line.path.split('?')[0] : line.path}
            </span>
          )}
          {line.message && (
            <span className={cn('min-w-0', text, line.path && 'text-muted-foreground')}>
              {line.message}
            </span>
          )}
          {line.requestId && (
            <span className="shrink-0 text-faint max-sm:hidden">{line.requestId}</span>
          )}
          {showLineDetails && line.ip && (
            <span className="shrink-0 text-faint max-lg:hidden">{line.ip}</span>
          )}
          {showLineDetails && line.source && (
            <span className="shrink-0 text-faint max-xl:hidden" title={line.source}>
              {line.source}
            </span>
          )}
        </span>
        <span
          className={cn(
            'w-8 shrink-0 text-right tabular-nums max-sm:col-start-2 max-sm:row-start-1 max-sm:w-auto max-sm:justify-self-end max-sm:font-sans max-sm:normal-nums',
            typeof line.statusCode === 'number' && statusTone(line.statusCode)
          )}
        >
          {line.statusCode}
        </span>
        <span className="w-16 shrink-0 text-right text-muted-foreground tabular-nums max-sm:col-start-2 max-sm:row-start-2 max-sm:w-auto max-sm:justify-self-end max-sm:font-sans max-sm:text-xs max-sm:leading-4 max-sm:normal-nums">
          {line.latency}
        </span>
        {/* Out of the tab order: the row is the stop, and its detail sheet copies too. */}
        <Hint label={t('logs.copy_line')}>
          <Button
            variant="ghost"
            size="icon-sm"
            tabIndex={-1}
            className="-my-1.5 size-8 shrink-0 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-visible/row:opacity-100 max-sm:hidden pointer-coarse:opacity-100 motion-reduce:transition-none"
            onClick={(event) => {
              event.stopPropagation();
              void copyLogLine(line.raw);
            }}
            aria-label={t('logs.copy_line')}
          >
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.75} />
          </Button>
        </Hint>
      </div>
    );
  };

  const filterFields = (
    <FieldGroup className="gap-5">
      <Field className="sm:hidden">
        <FieldTitle>{t('logs.level_filter')}</FieldTitle>
        {levelSelect('w-full data-[size=default]:h-10')}
      </Field>
      <FilterChips title={t('logs.filter_method')}>
        {HTTP_METHODS.map((method) => {
          const active = filters.methodFilters.includes(method);
          const count = filters.methodCounts[method] ?? 0;
          return (
            <FilterChip
              key={method}
              active={active}
              count={count}
              disabled={count === 0 && !active}
              onToggle={() => filters.toggleMethodFilter(method)}
            >
              {method}
            </FilterChip>
          );
        })}
      </FilterChips>
      <FilterChips title={t('logs.filter_status')}>
        {STATUS_GROUPS.map((statusGroup) => {
          const active = filters.statusFilters.includes(statusGroup);
          const count = filters.statusCounts[statusGroup] ?? 0;
          return (
            <FilterChip
              key={statusGroup}
              active={active}
              count={count}
              disabled={count === 0 && !active}
              onToggle={() => filters.toggleStatusFilter(statusGroup)}
            >
              {t(`logs.filter_status_${statusGroup}`)}
            </FilterChip>
          );
        })}
      </FilterChips>
      <FilterChips title={t('logs.filter_path')}>
        {filters.pathOptions.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t('logs.filter_path_empty')}</span>
        ) : (
          filters.pathOptions.map(({ path, count }) => (
            <FilterChip
              key={path}
              active={filters.pathFilters.includes(path)}
              count={count}
              title={path}
              onToggle={() => filters.togglePathFilter(path)}
            >
              {path}
            </FilterChip>
          ))
        )}
      </FilterChips>
      <div className="flex flex-col gap-4 border-t pt-5 max-sm:gap-1 max-sm:pt-3">
        <SwitchRow
          id="logs-wrap-lines"
          label={t('logs.wrap_lines')}
          checked={wrapLogs}
          onChange={setWrapLogs}
        />
        <SwitchRow
          id="logs-hide-management"
          label={t('logs.hide_management_logs')}
          checked={hideManagementLogs}
          onChange={setHideManagementLogs}
        />
        <SwitchRow
          id="logs-show-line-details"
          label={t('logs.show_line_details')}
          checked={showLineDetails}
          onChange={setShowLineDetails}
        />
        <SwitchRow
          id="logs-show-raw"
          label={t('logs.show_raw_logs', { defaultValue: 'Show raw logs' })}
          description={t('logs.show_raw_logs_hint', {
            defaultValue: 'Show original log text for easier multi-line copy',
          })}
          checked={showRawLogs}
          onChange={setShowRawLogs}
        />
      </div>
    </FieldGroup>
  );

  // With request logging off the server only keeps logs for requests that hit an
  // upstream error. A 499 means the client left first, so it never has one.
  const canOpenRequestLog = (line: LogEntry) => {
    if (requestLogEnabled) return true;
    const status = line.statusCode ?? 0;
    return status >= 400 && status !== 499;
  };
  const statusLabel = (code: number) =>
    `${code} ${t(`logs.status_text.${code}`, { defaultValue: '' })}`.trim();
  const detailTime = detail?.timestamp ? logInstant(detail.timestamp, serverOffset) : null;
  const detailFields = detail
    ? [
        {
          label: t('logs.column_time'),
          value: detailTime
            ? detailTime.toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'medium' })
            : detail.timestamp?.replace('T', ' '),
        },
        // Request lines say how they went through the status instead.
        {
          label: t('logs.column_level'),
          value: !detail.method && detail.level ? capitalize(detail.level) : undefined,
        },
        {
          label: t('logs.filter_status'),
          value: detail.statusCode === undefined ? undefined : statusLabel(detail.statusCode),
        },
        { label: t('logs.column_duration'), value: detail.latency },
        {
          label: t('logs.detail_request_id'),
          value: detail.requestId ? (
            <span className="-my-1.5 flex items-center gap-1">
              <span className="font-mono">{detail.requestId}</span>
              <CopyButton value={detail.requestId} label={t('common.copy')} />
            </span>
          ) : undefined,
        },
        { label: 'IP', value: detail.ip },
      ]
    : [];

  // The time in the file name is the server clock, shown the same way as log rows.
  const errorFileTime = (item: ErrorLogFile) => {
    const nameTime = parseErrorLogName(item.name)?.time;
    const time = nameTime ? logInstant(nameTime, serverOffset) : null;
    const date = time ?? parseDateValue(item.modified);
    // The app's date style plus seconds, which tell apart failures in the same minute.
    return date
      ? date.toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'medium' })
      : '';
  };

  const errorFileSummary = (item: ErrorLogFile) => {
    const parsed = parseErrorLogName(item.name);
    if (!parsed) {
      return (
        <>
          <EmailPrivacyText className="truncate font-mono text-[13px]" text={item.name} />
          {fileMeta(item)}
        </>
      );
    }
    return (
      <>
        <span className="truncate text-sm font-medium">{errorFileTime(item)}</span>
        <span className="flex min-w-0 gap-1.5 text-xs text-muted-foreground">
          <EmailPrivacyText className="truncate font-mono" text={parsed.endpoint} />
          {item.size ? <span className="shrink-0">· {formatSize(item.size)}</span> : null}
        </span>
      </>
    );
  };

  const fileMetaText = (item: ErrorLogFile) =>
    [formatSize(item.size), formatDateTimeValue(item.modified, i18n.language)]
      .filter(Boolean)
      .join(' · ');

  const fileMeta = (item: ErrorLogFile) => (
    <span className="truncate text-xs text-muted-foreground">{fileMetaText(item)}</span>
  );

  const emptyState = (title: string, description: string) => (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={File01Icon} strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <>
      <div ref={containerRef} className="flex h-full min-h-0 flex-col">
        <h1 className="sr-only">{t('nav_short.logs')}</h1>

        {activeTab === 'logs' && (
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col overflow-hidden bg-background',
              fullscreenLogs &&
                'fixed inset-0 z-50 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]'
            )}
          >
            <div className="flex flex-wrap items-center gap-2 border-b px-10 py-3 max-sm:px-4">
              {tabs}
              <InputGroup className="h-9 min-w-40 flex-1 max-sm:h-10 max-sm:min-w-0">
                <InputGroupAddon>
                  <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} />
                </InputGroupAddon>
                <InputGroupInput
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t(phone ? 'logs.search_short' : 'logs.search_placeholder')}
                  aria-label={t('logs.search_placeholder')}
                />
                <InputGroupAddon align="inline-end">
                  {searchQuery ? (
                    <Hint label={t('logs.clear_search')}>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setSearchQuery('')}
                        aria-label={t('logs.clear_search')}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} />
                      </Button>
                    </Hint>
                  ) : (
                    <Kbd className="max-sm:hidden">/</Kbd>
                  )}
                </InputGroupAddon>
              </InputGroup>

              {levelSelect('w-28 data-[size=default]:h-9 max-sm:hidden lg:w-32')}

              {/* The label hides below lg, so the tooltip names the icon there. */}
              <Hint label={t('logs.filter_panel_title')}>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-9 max-sm:h-10 max-sm:min-w-10"
                  onClick={() => setStructuredFiltersExpanded((prev) => !prev)}
                  aria-haspopup="dialog"
                  aria-controls={structuredFiltersPanelId}
                  aria-label={t('logs.filter_panel_title')}
                >
                  <HugeiconsIcon
                    icon={FilterHorizontalIcon}
                    data-icon="inline-start"
                    strokeWidth={1.75}
                  />
                  <span className="max-lg:hidden">{t('logs.filter_panel_title')}</span>
                  {structuredFilterCount > 0 && (
                    <Badge
                      className="max-sm:hidden"
                      aria-label={t('logs.filter_panel_active_count', {
                        count: structuredFilterCount,
                      })}
                    >
                      {structuredFilterCount}
                    </Badge>
                  )}
                  {/* On phone the level filter sits in the dialog, so it counts here too. */}
                  {phoneFilterCount > 0 && (
                    <Badge
                      className="sm:hidden"
                      aria-label={t('logs.filter_panel_active_count', { count: phoneFilterCount })}
                    >
                      {phoneFilterCount}
                    </Badge>
                  )}
                </Button>
              </Hint>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-9 gap-2 px-3 max-sm:h-10"
                  aria-pressed={autoRefresh}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  disabled={autoRefreshDisabled}
                >
                  {autoRefresh ? (
                    <span aria-hidden="true" className="size-2 rounded-full bg-success" />
                  ) : (
                    <HugeiconsIcon icon={PlayIcon} data-icon="inline-start" strokeWidth={1.75} />
                  )}
                  {t(autoRefresh ? 'logs.live' : 'logs.go_live')}
                </Button>
                <DropdownMenu>
                  <Hint label={t('common.more')}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon-lg"
                        className="size-9 max-sm:size-10"
                        aria-label={t('common.more')}
                      >
                        <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.75} />
                      </Button>
                    </DropdownMenuTrigger>
                  </Hint>
                  <DropdownMenuContent align="end" className="min-w-48">
                    <DropdownMenuItem
                      className="py-2"
                      disabled={logBuffer.buffer.length === 0}
                      onSelect={downloadLogs}
                    >
                      <HugeiconsIcon icon={Download01Icon} strokeWidth={1.75} />
                      {t('logs.download_cached')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="py-2"
                      onSelect={() => setFullscreenLogs((prev) => !prev)}
                    >
                      <HugeiconsIcon
                        icon={fullscreenLogs ? ArrowShrink01Icon : ArrowExpand01Icon}
                        strokeWidth={1.75}
                      />
                      {fullscreenLabel}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      className="py-2"
                      disabled={clearDisabled}
                      onSelect={() => void clearLogs()}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
                      {t('logs.clear_button')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {showFileLoggingRequired && (
              <Notice tone="warning">
                {t(
                  cpaNeedsFileLogging
                    ? 'logs.cpa_file_logging_required'
                    : 'logs.file_logging_required'
                )}
              </Notice>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            {wasReset && <Notice>{t('logs.cursor_reset_notice')}</Notice>}
            {historyEvicted && <Notice tone="warning">{t('logs.history_evicted')}</Notice>}

            {!showRawLogs && filteredLines.length > 0 && (
              <div
                aria-hidden="true"
                className={cn(
                  'flex gap-3 border-b px-10 py-2 text-xs text-muted-foreground max-sm:hidden',
                  detail && PANEL_ROOM
                )}
              >
                <span className="w-[5.5rem] shrink-0">{t('logs.column_time')}</span>
                <span className="w-11 shrink-0 max-sm:hidden">{t('logs.column_level')}</span>
                <span className="flex-1">{t('logs.column_request')}</span>
                <span className="w-8 shrink-0 text-right">{t('logs.filter_status')}</span>
                <span className="w-16 shrink-0 text-right max-sm:hidden">
                  {t('logs.column_duration')}
                </span>
                <span className="w-8 shrink-0 max-sm:hidden" />
              </div>
            )}

            <div className={cn('relative min-h-0 flex-1', detail && PANEL_ROOM)}>
              {loading && logBuffer.buffer.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">{t('logs.loading')}</div>
              ) : logBuffer.buffer.length > 0 && filteredLines.length > 0 ? (
                <div
                  ref={logViewerRef}
                  className="h-full overflow-auto py-1 font-mono text-[12.5px] outline-none max-sm:pb-8 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                  onScroll={handleLogScroll}
                  // Rows are focusable themselves; raw text needs the region to scroll by keys.
                  tabIndex={showRawLogs ? 0 : -1}
                  role="region"
                  aria-label={t('logs.log_content')}
                  aria-busy={loading}
                >
                  {canLoadMore && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-10 py-2 font-sans text-xs text-muted-foreground max-sm:px-4">
                      <Button
                        variant="outline"
                        size="sm"
                        className="max-sm:h-10 sm:h-8"
                        onClick={() =>
                          setVisibleCount((count) => Math.min(filteredLines.length, count + 200))
                        }
                      >
                        {t('logs.filter_load_more')}
                      </Button>
                      {/* Buffer counts mean little on a phone; the button says enough. */}
                      <span className="max-sm:hidden">
                        {t('logs.loaded_lines', { count: parsedVisibleLines.length })}
                      </span>
                      {removedCount > 0 && (
                        <span className="text-faint max-sm:hidden">
                          {t('logs.filtered_lines', { count: removedCount })}
                        </span>
                      )}
                      <span className="text-faint max-sm:hidden">
                        {t('logs.hidden_lines', { count: logState.visibleFrom })}
                      </span>
                    </div>
                  )}
                  {showRawLogs ? (
                    <pre
                      className={cn(
                        'px-10 leading-5 text-foreground max-sm:px-4',
                        wrapLogs
                          ? 'whitespace-pre-wrap break-all'
                          : 'w-max min-w-full whitespace-pre'
                      )}
                      spellCheck={false}
                    >
                      {parsedVisibleLines.map((line) => (
                        <span key={line.id} data-log-id={line.id} className="block">
                          {line.raw || ' '}
                        </span>
                      ))}
                    </pre>
                  ) : (
                    withDateDividers(parsedVisibleLines, (entry) => {
                      const time = entry.timestamp
                        ? logInstant(entry.timestamp, serverOffset)
                        : null;
                      return time ? formatDateValue(time, i18n.language) : undefined;
                    }).map((item) =>
                      item.kind === 'entry' ? (
                        renderRow(item.entry)
                      ) : (
                        <div
                          key={item.key}
                          className="flex items-center gap-3 px-10 pt-3 pb-1 font-sans text-[11px] text-faint max-sm:px-4 max-sm:text-xs max-sm:text-muted-foreground"
                        >
                          <span>{item.date}</span>
                          <span aria-hidden="true" className="h-px flex-1 bg-border" />
                        </div>
                      )
                    )
                  )}
                </div>
              ) : logBuffer.buffer.length > 0 ? (
                emptyState(t('logs.search_empty_title'), t('logs.search_empty_desc'))
              ) : showFileLoggingRequired ? (
                emptyState(
                  t(
                    cpaNeedsFileLogging
                      ? 'logs.cpa_file_logging_required_title'
                      : 'logs.file_logging_required_title'
                  ),
                  t(
                    cpaNeedsFileLogging
                      ? 'logs.cpa_file_logging_required_desc'
                      : 'logs.file_logging_required_desc'
                  )
                )
              ) : (
                emptyState(t('logs.empty_title'), t('logs.empty_desc'))
              )}
              {/* Browsing history: offer the way back, unless the reader is already at the end and nothing new arrived. */}
              {!isFollowing && (pendingLines > 0 || !atBottom) && (
                <Button
                  variant="secondary"
                  size="lg"
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 shadow-lg shadow-black active:-translate-x-1/2"
                  onClick={resumeFollowing}
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} data-icon="inline-start" strokeWidth={2} />
                  {pendingLines > 0
                    ? t('logs.resume_following', { count: pendingLines })
                    : t('logs.back_to_latest')}
                </Button>
              )}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t px-10 py-2 text-xs text-muted-foreground max-sm:hidden">
              <span className="truncate max-md:hidden" title={bufferScope}>
                {bufferScope}
              </span>
              <span
                role="status"
                data-live={live}
                className="flex min-w-0 items-center gap-2 md:ml-auto"
              >
                <span
                  aria-hidden="true"
                  className={cn('size-2 shrink-0 rounded-full', live ? 'bg-success' : 'bg-faint')}
                />
                <span
                  className="truncate"
                  title={lastUpdated ? `${t(readStatusKey)} · ${lastUpdatedText}` : undefined}
                >
                  {t(readStatusKey)}
                  {lastUpdated && (
                    <span className="text-faint max-sm:hidden"> · {lastUpdatedText}</span>
                  )}
                </span>
              </span>
            </footer>
          </div>
        )}

        {activeTab === 'errors' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            <div className="flex flex-wrap items-center gap-2 border-b px-10 py-3 max-sm:px-4">
              {tabs}
            </div>
            {requestLogEnabled && (
              <Notice tone="warning">{t('logs.error_logs_request_log_enabled')}</Notice>
            )}
            {errorLogsError && <Notice tone="error">{errorLogsError}</Notice>}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex flex-col gap-4 p-4 max-sm:max-w-3xl max-sm:pb-8 sm:px-10 sm:py-6">
                <p className="text-[13px] text-muted-foreground sm:hidden">
                  {t('logs.error_logs_description')}
                </p>
                {loadingErrors ? (
                  <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                ) : errorLogs.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {t('logs.error_logs_empty')}
                  </p>
                ) : (
                  <div className="divide-y overflow-hidden rounded-xl border bg-card">
                    {errorLogs.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center pr-2 transition-colors sm:has-[>button:first-child:hover]:bg-muted/40"
                      >
                        {/* The row opens the file and reads as a time, not a file name. */}
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 cursor-pointer flex-col justify-center gap-0.5 self-stretch py-3 pr-3 pl-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-muted/40"
                          onClick={() => {
                            void openErrorLog(item);
                          }}
                          disabled={disableControls}
                        >
                          {errorFileSummary(item)}
                        </button>
                        <Hint label={t('logs.error_logs_download')}>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-8 max-sm:size-10"
                            aria-label={t('logs.error_logs_download')}
                            onClick={() => downloadErrorLog(item.name)}
                            disabled={disableControls}
                          >
                            <HugeiconsIcon icon={Download01Icon} strokeWidth={1.75} />
                          </Button>
                        </Hint>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {phone ? (
          <Sheet open={structuredFiltersExpanded} onOpenChange={setStructuredFiltersExpanded}>
            <SheetContent side="bottom" className={SHEET_CLASS}>
              <SheetHeader>
                <SheetTitle>{t('logs.filter_panel_title')}</SheetTitle>
                <SheetDescription className="sr-only">
                  {t('logs.filter_panel_title')}
                </SheetDescription>
              </SheetHeader>
              <div id={structuredFiltersPanelId} className="min-h-0 overflow-y-auto px-4 pb-4">
                {filterFields}
              </div>
              <div className="border-t p-4">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-10 w-full"
                  onClick={() => {
                    filters.clearStructuredFilters();
                    setLevelFilter('');
                  }}
                  disabled={phoneFilterCount === 0}
                >
                  {t('logs.clear_filters')}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={structuredFiltersExpanded} onOpenChange={setStructuredFiltersExpanded}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{t('logs.filter_panel_title')}</DialogTitle>
                <DialogDescription className="sr-only">
                  {t('logs.filter_panel_title')}
                </DialogDescription>
              </DialogHeader>
              <div id={structuredFiltersPanelId} className="-mx-4 overflow-y-auto px-4">
                {filterFields}
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={filters.clearStructuredFilters}
                  disabled={!filters.hasStructuredFilters}
                >
                  {t('logs.clear_filters')}
                </Button>
                <Button variant="outline" onClick={() => setStructuredFiltersExpanded(false)}>
                  {t('common.close')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Phones get a modal bottom sheet. Desktop gets a side panel beside the list, without
            a dimmer: focus stays on the rows, so arrow keys move through requests while the
            panel follows, and clicking another row shows that one. */}
        <Sheet
          open={detail !== null}
          modal={phone}
          onOpenChange={(open) => {
            if (!open) setDetail(null);
          }}
        >
          <SheetContent
            side={phone ? 'bottom' : 'right'}
            className={phone ? SHEET_CLASS : 'gap-0 sm:max-w-md'}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              // Phone: focus the sheet, not the request ID's copy button, whose tooltip would
              // cover the fields and take the first Escape.
              if (phone && event.currentTarget instanceof HTMLElement)
                event.currentTarget.focus({ preventScroll: true });
            }}
            onFocusOutside={(event) => {
              if (!phone) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (event.target instanceof Element && event.target.closest(ROW_SELECTOR))
                event.preventDefault();
            }}
            // Back to the row on close, the one the user ended on, unless focus already moved
            // somewhere else on purpose (another row, the search, the request viewer).
            onCloseAutoFocus={(event) => {
              const active = document.activeElement;
              const container = event.currentTarget;
              if (
                active instanceof HTMLElement &&
                active !== document.body &&
                active.isConnected &&
                !(container instanceof Node && container.contains(active))
              ) {
                event.preventDefault();
                return;
              }
              const row = lastDetailId.current === null ? null : rowElement(lastDetailId.current);
              if (!row) return;
              event.preventDefault();
              row.focus({ preventScroll: true });
            }}
          >
            <SheetHeader>
              <SheetTitle
                className={cn(
                  'font-mono wrap-break-word sm:pr-8',
                  detail && rowTone(detail) === 'bg-destructive' && 'text-destructive'
                )}
              >
                {detail?.method && (
                  <span className="mr-2 text-muted-foreground">{detail.method}</span>
                )}
                {detail?.path || t('logs.detail_title')}
              </SheetTitle>
              <SheetDescription className="sr-only">{t('logs.detail_title')}</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-4 sm:flex-1">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-6 gap-y-2 text-sm">
                {detailFields.map(
                  (field) =>
                    field.value !== undefined &&
                    field.value !== '' && (
                      <div key={field.label} className="contents">
                        <dt className="text-muted-foreground">{field.label}</dt>
                        <dd className="min-w-0 wrap-break-word">{field.value}</dd>
                      </div>
                    )
                )}
              </dl>
              {detail && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm text-muted-foreground">
                    {t('logs.detail_full_line')}
                  </span>
                  <pre className="rounded-lg border bg-background p-3 font-mono text-xs leading-5 wrap-break-word whitespace-pre-wrap">
                    {detail.raw}
                  </pre>
                </div>
              )}
              {detail?.requestId && !canOpenRequestLog(detail) && (
                <p className="text-sm text-muted-foreground max-sm:hidden">
                  {t('logs.request_log_failed_only')}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 border-t p-4">
              {detail?.requestId && canOpenRequestLog(detail) && (
                <Button
                  variant="outline"
                  size="lg"
                  className="h-10 sm:h-9"
                  onClick={() => {
                    const requestId = detail.requestId;
                    setDetail(null);
                    if (requestId)
                      void openErrorLog({ name: `request-${requestId}.log` }, requestId);
                  }}
                >
                  <HugeiconsIcon icon={File01Icon} data-icon="inline-start" strokeWidth={1.75} />
                  {t('logs.view_request', { id: detail.requestId })}
                </Button>
              )}
              <Button
                variant="outline"
                size="lg"
                className="h-10 sm:h-9"
                onClick={() => {
                  if (detail) void copyLogLine(detail.raw);
                }}
              >
                <HugeiconsIcon icon={Copy01Icon} data-icon="inline-start" strokeWidth={1.75} />
                {t('logs.copy_line')}
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <Dialog
          open={errorLogViewer.status !== 'closed'}
          onOpenChange={(open) => {
            if (!open) closeErrorLogViewer();
          }}
        >
          <DialogContent
            className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-4xl"
            // Desktop starts on the text, so arrow keys scroll it and Escape closes at once.
            onOpenAutoFocus={
              phone
                ? undefined
                : (event) => {
                    event.preventDefault();
                    viewerScrollRef.current?.focus({ preventScroll: true });
                  }
            }
            // Opened from a row's panel, whose button is gone by now: return to that row.
            onCloseAutoFocus={(event) => {
              const row =
                !phone && viewerRequestId && lastDetailId.current !== null
                  ? rowElement(lastDetailId.current)
                  : null;
              if (!row) return;
              event.preventDefault();
              row.focus({ preventScroll: true });
            }}
          >
            <DialogHeader className="min-w-0 pr-8">
              {/* An error file is named by when and where it failed, like its row. */}
              {selectedErrorLog && viewerFile ? (
                <>
                  <DialogTitle>{errorFileTime(selectedErrorLog)}</DialogTitle>
                  {/* The name already holds the endpoint; it wraps at its hyphens. */}
                  <DialogDescription className="text-xs wrap-break-word">
                    {selectedErrorLog.size ? `${formatSize(selectedErrorLog.size)} · ` : null}
                    <EmailPrivacyText className="font-mono" text={selectedErrorLog.name} />
                  </DialogDescription>
                </>
              ) : (
                <>
                  <DialogTitle className="truncate font-mono sm:text-sm">
                    {selectedErrorLog?.name ?? t('logs.error_log_view_title')}
                  </DialogTitle>
                  {/* A request looked up by ID has no size or date until it loads. */}
                  {selectedErrorLog && fileMetaText(selectedErrorLog) ? (
                    <DialogDescription className="text-xs">
                      {fileMetaText(selectedErrorLog)}
                    </DialogDescription>
                  ) : (
                    <DialogDescription className="sr-only">
                      {t('logs.error_log_view_title')}
                    </DialogDescription>
                  )}
                </>
              )}
            </DialogHeader>
            <div
              ref={viewerScrollRef}
              tabIndex={0}
              className="relative min-h-0 overflow-auto rounded-lg border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onScroll={(event) => {
                const top = viewerResponseTop();
                setViewerAtResponse(top !== null && event.currentTarget.scrollTop >= top - 1);
              }}
            >
              {errorLogViewer.status === 'error' && (
                <p role="alert" className="p-4 text-sm text-destructive">
                  {errorLogViewer.message}
                </p>
              )}
              {errorLogViewer.status === 'missing' && (
                <p className="p-4 text-sm text-muted-foreground">{t('logs.request_log_none')}</p>
              )}
              {errorLogViewer.status === 'loading' && (
                <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>
              )}
              {errorLogViewer.status === 'ready' &&
                (errorLogViewer.text ? (
                  <>
                    {/* Phone leads with how the request ended and keeps a way past the
                        headers and request body, which can run to hundreds of kilobytes. */}
                    {(viewerStatus !== null || viewerResponseAt !== null) && (
                      <div
                        ref={viewerBarRef}
                        className="sticky top-0 z-10 border-b bg-background sm:hidden"
                      >
                        <div className="flex min-h-12 items-center justify-between gap-3 py-1 pr-1.5 pl-4">
                          <span
                            className={cn(
                              'text-sm font-medium',
                              viewerStatus !== null && statusTone(viewerStatus)
                            )}
                          >
                            {viewerStatus !== null && statusLabel(viewerStatus)}
                          </span>
                          {viewerResponseAt !== null && (
                            <Button
                              variant="ghost"
                              size="lg"
                              className="h-10"
                              onClick={() => {
                                const container = viewerScrollRef.current;
                                const top = viewerResponseTop();
                                if (container && top !== null)
                                  container.scrollTop = viewerAtResponse ? 0 : top;
                              }}
                            >
                              <HugeiconsIcon
                                icon={viewerAtResponse ? ArrowUp01Icon : ArrowDown01Icon}
                                data-icon="inline-start"
                                strokeWidth={1.75}
                              />
                              {t(viewerAtResponse ? 'logs.back_to_top' : 'logs.jump_to_response')}
                            </Button>
                          )}
                        </div>
                        {viewerErrorMessage && (
                          <p className="-mt-1 line-clamp-2 px-4 pb-2.5 text-xs wrap-break-word text-muted-foreground">
                            {viewerErrorMessage}
                          </p>
                        )}
                      </div>
                    )}
                    <pre
                      className="p-4 font-mono text-[12.5px] leading-5 wrap-break-word whitespace-pre-wrap text-foreground max-sm:p-3 max-sm:text-xs"
                      spellCheck={false}
                    >
                      {viewerResponseAt === null ? (
                        errorLogViewer.text
                      ) : (
                        <>
                          {errorLogViewer.text.slice(0, viewerResponseAt)}
                          <span ref={viewerResponseRef}>
                            {errorLogViewer.text.slice(viewerResponseAt)}
                          </span>
                        </>
                      )}
                    </pre>
                  </>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    {t('logs.error_log_empty_content')}
                  </p>
                ))}
            </div>
            {/* The header X closes the viewer; the footer only acts on a file that exists. */}
            {(errorLogViewer.status === 'loading' || errorLogViewer.status === 'ready') && (
              <DialogFooter>
                {/* Phones are for reading, so Copy leads there; desktop leads with Download. */}
                <Button
                  variant={phone ? 'default' : 'outline'}
                  className="max-sm:order-last"
                  onClick={() => {
                    void copySelectedErrorLog();
                  }}
                  disabled={errorLogViewer.status !== 'ready' || !errorLogViewer.text}
                >
                  <HugeiconsIcon icon={Copy01Icon} data-icon="inline-start" strokeWidth={1.75} />
                  {t('common.copy')}
                </Button>
                <Button
                  variant={phone ? 'outline' : 'default'}
                  aria-busy={requestLogDownloading}
                  onClick={() => {
                    if (requestLogDownloading) return;
                    if (viewerRequestId) void downloadRequestLog(viewerRequestId);
                    else if (selectedErrorLog) void downloadErrorLog(selectedErrorLog.name);
                  }}
                  disabled={errorLogViewer.status !== 'ready'}
                >
                  <HugeiconsIcon
                    icon={Download01Icon}
                    data-icon="inline-start"
                    strokeWidth={1.75}
                  />
                  {t('logs.error_logs_download')}
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
