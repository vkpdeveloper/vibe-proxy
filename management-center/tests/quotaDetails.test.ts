/**
 * Saved quota cards and the server-poll merge.
 */

import { describe, expect, test } from 'bun:test';
import {
  mergePolledQuota,
  readSavedQuotaCard,
  resolveQuotaCard,
} from '@/features/quota/quotaDetails';
import type { AuthFileItem, ClaudeQuotaState, XaiQuotaState } from '@/types';

const savedAt = '2026-10-30T10:00:00Z';
const claudeCard: ClaudeQuotaState = {
  status: 'success',
  planType: 'plan_max',
  windows: [
    {
      id: 'five-hour',
      label: '5-hour limit',
      usedPercent: 10,
      resetLabel: '10/30, 15:00',
      resetAtMs: Date.parse('2026-10-30T15:00:00Z'),
      periodHours: 5,
    },
    {
      id: 'seven-day',
      label: '7-day limit',
      usedPercent: 20,
      resetLabel: '11/04, 16:00',
      resetAtMs: Date.parse('2026-11-04T16:00:00Z'),
      periodHours: 168,
    },
  ],
};

const claudeFile = (overrides: Partial<AuthFileItem> = {}): AuthFileItem => ({
  name: 'claude-a.json',
  type: 'claude',
  quota_details: { saved_at: savedAt, data: { version: 1, type: 'claude', state: claudeCard } },
  ...overrides,
});

const polled = (
  fetchedAt: string,
  windows: NonNullable<AuthFileItem['quota_capacity']>['windows']
) => ({
  quota_capacity: { provider: 'claude', supported: true, fetched_at: fetchedAt, windows },
});

describe('readSavedQuotaCard', () => {
  test('returns the saved card with its save time', () => {
    const card = readSavedQuotaCard('claude', claudeFile());
    expect(card?.state).toEqual(claudeCard);
    expect(card?.fetchedAtMs).toBe(Date.parse(savedAt));
  });

  test('ignores saves from another provider, an old version, or a failed fetch', () => {
    expect(readSavedQuotaCard('codex', claudeFile())).toBeNull();
    const old = claudeFile({
      quota_details: { saved_at: savedAt, data: { version: 0, type: 'claude', state: claudeCard } },
    });
    expect(readSavedQuotaCard('claude', old)).toBeNull();
    const failed = claudeFile({
      quota_details: {
        saved_at: savedAt,
        data: { version: 1, type: 'claude', state: { status: 'error', windows: [] } },
      },
    });
    expect(readSavedQuotaCard('claude', failed)).toBeNull();
  });
});

describe('mergePolledQuota', () => {
  const newerWindow = {
    id: 'five-hour',
    label: '5-hour limit',
    used_percent: 64,
    remaining_percent: 36,
    reset_at: '2026-10-30T16:00:00Z',
    known: true,
    routing: true,
  };

  test('takes newer poll numbers for windows with the same id and keeps the rest', () => {
    const file = claudeFile(polled('2026-10-30T10:05:00Z', [newerWindow]));
    const merged = mergePolledQuota(
      'claude',
      readSavedQuotaCard('claude', file)!,
      file
    ) as ClaudeQuotaState;

    expect(merged.planType).toBe('plan_max');
    expect(merged.windows[0].usedPercent).toBe(64);
    expect(merged.windows[0].resetAtMs).toBe(Date.parse('2026-10-30T16:00:00Z'));
    expect(merged.windows[0].resetLabel).not.toBe('10/30, 15:00');
    expect(merged.windows[1]).toEqual(claudeCard.windows[1]);
  });

  test('never overwrites a card that is newer than the poll', () => {
    const file = claudeFile(polled('2026-10-30T09:55:00Z', [newerWindow]));
    expect(mergePolledQuota('claude', readSavedQuotaCard('claude', file)!, file)).toBe(claudeCard);
  });

  test('ignores windows whose usage is unknown', () => {
    const file = claudeFile(polled('2026-10-30T10:05:00Z', [{ ...newerWindow, known: false }]));
    expect(mergePolledQuota('claude', readSavedQuotaCard('claude', file)!, file)).toBe(claudeCard);
  });

  test('merges the xAI weekly window into the billing summary', () => {
    const xai: XaiQuotaState = {
      status: 'success',
      billing: {
        mode: 'billing',
        periodType: 'weekly',
        usagePercent: 10,
        productUsage: [],
        monthlyLimitCents: null,
        usedCents: null,
        includedUsedCents: null,
        onDemandCapCents: null,
        onDemandUsedCents: null,
        onDemandUsedPercent: null,
        usedPercent: null,
      },
    };
    const file: AuthFileItem = {
      name: 'xai.json',
      type: 'xai',
      quota_capacity: {
        provider: 'xai',
        supported: true,
        fetched_at: '2026-10-30T10:05:00Z',
        windows: [{ ...newerWindow, id: 'weekly', used_percent: 18 }],
      },
    };
    const merged = mergePolledQuota('xai', { state: xai, fetchedAtMs: Date.parse(savedAt) }, file);
    expect((merged as XaiQuotaState).billing?.usagePercent).toBe(18);
  });
});

describe('resolveQuotaCard', () => {
  test('falls back to the saved card while nothing was fetched in this session', () => {
    expect(resolveQuotaCard('claude', claudeFile(), undefined)).toEqual(claudeCard);
    expect(resolveQuotaCard('claude', claudeFile(), { status: 'idle' })).toEqual(claudeCard);
  });

  test('a card fetched in this session wins over the saved one', () => {
    const live: ClaudeQuotaState = { ...claudeCard, planType: 'plan_pro' };
    expect(resolveQuotaCard('claude', claudeFile(), live)).toBe(live);
  });
});
