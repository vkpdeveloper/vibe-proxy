import { parseLogLine } from '@/features/logs/model/logParsing';
import {
  resolveStatusGroup,
  type ParsedLogLine,
  type HttpMethod,
  type StatusGroup,
} from '@/features/logs/model/logTypes';
import type { LogBuffer } from './logBuffer';

export type LogEntry = ParsedLogLine & { id: number };

// Older dashboard builds poll /v0/management, current ones /v8/management.
const MANAGEMENT_PATH_REGEX = /^\/v\d+\/management(?:\/|$)/;
const TIMESTAMP_PARTS_REGEX = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/;

/** Cache only the current buffer. Repeated text remains separate records. */
export function createLogParserCache() {
  let cache = new Map<number, LogEntry>();
  return (buffer: LogBuffer): LogEntry[] => {
    const next = new Map<number, LogEntry>();
    const entries = buffer.buffer.map((raw, index) => {
      const id = buffer.bufferStart + index;
      const previous = cache.get(id);
      const entry = previous?.raw === raw ? previous : { ...parseLogLine(raw), id };
      next.set(id, entry);
      return entry;
    });
    cache = next;
    return entries;
  };
}

export function searchLogEntries(
  entries: LogEntry[],
  query: string,
  hideManagement: boolean
): LogEntry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (hideManagement && entry.path && MANAGEMENT_PATH_REGEX.test(entry.path)) return false;
    return !needle || entry.raw.toLowerCase().includes(needle);
  });
}

export function filterLogEntries(
  entries: LogEntry[],
  filters: {
    methods: Set<HttpMethod>;
    statuses: Set<StatusGroup>;
    paths: Set<string>;
    level: string;
  }
): LogEntry[] {
  return entries.filter((entry) => {
    if (filters.level && entry.level !== filters.level) return false;
    if (filters.methods.size && (!entry.method || !filters.methods.has(entry.method))) return false;
    const group = resolveStatusGroup(entry.statusCode);
    if (filters.statuses.size && (!group || !filters.statuses.has(group))) return false;
    return !filters.paths.size || Boolean(entry.path && filters.paths.has(entry.path));
  });
}

/** "2026-11-22 17:39:57.123" becomes date "2026-11-22" and time "17:39:57". */
export function splitLogTimestamp(value: string): { date?: string; time: string } {
  const match = value.match(TIMESTAMP_PARTS_REGEX);
  return match ? { date: match[1], time: match[2] } : { time: value };
}

export type LogRowItem =
  { kind: 'date'; date: string; key: string } | { kind: 'entry'; entry: LogEntry };

/**
 * Rows only show the time, so a date divider opens the list and marks every date change.
 * Lines without a timestamp stay under the last seen date.
 */
export function withDateDividers(entries: LogEntry[]): LogRowItem[] {
  const items: LogRowItem[] = [];
  let currentDate: string | undefined;
  for (const entry of entries) {
    const date = entry.timestamp && splitLogTimestamp(entry.timestamp).date;
    if (date && date !== currentDate) {
      items.push({ kind: 'date', date, key: `date-${entry.id}` });
      currentDate = date;
    }
    items.push({ kind: 'entry', entry });
  }
  return items;
}
