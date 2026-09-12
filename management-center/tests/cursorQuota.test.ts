import { describe, expect, test } from 'bun:test';
import type { TFunction } from 'i18next';
import { CURSOR_CONFIG, buildCursorQuotaData } from '@/features/quota/providers/cursor/data';

const t = ((key: string) => key) as TFunction;

describe('Cursor quota', () => {
  test('maps dashboard pools, spend, plan, and billing reset', () => {
    const data = buildCursorQuotaData(
      {
        billingCycleStart: '2026-09-01T00:00:00Z',
        billingCycleEnd: '2026-10-01T00:00:00Z',
        planUsage: {
          totalSpend: 2450,
          includedSpend: 2000,
          bonusSpend: 450,
          limit: 7000,
          totalPercentUsed: 35,
          autoPercentUsed: 20,
          apiPercentUsed: 55,
        },
        spendLimitUsage: {
          pooledLimit: 10000,
          pooledUsed: 1250,
          pooledRemaining: 8750,
        },
      },
      {
        planInfo: {
          planName: 'Pro Plus',
          includedAmountCents: 7000,
        },
      },
      t
    );

    expect(data.planType).toBe('Pro Plus');
    expect(data.billingCycleEnd).toBe('2026-10-01T00:00:00Z');
    expect(data.onDemandUsedCents).toBe(1250);
    expect(data.onDemandLimitCents).toBe(10000);
    expect(data.windows.map((window) => [window.id, window.usedPercent])).toEqual([
      ['cursor-models', 20],
      ['other-models', 55],
    ]);
    expect(data.windows[0].periodHours).toBe(30 * 24);
    expect(data.windows[0].descriptionKey).toBe('cursor_quota.cursor_models_desc');
  });

  test('falls back to plan info for the included limit and derives percent', () => {
    const data = buildCursorQuotaData(
      {
        billingCycleEnd: '2026-10-01T00:00:00Z',
        planUsage: { totalSpend: 2000, limit: 0 },
      },
      { planInfo: { includedAmountCents: 8000 } },
      t
    );

    expect(data.windows).toHaveLength(1);
    expect(data.windows[0].usedPercent).toBe(25);
    expect(data.windows[0].id).toBe('plan');
    expect(data.windows[0].labelKey).toBe('cursor_quota.overall_included_usage');
    expect(data.windows[0].limitCents).toBe(8000);
    expect(data.windows[0].periodHours).toBeNull();
  });

  test('adds the separate Grok Bot weekly meter and reset', () => {
    const data = buildCursorQuotaData({ planUsage: { autoPercentUsed: 1 } }, {}, t, {
      currentPeriodStart: '2026-09-09T00:00:00Z',
      nextResetTimestampUtc: '2026-09-16T00:00:00Z',
      usagePercent: 9,
      grokPlanLabel: 'Included in Pro',
    });

    expect(data.windows).toContainEqual(
      expect.objectContaining({
        id: 'grok-bot',
        labelKey: 'cursor_quota.grok_bot_weekly',
        usedPercent: 9,
        resetAtMs: Date.parse('2026-09-16T00:00:00Z'),
        periodHours: 7 * 24,
      })
    );
  });

  test('omits pooled enterprise Grok Bot allowances with different semantics', () => {
    const data = buildCursorQuotaData({ planUsage: { totalPercentUsed: 10 } }, {}, t, {
      usagePercent: 40,
      usesPooledEnterpriseAllowance: true,
    });

    expect(data.windows.map((window) => window.id)).toEqual(['plan']);
  });

  test('recognizes enabled Cursor tracker auth files only', () => {
    expect(CURSOR_CONFIG.filterFn({ name: 'cursor.json', type: 'cursor' })).toBe(true);
    expect(
      CURSOR_CONFIG.filterFn({ name: 'cursor.json', provider: 'cursor', disabled: true })
    ).toBe(false);
    expect(CURSOR_CONFIG.filterFn({ name: 'codex.json', type: 'codex' })).toBe(false);
  });
});
