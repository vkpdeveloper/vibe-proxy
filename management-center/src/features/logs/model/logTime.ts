import { isRecord } from '@/utils/helpers';

const WALL_CLOCK_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):?(\d{2}):?(\d{2}))?/;
const ERROR_LOG_NAME_REGEX = /^error-(.+)-(\d{4}-\d{2}-\d{2}T\d{6})(?:-\d+)?-([^-]+)\.log$/;

function wallClockParts(value: string) {
  const match = value.match(WALL_CLOCK_REGEX);
  if (!match) return null;
  const [, year, month, day, hours = '0', minutes = '0', seconds = '0'] = match;
  return [
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  ] as const;
}

/**
 * Log lines and log file names carry the server's clock reading with no time zone.
 * Reading them as local time keeps that same reading when formatted.
 */
export function parseWallClock(value: string): Date | null {
  const parts = wallClockParts(value);
  if (!parts) return null;
  const date = new Date(...parts);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The instant a server clock reading stands for, given the server's UTC offset in
 * minutes, so it formats in the viewer's own time zone. Without the offset it falls
 * back to the server's reading.
 */
export function logInstant(value: string, offsetMinutes: number | null): Date | null {
  if (offsetMinutes === null) return parseWallClock(value);
  const parts = wallClockParts(value);
  if (!parts) return null;
  const date = new Date(Date.UTC(...parts) - offsetMinutes * 60_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The server's UTC offset in minutes, learned from one logs response: the server
 * reports its newest line's time as Unix seconds (`latest-timestamp`), and that line
 * carries the same moment as a clock reading. Null unless the two differ by whole
 * quarter hours within real time zone bounds, so a stale or unrelated value never
 * shifts the clock.
 */
export function serverUtcOffset(lines: string[], latestUnix: number | undefined): number | null {
  if (!latestUnix) return null;
  let newest: number | null = null;
  for (const line of lines) {
    const parts = line.startsWith('[') ? wallClockParts(line.slice(1)) : null;
    if (!parts) continue;
    const reading = Date.UTC(...parts) / 1000;
    if (newest === null || reading > newest) newest = reading;
  }
  if (newest === null) return null;
  const offsetSeconds = newest - latestUnix;
  if (offsetSeconds % 900 !== 0 || Math.abs(offsetSeconds) > 14 * 3600) return null;
  return offsetSeconds / 60;
}

/** Error log files are named `error-<path with "-" for "/">-<server time>-<request id>.log`. */
export function parseErrorLogName(name: string) {
  const match = name.match(ERROR_LOG_NAME_REGEX);
  if (!match) return null;
  return { endpoint: match[1], time: match[2], requestId: match[3] };
}

/**
 * The status a request log ended with: the response sent to the client, else the
 * upstream error status.
 */
export function requestLogStatus(text: string): number | null {
  const match = text.match(/^Status: (\d{3})\s*$/m) ?? text.match(/^HTTP Status: (\d{3})\s*$/m);
  return match ? Number(match[1]) : null;
}

/**
 * Where the response part of a request log starts: the upstream error or response,
 * else the response sent to the client. Headers and the request body come before it
 * and can run to hundreds of kilobytes.
 */
export function responseSectionStart(text: string): number | null {
  const match = /^=== (?:API ERROR RESPONSE|API RESPONSE|RESPONSE) ===$/m.exec(text);
  return match ? match.index : null;
}

/**
 * The error message in a request log's response, from a JSON body line such as
 * `{"error":{"message":"..."}}` or `{"message":"..."}`.
 */
export function responseErrorMessage(text: string): string | null {
  const start = responseSectionStart(text);
  if (start === null) return null;
  for (const line of text.slice(start).split('\n')) {
    if (!line.startsWith('{')) continue;
    let body: unknown;
    try {
      body = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(body)) continue;
    const message = isRecord(body.error) ? body.error.message : (body.message ?? body.error);
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return null;
}
