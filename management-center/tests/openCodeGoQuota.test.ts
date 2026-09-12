import { describe, expect, test } from 'bun:test';
import type { TFunction } from 'i18next';
import {
  OPENCODE_GO_CONFIG,
  buildOpenCodeGoQuotaData,
} from '@/features/quota/providers/opencodeGo/data';

const t = ((key: string) => key) as TFunction;

describe('OpenCode Go quota', () => {
  test('maps the shared rolling, weekly, and monthly usage windows', () => {
    const data = buildOpenCodeGoQuotaData(
      {
        usage: {
          rolling: { status: 'active', percent: 25, resetsAt: '2026-09-12T12:00:00Z' },
          weekly: { status: 'active', percent: 40, resetsAt: '2026-09-18T12:00:00Z' },
          monthly: { status: 'active', percent: 60, resetsAt: '2026-10-01T00:00:00Z' },
        },
      },
      t
    );

    expect(
      data.windows.map((window) => [window.id, window.usedPercent, window.periodHours])
    ).toEqual([
      ['rolling', 25, 5],
      ['weekly', 40, 7 * 24],
      ['monthly', 60, null],
    ]);
    expect(data.windows[0].resetAtMs).toBe(Date.parse('2026-09-12T12:00:00Z'));
    expect(data.windows[0].descriptionKey).toBe('opencode_go_quota.five_hour_desc');
  });

  test('marks rate-limited windows and skips usage without a percentage', () => {
    const data = buildOpenCodeGoQuotaData(
      {
        usage: {
          rolling: { status: 'rate-limited', percent: 100 },
          weekly: { status: 'active' },
        },
      },
      t
    );

    expect(data.windows).toHaveLength(1);
    expect(data.windows[0].rateLimited).toBe(true);
  });

  test('recognizes enabled OpenCode Go API-key credentials only', () => {
    expect(OPENCODE_GO_CONFIG.filterFn({ name: 'opencode-go.json', type: 'opencode-go' })).toBe(
      true
    );
    expect(
      OPENCODE_GO_CONFIG.filterFn({
        name: 'opencode-go.json',
        provider: 'opencode-go',
        disabled: true,
      })
    ).toBe(false);
    expect(OPENCODE_GO_CONFIG.filterFn({ name: 'codex.json', type: 'codex' })).toBe(false);
  });
});
