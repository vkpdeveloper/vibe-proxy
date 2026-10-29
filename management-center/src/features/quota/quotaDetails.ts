/**
 * Saved quota cards.
 *
 * Every successful fetch saves the full card state on the server, so a reload
 * renders the same rich card instead of the bare `quota_capacity` snapshot.
 * The server's background poll keeps `quota_capacity` fresh, and its windows
 * use the same row ids as the cards, so newer percentages and reset times from
 * the poll are merged into the card.
 */

import { authFilesApi } from '@/services/api/authFiles';
import { useQuotaStore } from '@/stores/useQuotaStore';
import type { AuthFileItem, QuotaCapacityWindow } from '@/types';
import { formatQuotaResetTime, parseIsoToMs } from '@/utils/quota';
import { getQuotaCacheFileName, getQuotaCacheKey } from '@/utils/quota/identity';
import { QUOTA_ADAPTERS, type QuotaCardState } from './providers';
import type { QuotaProviderType, QuotaStore } from './providers/types';

/** Bump when a provider's card state changes shape, so old saves are ignored. */
const QUOTA_DETAILS_VERSION = 1;

interface SavedQuotaDetails {
  version: number;
  type: QuotaProviderType;
  state: QuotaCardState;
}

export interface ResolvedQuotaCard {
  state: QuotaCardState;
  /** When the card's own data was fetched; null when unknown. */
  fetchedAtMs: number | null;
}

const isSavedQuotaDetails = (value: unknown): value is SavedQuotaDetails => {
  if (!value || typeof value !== 'object') return false;
  const saved = value as Partial<SavedQuotaDetails>;
  return (
    saved.version === QUOTA_DETAILS_VERSION &&
    typeof saved.type === 'string' &&
    Boolean(saved.state) &&
    saved.state?.status === 'success'
  );
};

/** The card saved on the server for this credential, if it matches its provider. */
export function readSavedQuotaCard(
  type: QuotaProviderType,
  file: AuthFileItem
): ResolvedQuotaCard | null {
  const details = file.quota_details;
  if (!details || !isSavedQuotaDetails(details.data) || details.data.type !== type) return null;
  return { state: details.data.state, fetchedAtMs: parseIsoToMs(details.saved_at) };
}

/* ---------- Merging the server poll into a card ---------- */

interface PolledWindow {
  usedPercent: number;
  resetAtMs: number | null;
  resetAt: string | undefined;
  exhausted: boolean;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

function polledWindows(file: AuthFileItem): Map<string, PolledWindow> {
  const windows = (file.quota_capacity ?? file.quotaCapacity)?.windows ?? [];
  const byId = new Map<string, PolledWindow>();
  windows.forEach((window: QuotaCapacityWindow) => {
    if (!window || window.known !== true || typeof window.used_percent !== 'number') return;
    byId.set(window.id, {
      usedPercent: clampPercent(window.used_percent),
      resetAtMs: parseIsoToMs(window.reset_at),
      resetAt: window.reset_at,
      exhausted: window.hard_exhausted === true,
    });
  });
  return byId;
}

interface WindowRow {
  id: string;
  usedPercent: number | null;
  resetAtMs?: number | null;
  resetLabel?: string;
  rateLimited?: boolean;
}

const mergeWindowRow = <T extends WindowRow>(row: T, polled: PolledWindow): T => ({
  ...row,
  usedPercent: polled.usedPercent,
  resetAtMs: polled.resetAtMs ?? row.resetAtMs,
  ...(row.resetLabel !== undefined && polled.resetAt
    ? { resetLabel: formatQuotaResetTime(polled.resetAt) }
    : {}),
  ...(row.rateLimited !== undefined
    ? { rateLimited: polled.exhausted || polled.usedPercent >= 100 }
    : {}),
});

const mergeRows = <T extends { id: string }>(
  rows: T[] | undefined,
  polled: Map<string, PolledWindow>,
  merge: (row: T, window: PolledWindow) => T
): T[] | undefined =>
  rows?.map((row) => {
    const window = polled.get(row.id);
    return window ? merge(row, window) : row;
  });

/**
 * Card state with the server poll's percentages and reset times merged in.
 * Only applies when the poll is newer than the card's own data.
 */
export function mergePolledQuota(
  type: QuotaProviderType,
  card: ResolvedQuotaCard,
  file: AuthFileItem
): QuotaCardState {
  const capacity = file.quota_capacity ?? file.quotaCapacity;
  const polledAtMs = parseIsoToMs(capacity?.fetched_at);
  if (polledAtMs === null || card.fetchedAtMs === null || polledAtMs <= card.fetchedAtMs) {
    return card.state;
  }
  const polled = polledWindows(file);
  if (polled.size === 0) return card.state;

  switch (type) {
    case 'claude':
    case 'codex':
    case 'cursor':
    case 'devin-cli':
    case 'opencode-go': {
      const state = card.state as QuotaCardState & { windows?: WindowRow[] };
      const merged: typeof state = {
        ...state,
        windows: mergeRows(state.windows, polled, mergeWindowRow),
      };
      return merged;
    }
    case 'kimi': {
      const state = card.state as QuotaCardState & {
        rows?: { id: string; used: number; limit: number; resetAtMs?: number | null }[];
      };
      const merged: typeof state = {
        ...state,
        rows: mergeRows(state.rows, polled, (row, window) => ({
          ...row,
          used: row.limit > 0 ? Math.round((window.usedPercent / 100) * row.limit) : row.used,
          resetAtMs: window.resetAtMs ?? row.resetAtMs,
        })),
      };
      return merged;
    }
    case 'antigravity': {
      const state = card.state as QuotaCardState & {
        groups?: {
          buckets: {
            id: string;
            remainingFraction: number;
            resetTime?: string;
            resetAtMs?: number | null;
          }[];
        }[];
      };
      const merged: typeof state = {
        ...state,
        groups: state.groups?.map((group) => ({
          ...group,
          buckets:
            mergeRows(group.buckets, polled, (bucket, window) => ({
              ...bucket,
              remainingFraction: (100 - window.usedPercent) / 100,
              resetTime: window.resetAt ?? bucket.resetTime,
              resetAtMs: window.resetAtMs ?? bucket.resetAtMs,
            })) ?? group.buckets,
        })),
      };
      return merged;
    }
    case 'xai': {
      // Only the weekly window maps cleanly; the monthly row is a billing cycle
      // and Grok Bot is merged separately from quota_capacity on every render.
      const state = card.state as QuotaCardState & {
        billing?: {
          periodType: string;
          usagePercent: number | null;
          periodEnd?: string;
          resetAtMs?: number | null;
        } | null;
      };
      const weekly = polled.get('weekly');
      if (!weekly || !state.billing || state.billing.periodType !== 'weekly') return state;
      const merged: typeof state = {
        ...state,
        billing: {
          ...state.billing,
          usagePercent: weekly.usedPercent,
          periodEnd: weekly.resetAt ?? state.billing.periodEnd,
          resetAtMs: weekly.resetAtMs ?? state.billing.resetAtMs,
        },
      };
      return merged;
    }
    default:
      return card.state;
  }
}

/**
 * The card to render: one fetched in this session wins, otherwise the card
 * saved on the server. Newer numbers from the server's quota poll are merged
 * into either.
 */
export function resolveQuotaCard(
  type: QuotaProviderType,
  file: AuthFileItem,
  live: QuotaCardState | undefined
): QuotaCardState | undefined {
  const card =
    live && live.status !== 'idle'
      ? { state: live, fetchedAtMs: getCardFetchedAtMs(type, getQuotaCacheKey(file)) }
      : readSavedQuotaCard(type, file);
  if (!card) return live;
  return card.state.status === 'success' ? mergePolledQuota(type, card, file) : card.state;
}

/* ---------- Saving fetched cards ---------- */

/** Fetch time of each card fetched in this browser session, by `type:cacheKey`. */
const fetchedAtByCard = new Map<string, number>();

const cardKey = (type: QuotaProviderType, cacheKey: string) => `${type}:${cacheKey}`;

export const getCardFetchedAtMs = (type: QuotaProviderType, cacheKey: string): number | null =>
  fetchedAtByCard.get(cardKey(type, cacheKey)) ?? null;

const SAVE_DELAY_MS = 500;
const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSave(type: QuotaProviderType, cacheKey: string, state: QuotaCardState) {
  const key = cardKey(type, cacheKey);
  const pending = pendingSaves.get(key);
  if (pending) clearTimeout(pending);
  // Claude and Codex enrich a card right after the first success; wait for
  // the final state rather than saving twice.
  pendingSaves.set(
    key,
    setTimeout(() => {
      pendingSaves.delete(key);
      const name = getQuotaCacheFileName(cacheKey);
      const authIndex = cacheKey.length > name.length ? cacheKey.slice(name.length + 1) : '';
      const details: SavedQuotaDetails = { version: QUOTA_DETAILS_VERSION, type, state };
      authFilesApi
        .saveQuotaDetails({ name, authIndex: authIndex || undefined }, details)
        .catch(() => {
          // Saving is best effort; the card is still live in this session.
        });
    }, SAVE_DELAY_MS)
  );
}

let syncStarted = false;

/**
 * Save every new successful card to the server. Idempotent: the quota page and
 * the auth files page both fetch cards and both call this.
 */
export function startQuotaDetailsSync() {
  if (syncStarted) return;
  syncStarted = true;
  const providerTypes = Object.keys(QUOTA_ADAPTERS) as QuotaProviderType[];
  useQuotaStore.subscribe((next, prev) => {
    for (const type of providerTypes) {
      const adapter = QUOTA_ADAPTERS[type];
      const nextMap = adapter.storeSelector(next as unknown as QuotaStore);
      const prevMap = adapter.storeSelector(prev as unknown as QuotaStore);
      if (nextMap === prevMap) continue;
      for (const [cacheKey, state] of Object.entries(nextMap)) {
        if (state === prevMap[cacheKey] || state?.status !== 'success') continue;
        fetchedAtByCard.set(cardKey(type, cacheKey), Date.now());
        scheduleSave(type, cacheKey, state);
      }
    }
  });
}
