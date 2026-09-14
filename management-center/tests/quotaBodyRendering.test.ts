/**
 * Provider bodies rendered end-to-end.
 *
 * Bodies receive their class map as a prop and import no stylesheet, so unlike
 * QuotaCard they can be rendered directly here — which is the only place the
 * "absolute plus countdown" pairing is checked as actual markup rather than as
 * a formatter's return value.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { CodexQuotaBody } from '@/features/quota/providers/codex/CodexQuotaBody';
import { ClaudeQuotaBody } from '@/features/quota/providers/claude/ClaudeQuotaBody';
import { CursorQuotaBody } from '@/features/quota/providers/cursor/CursorQuotaBody';
import { DevinCliQuotaBody } from '@/features/quota/providers/devinCli/DevinCliQuotaBody';
import { KimiQuotaBody } from '@/features/quota/providers/kimi/KimiQuotaBody';
import { XaiQuotaBody } from '@/features/quota/providers/xai/XaiQuotaBody';
import {
  getResetDisplayFormats,
  getResetDisplayValue,
  useQuotaResetDisplayStore,
} from '@/features/quota/components/resetDisplayFormats';
import { QUOTA_CLASS_KEYS, bindQuotaClasses } from '@/features/quota/types';
import { buildResetDisplay, formatInstantShort } from '@/utils/quota';
import { DAY_MS, HOUR_MS } from '@/utils/time/durations';
import type {
  ClaudeQuotaState,
  CodexQuotaState,
  CursorQuotaState,
  DevinCliQuotaState,
  KimiQuotaState,
  XaiQuotaState,
} from '@/types';

const classes = bindQuotaClasses(
  Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])),
  'test-host'
);

/**
 * useNow() freezes to module-load time under renderToStaticMarkup (it reads
 * getServerSnapshot), so instants are placed relative to the real clock.
 */
const now = Date.now();

// The i18n fallback is zh-CN; pin English so the countdown assertions read.
beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('CodexQuotaBody', () => {
  const quota: CodexQuotaState = {
    status: 'success',
    planType: 'pro',
    windows: [
      {
        id: 'primary',
        label: '5-hour limit',
        usedPercent: 38,
        resetLabel: '08-02 18:00',
        resetAtMs: now + 3 * HOUR_MS,
        periodHours: 5,
      },
    ],
    rateLimitResetCredits: [
      {
        id: 'credit-1',
        status: 'available',
        grantedAt: new Date(now - DAY_MS).toISOString(),
        expiresAt: new Date(now + 11 * DAY_MS).toISOString(),
      },
    ],
    rateLimitResetCreditsAvailableCount: 1,
  };

  test('renders a window reset as a clickable compact timestamp', () => {
    const markup = renderToStaticMarkup(createElement(CodexQuotaBody, { quota, classes }));

    expect(markup).toContain('08-02 18:00');
    expect(markup).toContain('aria-label="Change reset time format"');
  });

  test('renders reset-credit expiry in local time as a cycling control', () => {
    const markup = renderToStaticMarkup(createElement(CodexQuotaBody, { quota, classes }));

    expect(markup).toContain(formatInstantShort(now + 11 * DAY_MS));
    expect(markup).toContain('quotaResetCycle');
  });

  test('highlights a credit expiring within the final hour', () => {
    const creditFirst: CodexQuotaState = {
      ...quota,
      windows: [{ ...quota.windows[0], resetAtMs: now + 5 * DAY_MS }],
      rateLimitResetCredits: [
        {
          id: 'credit-1',
          status: 'available',
          grantedAt: new Date(now - DAY_MS).toISOString(),
          expiresAt: new Date(now + 30 * 60_000).toISOString(),
        },
      ],
    };
    const markup = renderToStaticMarkup(
      createElement(CodexQuotaBody, { quota: creditFirst, classes })
    );

    expect(markup).toContain('codexResetCreditRowSoon');
    expect(markup).not.toContain('quotaRowSoon');
  });

  test('does not emphasize a reset countdown more than one hour away', () => {
    const markup = renderToStaticMarkup(createElement(CodexQuotaBody, { quota, classes }));

    expect(markup).not.toContain('quotaRowSoon');
    expect(markup).not.toContain('quotaResetRelativeSoon');
    expect(markup).not.toContain('codexResetCreditRowSoon');
  });

  test('emphasizes a reset countdown within the final hour', () => {
    const urgent: CodexQuotaState = {
      ...quota,
      windows: [{ ...quota.windows[0], resetAtMs: now + 30 * 60_000 }],
    };
    const markup = renderToStaticMarkup(createElement(CodexQuotaBody, { quota: urgent, classes }));

    expect(markup).toContain('quotaResetRelativeSoon');
  });

  test('highlights nothing once every instant is in the past', () => {
    const stale: CodexQuotaState = {
      ...quota,
      windows: [{ ...quota.windows[0], resetAtMs: now - HOUR_MS }],
      rateLimitResetCredits: [],
      rateLimitResetCreditsAvailableCount: null,
    };
    const markup = renderToStaticMarkup(createElement(CodexQuotaBody, { quota: stale, classes }));

    expect(markup).not.toContain('Soon');
  });

  test('keeps the baked label alone when the store entry predates resetAtMs', () => {
    const stale: CodexQuotaState = {
      ...quota,
      windows: [{ ...quota.windows[0], resetAtMs: undefined, periodHours: undefined }],
      rateLimitResetCredits: [],
      rateLimitResetCreditsAvailableCount: null,
    };
    const markup = renderToStaticMarkup(createElement(CodexQuotaBody, { quota: stale, classes }));

    expect(markup).toContain('08-02 18:00');
    expect(markup).not.toContain('quotaResetCycle');
  });
});

describe('KimiQuotaBody', () => {
  test('renders the concrete reset time as a cycling control', () => {
    const resetAtMs = now + 3 * HOUR_MS;
    const quota: KimiQuotaState = {
      status: 'success',
      rows: [
        {
          id: 'summary',
          label: 'Weekly limit',
          used: 34,
          limit: 100,
          resetHint: '3h',
          resetAtMs,
          periodHours: 168,
        },
      ],
    };
    const markup = renderToStaticMarkup(createElement(KimiQuotaBody, { quota, classes }));

    expect(markup).toContain(formatInstantShort(resetAtMs));
    expect(markup).toContain('quotaResetCycle');
    expect(markup).not.toContain('resets in 3h');
  });
});

describe('reset time formats', () => {
  test('cycles compact, relative, and full formats before returning to compact', () => {
    const display = buildResetDisplay(null, now + 3 * HOUR_MS, now, 'en');
    expect(display).not.toBeNull();
    const formats = getResetDisplayFormats(display!);

    expect(formats).toHaveLength(3);
    expect(formats[0]).toBe(formatInstantShort(now + 3 * HOUR_MS));
    expect(formats[1]).toMatch(/3 hours/);
    expect(formats[2]).not.toBe(formats[0]);
  });

  test('one shared cycle changes the display value used by every card', () => {
    const first = buildResetDisplay(null, now + 3 * HOUR_MS, now, 'en')!;
    const second = buildResetDisplay(null, now + 5 * DAY_MS, now, 'en')!;
    const displayBoth = () => {
      const { mode } = useQuotaResetDisplayStore.getState();
      return [getResetDisplayValue(first, mode), getResetDisplayValue(second, mode)];
    };

    useQuotaResetDisplayStore.getState().setMode('compact');
    expect(displayBoth()).toEqual([first.absolute, second.absolute]);

    useQuotaResetDisplayStore.getState().cycleMode();
    expect(displayBoth()).toEqual([first.relative, second.relative]);

    useQuotaResetDisplayStore.getState().cycleMode();
    expect(displayBoth()).toEqual([first.full, second.full]);

    useQuotaResetDisplayStore.getState().cycleMode();
    expect(useQuotaResetDisplayStore.getState().mode).toBe('compact');
  });
});

describe('CursorQuotaBody', () => {
  test('explains the two monthly pools without rendering the aggregate as a third pool', () => {
    const quota: CursorQuotaState = {
      status: 'success',
      planType: 'Pro',
      windows: [
        {
          id: 'cursor-models',
          label: 'Cursor Models',
          labelKey: 'cursor_quota.cursor_models',
          descriptionKey: 'cursor_quota.cursor_models_desc',
          usedPercent: 2,
          resetAtMs: now + 30 * DAY_MS,
          periodHours: 720,
        },
        {
          id: 'other-models',
          label: 'Other Models',
          labelKey: 'cursor_quota.other_models',
          descriptionKey: 'cursor_quota.other_models_desc',
          usedPercent: 0,
          resetAtMs: now + 30 * DAY_MS,
          periodHours: 720,
        },
      ],
    };
    const markup = renderToStaticMarkup(createElement(CursorQuotaBody, { quota, classes }));

    expect(markup).toContain('Cursor Models');
    expect(markup).toContain('Cursor Grok and Composer');
    expect(markup).toContain('Other Models');
    expect(markup).toContain('Claude, GPT, Gemini');
    expect(markup).toContain('98% left');
    expect(markup).toContain('100% left');
    expect(markup).not.toContain('Included usage');
  });

  test('renders Grok Bot as a separate weekly meter with its own reset', () => {
    const resetAtMs = now + 5 * DAY_MS;
    const quota: CursorQuotaState = {
      status: 'success',
      windows: [
        {
          id: 'grok-bot',
          label: 'Grok Bot · Weekly usage',
          labelKey: 'cursor_quota.grok_bot_weekly',
          descriptionKey: 'cursor_quota.grok_bot_weekly_desc',
          usedPercent: 9,
          resetAtMs,
          periodHours: 168,
        },
      ],
    };
    const markup = renderToStaticMarkup(createElement(CursorQuotaBody, { quota, classes }));

    expect(markup).toContain('Grok Bot · Weekly usage');
    expect(markup).toContain('91% left');
    expect(markup).toContain('Separate allowance included with your Cursor plan');
    expect(markup).toContain(formatInstantShort(resetAtMs));
    expect(markup).toContain('aria-label="Change reset time format"');
  });
});

describe('ClaudeQuotaBody', () => {
  test('makes every window reset format clickable', () => {
    const quota: ClaudeQuotaState = {
      status: 'success',
      windows: [
        {
          id: 'five_hour',
          label: '5-hour',
          usedPercent: 12,
          resetLabel: '08-02 17:00',
          resetAtMs: now + 2 * HOUR_MS,
          periodHours: 5,
        },
        {
          id: 'seven_day',
          label: '7-day',
          usedPercent: 60,
          resetLabel: '08-06 04:00',
          resetAtMs: now + 4 * DAY_MS,
          periodHours: 168,
        },
      ],
    };
    const markup = renderToStaticMarkup(createElement(ClaudeQuotaBody, { quota, classes }));

    expect(markup).toContain('08-02 17:00');
    expect(markup).toContain('08-06 04:00');
    expect(markup.match(/aria-label="Change reset time format"/g)).toHaveLength(2);
  });
});

describe('DevinCliQuotaBody', () => {
  test('renders plan chip, daily and weekly meters, and the overage balance', () => {
    const quota: DevinCliQuotaState = {
      status: 'success',
      planType: 'Pro',
      planEndMs: now + 20 * DAY_MS,
      overageBalanceUsd: 45.23,
      windows: [
        {
          id: 'daily',
          label: 'Daily quota',
          labelKey: 'devin_cli_quota.daily',
          descriptionKey: 'devin_cli_quota.daily_desc',
          usedPercent: 25,
          resetAtMs: now + 6 * HOUR_MS,
          periodHours: 24,
        },
        {
          id: 'weekly',
          label: 'Weekly quota',
          labelKey: 'devin_cli_quota.weekly',
          descriptionKey: 'devin_cli_quota.weekly_desc',
          usedPercent: 60,
          resetAtMs: now + 3 * DAY_MS,
          periodHours: 168,
        },
      ],
    };
    const markup = renderToStaticMarkup(createElement(DevinCliQuotaBody, { quota, classes }));

    expect(markup).toContain('Pro');
    expect(markup).toContain('Daily quota');
    expect(markup).toContain('Weekly quota');
    expect(markup).toContain('75% left');
    expect(markup).toContain('40% left');
    expect(markup).toContain('Devin daily ACU allowance');
    expect(markup).toContain('$45.23');
    expect(markup).toContain('Extra usage balance');
    expect(markup.match(/aria-label="Change reset time format"/g)).toHaveLength(3);
  });
});

describe('XaiQuotaBody', () => {
  const xaiBilling = {
    mode: 'billing' as const,
    periodType: 'weekly' as const,
    usagePercent: 7,
    periodStart: '2026-09-11T17:32:46Z',
    periodEnd: '2026-09-18T17:32:46Z',
    productUsage: [{ product: 'GrokBuild', usagePercent: 7 }],
    monthlyLimitCents: 0,
    usedCents: 0,
    includedUsedCents: 0,
    onDemandCapCents: 0,
    onDemandUsedCents: 0,
    onDemandUsedPercent: 0,
    usedPercent: 7,
    resetAtMs: now + 4 * DAY_MS,
    periodHours: 168,
  };

  test('renders the Grok Bot window borrowed from the Cursor credential', () => {
    const quota: XaiQuotaState = {
      status: 'success',
      billing: xaiBilling,
      grokBot: { usedPercent: 16.35, resetAtMs: now + 2 * DAY_MS },
    };
    const markup = renderToStaticMarkup(createElement(XaiQuotaBody, { quota, classes }));

    expect(markup).toContain('Weekly limit');
    expect(markup).toContain('Grok Bot');
    expect(markup).toContain('bundled with the Cursor plan');
    expect(markup).toContain('Used 16%');
  });

  test('omits the Grok Bot row when no Cursor credential reports it', () => {
    const quota: XaiQuotaState = { status: 'success', billing: xaiBilling };
    const markup = renderToStaticMarkup(createElement(XaiQuotaBody, { quota, classes }));

    expect(markup).not.toContain('Grok Bot');
  });
});
