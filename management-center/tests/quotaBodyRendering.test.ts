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
import { XaiQuotaBody } from '@/features/quota/providers/xai/XaiQuotaBody';
import {
  getResetDisplayFormats,
  getResetDisplayValue,
  RESET_DISPLAY_MODES,
  useQuotaResetDisplayStore,
} from '@/features/quota/components/resetDisplayFormats';
import { QuotaMeter } from '@/features/quota/components/QuotaMeter';
import { QuotaResetLabel } from '@/features/quota/components/QuotaResetLabel';
import { QUOTA_CLASS_KEYS, bindQuotaClasses } from '@/features/quota/types';
import { buildResetDisplay, formatInstantShort } from '@/utils/quota';
import { DAY_MS, HOUR_MS } from '@/utils/time/durations';
import type {
  ClaudeQuotaState,
  CodexQuotaState,
  CursorQuotaState,
  DevinCliQuotaState,
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

  test.each(['en', 'zh-CN', 'zh-TW', 'ru'])(
    'renders Business Premium with its premium badge in %s',
    async (language) => {
      await i18n.changeLanguage(language);
      try {
        for (const planType of ['self_serve_business_prolite', '  SELF_SERVE_BUSINESS_PROLITE  ']) {
          const markup = renderToStaticMarkup(
            createElement(CodexQuotaBody, { quota: { ...quota, planType }, classes })
          );
          expect(markup).toContain('<span class="premiumPlanValue">Business Premium</span>');
          expect(markup).not.toContain('self_serve_business_prolite');
        }
      } finally {
        await i18n.changeLanguage('en');
      }
    }
  );

  test.each([
    ['pro', 'Pro 200', 'elitePlanValue'],
    ['prolite', 'Pro 100', 'premiumPlanValue'],
    ['team', 'Team', 'codexPlanValue'],
    ['self_serve_business_usage_based', 'self_serve_business_usage_based', 'codexPlanValue'],
  ])('preserves the label and badge for %s', (planType, label, className) => {
    const markup = renderToStaticMarkup(
      createElement(CodexQuotaBody, { quota: { ...quota, planType }, classes })
    );
    expect(markup).toContain(`<span class="${className}">${label}</span>`);
  });

  test.each([
    ['en', 'Balance', 'Unlimited'],
    ['zh-CN', '余额', '无限额'],
    ['zh-TW', '餘額', '無限額'],
    ['ru', 'Баланс', 'Без ограничений'],
  ])(
    'renders account credits independently of manual resets in %s',
    async (language, label, unlimited) => {
      await i18n.changeLanguage(language);
      try {
        const balance = renderToStaticMarkup(
          createElement(CodexQuotaBody, {
            quota: { ...quota, creditBalance: '51649.1093280000' },
            classes,
          })
        );
        expect(balance).toContain(label);
        // The raw API decimal is grouped and rounded to 2 decimals for the locale.
        const grouped = new Intl.NumberFormat(language, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(51649.109328);
        expect(balance).toContain(
          `<span class="codexPlanValue">${i18n.t('codex_quota.credit_balance_value', { amount: grouped })}</span>`
        );
        if (language === 'en') expect(balance).toContain('51,649.11 credits');
        const infinite = renderToStaticMarkup(
          createElement(CodexQuotaBody, {
            quota: { ...quota, creditBalance: null, creditsUnlimited: true },
            classes,
          })
        );
        expect(infinite).toContain(label);
        expect(infinite).toContain(unlimited);
        const absent = renderToStaticMarkup(createElement(CodexQuotaBody, { quota, classes }));
        expect(absent).not.toContain(label);
      } finally {
        await i18n.changeLanguage('en');
      }
    }
  );

  test('renders a window reset as a countdown by default', () => {
    const markup = renderToStaticMarkup(createElement(CodexQuotaBody, { quota, classes }));

    expect(markup).toContain('in 3 hours');
    expect(markup).toContain('aria-label="Change reset time format"');
  });

  test('renders reset-credit expiry as a cycling control', () => {
    const markup = renderToStaticMarkup(createElement(CodexQuotaBody, { quota, classes }));

    expect(markup).toContain('in 11 days');
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

  test('keeps a near reset muted while plenty is left', () => {
    // Amber means "running low", not "resets soon": 62% left, resetting in 30 minutes.
    const near: CodexQuotaState = {
      ...quota,
      windows: [{ ...quota.windows[0], resetAtMs: now + 30 * 60_000 }],
    };
    const markup = renderToStaticMarkup(createElement(CodexQuotaBody, { quota: near, classes }));

    expect(markup).not.toContain('quotaResetMedium');
    expect(markup).not.toContain('quotaResetLow');
    expect(markup).not.toContain('codexResetCreditRowSoon');
  });

  test.each([
    [75, 'quotaResetMedium'],
    [95, 'quotaResetLow'],
  ])('colours the reset line like the meter at %d%% used', (usedPercent, tone) => {
    const low: CodexQuotaState = {
      ...quota,
      windows: [{ ...quota.windows[0], usedPercent, resetAtMs: now + 5 * DAY_MS }],
    };
    const markup = renderToStaticMarkup(createElement(CodexQuotaBody, { quota: low, classes }));

    expect(markup).toContain(`quotaResetCycle ${tone}`);
    expect(markup).toContain(`quotaReset ${tone} col-span-2`);
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

describe('reset time formats', () => {
  test('relative is the default everywhere', () => {
    expect(RESET_DISPLAY_MODES[0]).toBe('relative');
    expect(useQuotaResetDisplayStore.getInitialState().mode).toBe('relative');
  });

  test('offers relative, compact, and full formats', () => {
    const display = buildResetDisplay(null, now + 3 * HOUR_MS, now, 'en');
    expect(display).not.toBeNull();
    const formats = getResetDisplayFormats(display!);

    expect(formats).toHaveLength(3);
    expect(formats[0]).toBe('in 3 hours');
    expect(formats[1]).toBe(formatInstantShort(now + 3 * HOUR_MS));
    expect(formats[2]).not.toBe(formats[1]);
  });

  test('one shared cycle changes the display value used by every card', () => {
    const first = buildResetDisplay(null, now + 3 * HOUR_MS, now, 'en')!;
    const second = buildResetDisplay(null, now + 5 * DAY_MS, now, 'en')!;
    const displayBoth = () => {
      const { mode } = useQuotaResetDisplayStore.getState();
      return [getResetDisplayValue(first, mode), getResetDisplayValue(second, mode)];
    };

    useQuotaResetDisplayStore.getState().setMode('relative');
    expect(displayBoth()).toEqual([first.relative, second.relative]);

    useQuotaResetDisplayStore.getState().cycleMode();
    expect(displayBoth()).toEqual([first.absolute, second.absolute]);

    useQuotaResetDisplayStore.getState().cycleMode();
    expect(displayBoth()).toEqual([first.full, second.full]);

    useQuotaResetDisplayStore.getState().cycleMode();
    expect(useQuotaResetDisplayStore.getState().mode).toBe('relative');
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
          label: 'Grok Bot weekly limit',
          labelKey: 'cursor_quota.grok_bot_weekly',
          descriptionKey: 'cursor_quota.grok_bot_weekly_desc',
          usedPercent: 9,
          resetAtMs,
          periodHours: 168,
        },
      ],
    };
    const markup = renderToStaticMarkup(createElement(CursorQuotaBody, { quota, classes }));

    expect(markup).toContain('Grok Bot weekly limit');
    expect(markup).toContain('91% left');
    expect(markup).toContain('Separate allowance included with your Cursor plan');
    expect(markup).toContain('in 5 days');
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

    expect(markup).toContain('in 2 hours');
    expect(markup).toContain('in 4 days');
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
          label: 'Daily limit',
          labelKey: 'devin_cli_quota.daily',
          descriptionKey: 'devin_cli_quota.daily_desc',
          usedPercent: 25,
          resetAtMs: now + 6 * HOUR_MS,
          periodHours: 24,
        },
        {
          id: 'weekly',
          label: 'Weekly limit',
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
    expect(markup).toContain('Daily limit');
    expect(markup).toContain('Weekly limit');
    expect(markup).toContain('75% left');
    expect(markup).toContain('40% left');
    expect(markup).toContain('Devin daily ACU allowance');
    expect(markup).toContain('$45.23');
    expect(markup).toContain('Extra usage balance');
    // The plan end is a plain label/value like Codex "Renews"; only the two limits cycle.
    expect(markup).toContain(
      `<span class="codexPlanLabel">Plan period ends</span><span class="codexPlanValue" title="`
    );
    expect(markup).toContain(`>${formatInstantShort(now + 20 * DAY_MS, 'en')} · in 20d</span>`);
    expect(markup.match(/aria-label="Change reset time format"/g)).toHaveLength(2);
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

  test('renders the account own Grok Bot window from the stored snapshot', () => {
    const quota: XaiQuotaState = {
      status: 'success',
      billing: xaiBilling,
      grokBot: { usedPercent: 16.35, resetAtMs: now + 2 * DAY_MS },
    };
    const markup = renderToStaticMarkup(createElement(XaiQuotaBody, { quota, classes }));

    expect(markup).toContain('Weekly limit');
    expect(markup).toContain('Grok Bot');
    expect(markup).toContain('funded by this account');
    expect(markup).toContain('84% left');
  });

  test('omits the Grok Bot row when no Cursor credential reports it', () => {
    const quota: XaiQuotaState = { status: 'success', billing: xaiBilling };
    const markup = renderToStaticMarkup(createElement(XaiQuotaBody, { quota, classes }));

    expect(markup).not.toContain('Grok Bot');
  });
});

describe('QuotaMeter', () => {
  // Amber and red are reserved for genuinely low quota, so a mid-week account stays green.
  test.each([
    [64, 'quotaBarFillHigh'],
    [30, 'quotaBarFillHigh'],
    [25, 'quotaBarFillMedium'],
    [9, 'quotaBarFillLow'],
  ])('%d%% left fills with %s', (percent, fill) => {
    const markup = renderToStaticMarkup(createElement(QuotaMeter, { percent, classes }));
    expect(markup).toContain(`quotaBarFill ${fill}`);
  });
});

describe('QuotaResetLabel on phones', () => {
  const display = buildResetDisplay(null, now + 3 * HOUR_MS, now, 'en')!;
  const at = formatInstantShort(now + 3 * HOUR_MS, 'en');

  test('shows the countdown and the time together, with no hidden toggle', () => {
    const markup = renderToStaticMarkup(createElement(QuotaResetLabel, { display, classes }));
    expect(markup).toContain(
      `<span class="quotaReset col-span-2 order-last sm:hidden">Resets in 3h · ${at}</span>`
    );
    expect(markup).toContain('class="quotaResetCycle max-sm:hidden"');
  });

  test('says when a saved reset expires rather than resets', () => {
    const markup = renderToStaticMarkup(
      createElement(QuotaResetLabel, { display, classes, kind: 'expiry' })
    );
    expect(markup).toContain(`>Expires in 3h · ${at}</span>`);
  });

  test('labels a passed reset with the same narrow duration', () => {
    const past = buildResetDisplay(null, now - 12 * 60_000, now, 'en')!;
    const markup = renderToStaticMarkup(createElement(QuotaResetLabel, { display: past, classes }));
    expect(markup).toContain(`>Reset 12m ago · ${past.absolute}</span>`);
  });

  test('keeps the short countdown where a label already names the date', () => {
    const markup = renderToStaticMarkup(
      createElement(QuotaResetLabel, { display, classes, kind: 'plain' })
    );
    expect(markup).toContain(`>in 3h · ${at}</span>`);
  });
});

describe('Codex renewal', () => {
  test('reads as a white label/value pair like Plan, date first', () => {
    const quota: CodexQuotaState = {
      status: 'success',
      planType: 'pro',
      windows: [],
      subscriptionActiveUntil: new Date(now + 3 * HOUR_MS).toISOString(),
    };
    const markup = renderToStaticMarkup(createElement(CodexQuotaBody, { quota, classes }));
    const at = formatInstantShort(now + 3 * HOUR_MS, 'en');
    expect(markup).toContain('<span class="codexPlanLabel">Renews</span>');
    expect(markup).toMatch(
      new RegExp(`<span class="codexPlanValue" title="[^"]+">${at} · in 3h</span>`)
    );
  });
});
