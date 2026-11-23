import type { AuthFileItem, QuotaCapacityState, QuotaCapacityWindow } from '@/types';
import { summarizeCooldowns } from './cooldowns';

const MIN_MEANINGFUL_DATE_MS = Date.UTC(2000, 0, 1);

export const parseMeaningfulDate = (value?: string): number | null => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= MIN_MEANINGFUL_DATE_MS ? timestamp : null;
};

export type QuotaDrainDisplay = {
  state: QuotaCapacityState;
  window: QuotaCapacityWindow | null;
  status: 'active' | 'exhausted' | 'unavailable';
  remainingPercent: number | null;
};

const tightestWindow = (windows: QuotaCapacityWindow[]) =>
  [...windows].sort((left, right) => left.remaining_percent - right.remaining_percent)[0] ?? null;

/**
 * The tightest routing window from the server's quota poll, or the tightest known window when the
 * provider marks none as routing (OpenCode Go). A stale poll still shows its last percentage:
 * the server refreshes it on its own schedule and the old number beats no number.
 */
export const resolveQuotaDrainDisplay = (
  file: AuthFileItem,
  now: number
): QuotaDrainDisplay | null => {
  const state = file.quota_capacity ?? file.quotaCapacity;
  if (!state || typeof state !== 'object') return null;

  const windows = Array.isArray(state.windows) ? state.windows : [];
  const knownWindows = windows.filter((window) => {
    if (
      !window ||
      window.known !== true ||
      typeof window.remaining_percent !== 'number' ||
      !Number.isFinite(window.remaining_percent)
    ) {
      return false;
    }
    const resetAt = parseMeaningfulDate(window.reset_at);
    return resetAt === null || resetAt > now;
  });
  const window =
    tightestWindow(knownWindows.filter((window) => window.routing === true)) ??
    tightestWindow(knownWindows);

  const remainingPercent = window ? Math.max(0, Math.min(100, window.remaining_percent)) : null;
  const status = window?.hard_exhausted
    ? 'exhausted'
    : remainingPercent !== null
      ? 'active'
      : 'unavailable';

  return { state, window, status, remainingPercent };
};

/**
 * When a failing credential should recover, if anything on it says so: a credential-wide cooldown
 * ends first, otherwise a used-up quota window resets. Other problems have no known end.
 */
export const resolveProblemResetAt = (file: AuthFileItem, now: number): number | null => {
  const snapshot = file.cooldownSnapshot;
  if (snapshot?.records?.length) {
    const { rows } = summarizeCooldowns(snapshot, now);
    const credentialSeconds = rows
      .filter((row) => row.record.scope === 'credential' && row.remainingSeconds > 0)
      .map((row) => row.remainingSeconds);
    if (credentialSeconds.length) return now + Math.min(...credentialSeconds) * 1000;
  }
  const quota = resolveQuotaDrainDisplay(file, now);
  if (!quota || (quota.status !== 'exhausted' && quota.remainingPercent !== 0)) return null;
  const resetAt = parseMeaningfulDate(quota.window?.reset_at);
  return resetAt !== null && resetAt > now ? resetAt : null;
};
