import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { CopilotQuotaBody } from '@/features/quota/providers/copilot/CopilotQuotaBody';
import { COPILOT_CONFIG, parseCopilotQuota } from '@/features/quota/providers/copilot/data';
import { lowestRemainingPercent } from '@/features/quota/quotaTimelineModel';
import { QUOTA_CLASS_KEYS, bindQuotaClasses } from '@/features/quota/types';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import { useQuotaStore } from '@/stores/useQuotaStore';
import type { AuthFileItem } from '@/types';

const file: AuthFileItem = { name: 'copilot-test.json', authIndex: 'test-index', type: 'copilot' };
const credential = JSON.stringify({
  type: 'copilot',
  refresh_token: 'test-oauth',
  access_token: 'test-inference',
});
const snapshot = { quota_remaining: 1150.9, entitlement: 20000, percent_remaining: 5.7 };
const payload = (premium: unknown) => ({
  login: 'fixture-account',
  quota_snapshots: { premium_interactions: premium },
});
const classes = bindQuotaClasses(
  Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])),
  'test'
);

afterEach(() => {
  mock.restore();
  useQuotaStore.getState().clearQuotaCache();
});

test('sends only the GitHub token of the selected credential to the fixed quota endpoint', async () => {
  const download = spyOn(authFilesApi, 'downloadText').mockResolvedValue(credential);
  const post = spyOn(apiClient, 'post').mockResolvedValue({
    status_code: 200,
    body: payload(snapshot),
  });
  const data = await COPILOT_CONFIG.fetchQuota(file, i18n.t);
  expect(download).toHaveBeenCalledWith(file.name);
  expect(post).toHaveBeenCalledWith(
    '/requests/api-call',
    {
      authIndex: 'test-index',
      method: 'GET',
      url: 'https://api.github.com/copilot_internal/user',
      header: {
        Authorization: 'Bearer test-oauth',
        'User-Agent': 'copilot/1.0.114',
        Accept: 'application/json',
      },
    },
    undefined
  );
  expect(data).toEqual({ percentRemaining: 5.7, remaining: 1150.9, entitlement: 20000 });
});

test('zero left is a real reading; missing, unlimited and out-of-range snapshots are not', () => {
  expect(parseCopilotQuota(payload({ percent_remaining: 0, quota_remaining: 0 }))).toEqual({
    percentRemaining: 0,
    remaining: 0,
    entitlement: null,
  });
  for (const premium of [
    undefined,
    {},
    { ...snapshot, unlimited: true },
    { ...snapshot, percent_remaining: null },
    { ...snapshot, percent_remaining: -1 },
    { ...snapshot, percent_remaining: 101 },
    { ...snapshot, percent_remaining: 'NaN' },
  ]) {
    expect(parseCopilotQuota(payload(premium))).toBeNull();
  }
});

test('renders the meter, and the counts only when the plan has an entitlement', () => {
  const render = (premium: unknown) =>
    renderToStaticMarkup(
      createElement(CopilotQuotaBody, {
        quota: { status: 'success', data: parseCopilotQuota(payload(premium)) ?? undefined },
        classes,
      })
    );
  const withCounts = render({ percent_remaining: '0.5', entitlement: '100', quota_remaining: '0' });
  expect(withCounts).toContain('aria-valuenow="0.5"');
  expect(withCounts).toContain('0 / 100');
  const noEntitlement = render({ percent_remaining: 0, quota_remaining: 0, entitlement: 0 });
  expect(noEntitlement).toContain('aria-valuenow="0"');
  expect(noEntitlement).not.toContain('quotaAmount');
  const unavailable = render({ ...snapshot, unlimited: true });
  expect(unavailable).not.toContain('role="meter"');
  expect(unavailable).toContain(i18n.t('copilot_quota.unavailable'));
});

test('a missing token or a cleared cache never forwards the credential', async () => {
  const post = spyOn(apiClient, 'post');
  const download = spyOn(authFilesApi, 'downloadText');
  for (const mode of ['missing', 'file', 'session']) {
    download.mockImplementation(async () => {
      if (mode === 'missing') return '{"type":"copilot","access_token":"test-inference"}';
      useQuotaStore.getState().clearQuotaCache(mode === 'file' ? [file.name] : undefined);
      return credential;
    });
    await expect(COPILOT_CONFIG.fetchQuota(file, i18n.t)).rejects.toThrow(
      i18n.t('copilot_quota.unavailable')
    );
  }
  expect(post).not.toHaveBeenCalled();
});

test('failed requests surface neither the token nor upstream details', async () => {
  spyOn(authFilesApi, 'downloadText').mockResolvedValue(credential);
  const post = spyOn(apiClient, 'post').mockResolvedValue({ status_code: 401, body: credential });
  const safeError = new Error(i18n.t('copilot_quota.unavailable'));
  await expect(COPILOT_CONFIG.fetchQuota(file, i18n.t)).rejects.toEqual(safeError);
  post.mockRejectedValue(new Error(credential));
  await expect(COPILOT_CONFIG.fetchQuota(file, i18n.t)).rejects.toEqual(safeError);
});

test('least-left sorting reads the premium percentage', () => {
  const quota = COPILOT_CONFIG.buildSuccessState({
    percentRemaining: 12.5,
    remaining: 25,
    entitlement: 200,
  });
  expect(lowestRemainingPercent('copilot', quota)).toBe(12.5);
  expect(lowestRemainingPercent('copilot', { status: 'loading' })).toBeNull();
});
