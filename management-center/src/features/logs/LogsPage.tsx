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
import type { ComponentProps, Dispatch, ReactNode, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
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
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
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
import { Hint, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
import { formatDateTimeValue, formatDateValue, formatUnixTimestamp } from '@/utils/format';
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

const formatSize = (size?: number) => (size ? `${(size / 1024).toFixed(1)} KB` : '');

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

function IconAction({
  label,
  icon,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children'> & {
  label: string;
  icon: IconSvgElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon-lg"
          aria-label={label}
          className={className}
          {...props}
        >
          <HugeiconsIcon icon={icon} strokeWidth={1.75} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
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
        'flex items-center gap-2 border-b px-4 py-2 text-xs',
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
  const refreshDisabled = disableControls || loading || clearingLogs || cpaNeedsFileLogging;
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
  const fullscreenLabel = fullscreenLogs
    ? t('logs.exit_fullscreen_button')
    : t('logs.fullscreen_button');

  const selectTab = (tab: TabType) => {
    if (tab === 'errors') setFullscreenLogs(false);
    setActiveTab(tab);
  };

  // Phone: a full-width segmented control with short names.
  const tabs = phone ? (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      aria-label={t('nav_short.logs')}
      className="w-full"
      value={activeTab}
      // Radix sends an empty value when the active tab is pressed again; keep it.
      onValueChange={(value) => {
        if (value === 'logs' || value === 'errors') selectTab(value);
      }}
    >
      {(['logs', 'errors'] as const).map((tab) => (
        <ToggleGroupItem key={tab} value={tab} className="flex-1">
          {t(tab === 'logs' ? 'logs.tab_logs' : 'logs.tab_errors')}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  ) : (
    <ButtonGroup aria-label={t('nav_short.logs')}>
      {(['logs', 'errors'] as const).map((tab) => (
        <Button
          key={tab}
          variant={activeTab === tab ? 'secondary' : 'outline'}
          size="lg"
          className="h-9"
          aria-pressed={activeTab === tab}
          onClick={() => selectTab(tab)}
        >
          {t(tab === 'logs' ? 'logs.log_content' : 'logs.error_logs_modal_title')}
        </Button>
      ))}
    </ButtonGroup>
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

  const renderRow = (line: LogEntry) => {
    const failed =
      line.level === 'error' || line.level === 'fatal' || (line.statusCode ?? 0) >= 500;
    const tone = rowTone(line);
    const time = phone && line.timestamp ? logInstant(line.timestamp, serverOffset) : null;
    const text = wrapLogs ? 'whitespace-pre-wrap break-all' : 'truncate';
    return (
      <div
        key={line.id}
        data-log-id={line.id}
        className={cn(
          'group/row flex items-start gap-3 px-4 py-[5px] leading-5 hover:bg-muted/60 focus-within:bg-muted/60',
          'max-sm:relative max-sm:mx-2 max-sm:grid max-sm:cursor-pointer max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-0.5 max-sm:rounded-lg max-sm:px-2 max-sm:py-1.5 max-sm:outline-none',
          failed && 'bg-destructive/8 hover:bg-destructive/12'
        )}
        onDoubleClick={() => {
          void copyLogLine(line.raw);
        }}
        // Phone rows can't show everything, so a tap opens the whole entry.
        role={phone ? 'button' : undefined}
        tabIndex={phone ? 0 : undefined}
        onClick={phone ? () => setDetail(line) : undefined}
        onKeyDown={
          phone
            ? (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                setDetail(line);
              }
            : undefined
        }
        title={t('logs.double_click_copy_hint', { defaultValue: 'Double-click to copy' })}
      >
        {/* Phone keeps the bar for warnings and failures only, so they stand out. */}
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 h-4 w-[3px] shrink-0 rounded-full max-sm:absolute max-sm:inset-y-2 max-sm:left-0 max-sm:mt-0 max-sm:h-auto',
            tone,
            (tone === 'bg-primary' || tone === 'bg-faint') && 'max-sm:hidden'
          )}
        />
        <span className="w-[4.25rem] shrink-0 whitespace-nowrap text-faint tabular-nums max-sm:col-start-1 max-sm:row-start-2 max-sm:w-auto max-sm:font-sans max-sm:text-xs max-sm:leading-4 max-sm:text-muted-foreground max-sm:normal-nums">
          {time
            ? time.toLocaleTimeString(i18n.language, { timeStyle: 'medium' })
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
            <Hint label={t('logs.view_request', { id: line.requestId })}>
              <button
                type="button"
                aria-label={t('logs.view_request', { id: line.requestId })}
                onClick={() =>
                  void openErrorLog({ name: `request-${line.requestId}.log` }, line.requestId)
                }
                className="-mx-1 shrink-0 cursor-pointer rounded-sm px-1 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 max-sm:hidden"
              >
                {line.requestId}
              </button>
            </Hint>
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
        <Hint label={t('logs.copy_line')}>
          <Button
            variant="ghost"
            size="icon-xs"
            className="-my-0.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-visible:opacity-100 max-sm:hidden pointer-coarse:opacity-100 motion-reduce:transition-none"
            onClick={() => void copyLogLine(line.raw)}
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
    return formatDateTimeValue(time ?? item.modified, i18n.language);
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

  const fileMeta = (item: ErrorLogFile) => (
    <span className="truncate text-xs text-muted-foreground">
      {[formatSize(item.size), item.modified ? formatUnixTimestamp(item.modified) : '']
        .filter(Boolean)
        .join(' · ')}
    </span>
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
            <div className="flex flex-wrap items-center gap-2 border-b p-3 max-sm:px-4">
              {tabs}
              <InputGroup className="h-9 min-w-48 flex-1 max-sm:h-10 max-sm:min-w-0">
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

              {levelSelect('w-32 data-[size=default]:h-9 max-sm:hidden')}

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
                <span className="max-md:hidden">{t('logs.filter_panel_title')}</span>
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

              <div className="flex items-center gap-2">
                <IconAction
                  label={t('common.refresh')}
                  icon={RefreshIcon}
                  onClick={() => loadLogs(false)}
                  disabled={refreshDisabled}
                  className="max-sm:hidden"
                />
                <IconAction
                  label={t('logs.reading_enabled')}
                  icon={autoRefresh ? PauseIcon : PlayIcon}
                  aria-pressed={autoRefresh}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  disabled={autoRefreshDisabled}
                  className="max-sm:hidden"
                />
                <Button
                  variant="outline"
                  size="lg"
                  className="h-10 gap-2 px-3 sm:hidden"
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
                <IconAction
                  label={t('logs.download_cached')}
                  icon={Download01Icon}
                  onClick={downloadLogs}
                  disabled={logBuffer.buffer.length === 0}
                  className="max-sm:hidden"
                />
                <IconAction
                  label={t('logs.clear_button')}
                  icon={Delete02Icon}
                  onClick={clearLogs}
                  disabled={clearDisabled}
                  className="hover:text-destructive max-sm:hidden"
                />
                <IconAction
                  label={fullscreenLabel}
                  icon={fullscreenLogs ? ArrowShrink01Icon : ArrowExpand01Icon}
                  aria-pressed={fullscreenLogs}
                  onClick={() => setFullscreenLogs((prev) => !prev)}
                  className="max-sm:hidden"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-lg"
                      className="size-10 sm:hidden"
                      aria-label={t('common.more')}
                    >
                      <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.75} />
                    </Button>
                  </DropdownMenuTrigger>
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
                className="flex gap-3 border-b px-4 py-2 text-xs text-muted-foreground max-sm:hidden"
              >
                <span className="w-[3px] shrink-0" />
                <span className="w-[4.25rem] shrink-0">{t('logs.column_time')}</span>
                <span className="w-11 shrink-0 max-sm:hidden">{t('logs.column_level')}</span>
                <span className="flex-1">{t('logs.column_request')}</span>
                <span className="w-8 shrink-0 text-right">{t('logs.filter_status')}</span>
                <span className="w-16 shrink-0 text-right max-sm:hidden">
                  {t('logs.column_duration')}
                </span>
                <span className="w-6 shrink-0 max-sm:hidden" />
              </div>
            )}

            <div className="relative min-h-0 flex-1">
              {loading && logBuffer.buffer.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">{t('logs.loading')}</div>
              ) : logBuffer.buffer.length > 0 && filteredLines.length > 0 ? (
                <div
                  ref={logViewerRef}
                  className="h-full overflow-auto py-1 font-mono text-[12.5px] outline-none max-sm:pb-8 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                  onScroll={handleLogScroll}
                  tabIndex={0}
                  role="region"
                  aria-label={t('logs.log_content')}
                  aria-busy={loading}
                >
                  {canLoadMore && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 font-sans text-xs text-muted-foreground">
                      <Button
                        variant="outline"
                        size="sm"
                        className="max-sm:h-10"
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
                        'px-4 leading-5 text-foreground',
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
                    withDateDividers(
                      parsedVisibleLines,
                      phone
                        ? (entry) => {
                            const time = entry.timestamp
                              ? logInstant(entry.timestamp, serverOffset)
                              : null;
                            return time ? formatDateValue(time, i18n.language) : undefined;
                          }
                        : undefined
                    ).map((item) =>
                      item.kind === 'entry' ? (
                        renderRow(item.entry)
                      ) : (
                        <div
                          key={item.key}
                          className="flex items-center gap-3 px-4 pt-3 pb-1 font-sans text-[11px] text-faint tabular-nums max-sm:text-xs max-sm:text-muted-foreground max-sm:normal-nums"
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

            <footer className="flex items-center justify-between gap-3 border-t px-4 py-2 text-xs text-muted-foreground max-sm:hidden">
              <span className="truncate max-md:hidden">
                {t('logs.buffer_scope', {
                  count: logBuffer.buffer.length,
                  matched: filteredLines.length,
                })}
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
                <span className="truncate">
                  {t(readStatusKey)}
                  {lastUpdated && (
                    <span className="text-faint max-sm:hidden">
                      {' '}
                      ·{' '}
                      {t('logs.last_updated', { time: new Date(lastUpdated).toLocaleTimeString() })}
                    </span>
                  )}
                </span>
              </span>
            </footer>
          </div>
        )}

        {activeTab === 'errors' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 max-sm:px-4">
              {tabs}
              <Button
                variant="outline"
                size="lg"
                className="h-9 max-sm:hidden"
                onClick={loadErrorLogs}
                disabled={disableControls || loadingErrors}
              >
                <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" strokeWidth={1.75} />
                {t('common.refresh')}
              </Button>
            </div>
            {requestLogEnabled && (
              <Notice tone="warning">{t('logs.error_logs_request_log_enabled')}</Notice>
            )}
            {errorLogsError && <Notice tone="error">{errorLogsError}</Notice>}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex max-w-3xl flex-col gap-4 p-4 max-sm:pb-8 sm:p-6">
                <p className="text-[13px] text-muted-foreground">
                  {t('logs.error_logs_description')}
                </p>
                {loadingErrors ? (
                  <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                ) : errorLogs.length === 0 ? (
                  <Empty className="rounded-xl border border-dashed">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <HugeiconsIcon icon={File01Icon} strokeWidth={1.75} />
                      </EmptyMedia>
                      <EmptyTitle>{t('logs.error_logs_empty')}</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="divide-y overflow-hidden rounded-xl border bg-card">
                    {errorLogs.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center gap-3 p-3 max-sm:gap-0 max-sm:py-0 max-sm:pr-2 max-sm:pl-0"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground max-sm:hidden">
                          <HugeiconsIcon
                            icon={File01Icon}
                            className="size-[18px]"
                            strokeWidth={1.75}
                          />
                        </span>
                        {/* Phone: the button fills the row beside Download, and reads as a time,
                            not a file name. */}
                        {phone ? (
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch py-3 pr-3 pl-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-muted/40"
                            onClick={() => {
                              void openErrorLog(item);
                            }}
                            disabled={disableControls}
                          >
                            {errorFileSummary(item)}
                          </button>
                        ) : (
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <EmailPrivacyText
                              className="truncate font-mono text-[13px]"
                              text={item.name}
                            />
                            {fileMeta(item)}
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="max-sm:hidden"
                          onClick={() => {
                            void openErrorLog(item);
                          }}
                          disabled={disableControls}
                        >
                          {t('logs.error_logs_open')}
                        </Button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="max-sm:size-10"
                              aria-label={t('logs.error_logs_download')}
                              onClick={() => downloadErrorLog(item.name)}
                              disabled={disableControls}
                            >
                              <HugeiconsIcon icon={Download01Icon} strokeWidth={1.75} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('logs.error_logs_download')}</TooltipContent>
                        </Tooltip>
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

        <Sheet
          open={detail !== null}
          onOpenChange={(open) => {
            if (!open) setDetail(null);
          }}
        >
          <SheetContent side="bottom" className={SHEET_CLASS}>
            <SheetHeader>
              <SheetTitle
                className={cn(
                  'font-mono wrap-break-word',
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
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-4">
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
            </div>
            <div className="flex flex-col gap-2 border-t p-4">
              {detail?.requestId && canOpenRequestLog(detail) && (
                <Button
                  variant="outline"
                  size="lg"
                  className="h-10"
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
                className="h-10"
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
          <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-4xl">
            <DialogHeader className="min-w-0 pr-8">
              {/* Phone names an error file by when and where it failed, like its row. */}
              {phone && selectedErrorLog && viewerFile ? (
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
                  <DialogDescription className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {selectedErrorLog && (
                      <>
                        <span>
                          {t('logs.error_logs_size')}: {formatSize(selectedErrorLog.size) || '-'}
                        </span>
                        <span>
                          {t('logs.error_logs_modified')}:{' '}
                          {phone
                            ? errorFileTime(selectedErrorLog) || '-'
                            : selectedErrorLog.modified
                              ? formatUnixTimestamp(selectedErrorLog.modified)
                              : '-'}
                        </span>
                      </>
                    )}
                  </DialogDescription>
                </>
              )}
            </DialogHeader>
            <div
              ref={viewerScrollRef}
              className="relative min-h-0 overflow-auto rounded-lg border bg-background"
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
                      className="w-max min-w-full p-4 font-mono text-[12.5px] leading-5 whitespace-pre text-foreground max-sm:w-auto max-sm:p-3 max-sm:text-xs max-sm:wrap-break-word max-sm:whitespace-pre-wrap"
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
