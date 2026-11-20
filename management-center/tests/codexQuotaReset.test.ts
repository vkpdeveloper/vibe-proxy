import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import type { TFunction } from 'i18next';
import { CODEX_CONFIG } from '@/features/quota/providers/codex/data';
import { apiCallApi, authFilesApi, apiClient } from '@/services/api';
import {
  CODEX_RATE_LIMIT_RESET_CREDITS_CONSUME_URL,
  CODEX_RATE_LIMIT_RESET_CREDITS_URL,
} from '@/utils/quota';

const t = ((key: string) => key) as TFunction;
const file = { name: 'codex-test.json', auth_index: 'test-index', type: 'codex' };
const response = (body: unknown, statusCode = 200) => ({
  statusCode,
  body,
  bodyText: JSON.stringify(body),
  header: {},
});
const reset = () => CODEX_CONFIG.resetQuota!(file, t);
const mocks: Array<{ mockRestore(): void }> = [];
afterEach(() => {
  for (const mock of mocks.splice(0)) mock.mockRestore();
});

function setup(body: unknown, statusCode = 200, credits: unknown = {}) {
  const calls: string[] = [];
  const consumed: unknown[] = [];
  const request = spyOn(apiCallApi, 'request').mockImplementation(async (payload) => {
    if (payload.url === CODEX_RATE_LIMIT_RESET_CREDITS_CONSUME_URL) {
      calls.push('consume');
      consumed.push(JSON.parse(String(payload.data)));
      return response(body, statusCode);
    }
    if (payload.url === CODEX_RATE_LIMIT_RESET_CREDITS_URL && !calls.includes('consume')) {
      // Picking the default credit reads the list before consuming.
      calls.push('pick');
      return response(credits);
    }
    calls.push('read');
    return response({});
  });
  const clear = spyOn(authFilesApi, 'resetCooldown').mockImplementation(async () => {
    calls.push('clear');
    return { status: 'ok', auth_index: 'test-index', models: [] };
  });
  mocks.push(request, clear);
  return { calls, consumed, request, clear };
}

describe('Codex reset gateway cooldown', () => {
  test.each(['reset', 'already_redeemed'])(
    'clears only after confirmed %s, before reads',
    async (code) => {
      const { calls, clear } = setup({ code, windows_reset: 0 });
      await reset();
      expect(calls.slice(0, 4)).toEqual(['pick', 'consume', 'clear', 'read']);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenCalledWith('test-index');
    }
  );

  test.each(['no_credit', 'nothing_to_reset', 'unknown'])('does not clear for %s', async (code) => {
    const { calls } = setup({ code });
    await expect(reset()).rejects.toThrow('codex_quota.reset_not_confirmed');
    expect(calls).toEqual(['pick', 'consume']);
  });

  test('does not clear on HTTP failure', async () => {
    const { calls } = setup({ code: 'reset' }, 503);
    await expect(reset()).rejects.toThrow();
    expect(calls).toEqual(['pick', 'consume']);
  });

  test('does not clear on transport failure', async () => {
    const { request, clear } = setup({});
    request.mockRejectedValue(new Error('timeout'));
    await expect(reset()).rejects.toThrow('timeout');
    expect(clear).not.toHaveBeenCalled();
  });

  test('directs cooldown failures to manual clearing, without another consume', async () => {
    const { request, clear } = setup({ code: 'reset' });
    clear.mockRejectedValue(new Error('offline'));
    await expect(reset()).rejects.toThrow('codex_quota.reset_cooldown_failed');
    expect(request).toHaveBeenCalledTimes(2);
  });

  test('rejects mismatched cooldown acknowledgements', async () => {
    const { clear } = setup({ code: 'reset' });
    clear.mockResolvedValue({ status: 'ok', auth_index: 'other-index', models: [] });
    await expect(reset()).rejects.toThrow('codex_quota.reset_cooldown_failed');
  });

  test('does not clear after connection changes during redemption', async () => {
    const { clear } = setup({ code: 'reset' });
    const revision = spyOn(apiClient, 'getConnectionRevision')
      .mockReturnValueOnce(1)
      .mockReturnValue(2);
    mocks.push(revision);
    await expect(reset()).rejects.toThrow('codex_quota.reset_cooldown_failed');
    expect(clear).not.toHaveBeenCalled();
  });
});

describe('Codex reset credit targeting', () => {
  const credit = (id: string, expiresAt: string) => ({
    id,
    reset_type: 'codex_rate_limits',
    status: 'available',
    expires_at: expiresAt,
  });

  test('spends the chosen credit without reading the list first', async () => {
    const { calls, consumed } = setup({ code: 'reset' });
    await CODEX_CONFIG.resetQuota!(file, t, 'credit-b');
    expect(calls[0]).toBe('consume');
    expect(consumed[0]).toMatchObject({ credit_id: 'credit-b' });
  });

  test('defaults to the soonest-expiring credit', async () => {
    const { consumed } = setup({ code: 'reset' }, 200, {
      available_count: 2,
      credits: [credit('later', '2027-02-01T00:00:00Z'), credit('sooner', '2026-12-01T00:00:00Z')],
    });
    await reset();
    expect(consumed[0]).toMatchObject({ credit_id: 'sooner' });
  });

  test('lets upstream pick when the credit list has no usable IDs', async () => {
    const { consumed } = setup({ code: 'reset' });
    await reset();
    expect(consumed[0]).not.toHaveProperty('credit_id');
  });
});
