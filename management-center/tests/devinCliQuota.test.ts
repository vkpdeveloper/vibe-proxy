import { describe, expect, test } from 'bun:test';
import type { TFunction } from 'i18next';
import type { AuthFileItem } from '@/types';
import {
  DEVIN_CLI_CONFIG,
  buildDevinCliQuotaData,
  resolveDevinCliApiServerUrl,
} from '@/features/quota/providers/devinCli/data';

const t = ((key: string) => key) as TFunction;

const payload = (planStatus: Record<string, unknown>) => ({
  userStatus: { planStatus },
});

describe('Devin CLI quota', () => {
  test('flips remaining percent to used and keeps unix resets', () => {
    const data = buildDevinCliQuotaData(
      payload({
        planInfo: { planName: 'Pro' },
        dailyQuotaRemainingPercent: 75,
        weeklyQuotaRemainingPercent: '40',
        dailyQuotaResetAtUnix: 1758312000,
        weeklyQuotaResetAtUnix: '1758926400',
        overageBalanceMicros: '45230000',
        planEnd: '2026-04-24',
      }),
      t
    );

    expect(data.planType).toBe('Pro');
    expect(data.overageBalanceUsd).toBe(45.23);
    expect(data.planEndMs).toBe(Date.parse('2026-04-24T00:00:00Z'));
    expect(data.windows.map((window) => [window.id, window.usedPercent, window.periodHours])).toEqual(
      [
        ['daily', 25, 24],
        ['weekly', 60, 7 * 24],
      ]
    );
    expect(data.windows[0].resetAtMs).toBe(1758312000 * 1000);
    expect(data.windows[1].resetAtMs).toBe(1758926400 * 1000);
    expect(data.windows[0].labelKey).toBe('devin_cli_quota.daily');
  });

  test('hides the daily row when the plan hides it, and mirrors it into weekly', () => {
    const hidden = buildDevinCliQuotaData(
      payload({
        planInfo: { hideDailyQuota: true },
        dailyQuotaRemainingPercent: 30,
        weeklyQuotaResetAtUnix: 1758926400,
      }),
      t
    );

    expect(hidden.windows.map((window) => window.id)).toEqual(['weekly']);
    expect(hidden.windows[0].usedPercent).toBe(70);
    expect(hidden.windows[0].resetAtMs).toBe(1758926400 * 1000);

    const withWeekly = buildDevinCliQuotaData(
      payload({
        planInfo: { hideDailyQuota: true },
        dailyQuotaRemainingPercent: 30,
        weeklyQuotaRemainingPercent: 90,
      }),
      t
    );
    expect(withWeekly.windows.map((window) => [window.id, window.usedPercent])).toEqual([
      ['weekly', 10],
    ]);
  });

  test('supports snake_case keys and reports empty payloads', () => {
    const data = buildDevinCliQuotaData(
      {
        user_status: {
          plan_status: {
            plan_info: { plan_name: 'Teams' },
            weekly_quota_remaining_percent: 55.5,
          },
        },
      },
      t
    );

    expect(data.planType).toBe('Teams');
    expect(data.windows.map((window) => [window.id, window.usedPercent])).toEqual([
      ['weekly', 44.5],
    ]);

    const empty = buildDevinCliQuotaData({}, t);
    expect(empty.windows).toHaveLength(0);
    expect(empty.planType).toBeNull();
  });

  test('resolves the API server URL with https validation and defaults', () => {
    expect(resolveDevinCliApiServerUrl({ name: 'a.json' } as AuthFileItem)).toBe(
      'https://server.codeium.com'
    );
    expect(
      resolveDevinCliApiServerUrl({
        name: 'a.json',
        api_server_url: 'https://windsurf.example.com/',
      } as AuthFileItem)
    ).toBe('https://windsurf.example.com');
    expect(
      resolveDevinCliApiServerUrl({
        name: 'a.json',
        api_server_url: 'http://insecure.example.com',
      } as AuthFileItem)
    ).toBe('https://server.codeium.com');
  });

  test('recognizes enabled Devin CLI API-key credentials only', () => {
    expect(DEVIN_CLI_CONFIG.filterFn({ name: 'devin-cli.json', type: 'devin-cli' })).toBe(true);
    expect(
      DEVIN_CLI_CONFIG.filterFn({ name: 'devin-cli.json', provider: 'devin-cli', disabled: true })
    ).toBe(false);
    expect(DEVIN_CLI_CONFIG.filterFn({ name: 'codex.json', type: 'codex' })).toBe(false);
  });
});
