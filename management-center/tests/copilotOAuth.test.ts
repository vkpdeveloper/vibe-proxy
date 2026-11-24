import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { apiClient } from '@/services/api/client';
import { oauthApi } from '@/services/api/oauth';
import { OAUTH_PROVIDERS, supportsManualCallback } from '@/features/oauth/providers';
import {
  OAUTH_PROVIDER_PRESETS,
  QUOTA_PROVIDER_TYPES,
  getAuthFileIcon,
  getTypeLabel,
  supportsAuthFileManualRefresh,
} from '@/features/authFiles/constants';
import { providerLabel } from '@/features/dashboard/utils';
import i18n from '@/i18n';

afterEach(() => mock.restore());

test('GitHub Copilot starts a device session without browser callback parameters', async () => {
  const card = OAUTH_PROVIDERS.find(({ id }) => id === 'copilot');
  if (!card) throw new Error('Missing GitHub Copilot login card');
  expect(card.flow).toBe('device');
  expect(supportsManualCallback(card)).toBe(false);
  const response = { url: 'https://example.test/device', user_code: 'TEST-CODE', state: 'test' };
  const get = spyOn(apiClient, 'get').mockResolvedValue(response);
  expect(await oauthApi.startAuth(card.id)).toEqual(response);
  expect(get).toHaveBeenCalledWith('/oauth/auth-url', { params: { provider: 'copilot' } });
});

test('Copilot credentials get branding, token refresh and quota support', () => {
  expect(OAUTH_PROVIDER_PRESETS).toContain('copilot');
  expect([...QUOTA_PROVIDER_TYPES]).toContain('copilot');
  expect(getAuthFileIcon('copilot', 'dark')).toBeTruthy();
  expect(supportsAuthFileManualRefresh('copilot')).toBe(true);
  expect(providerLabel('copilot', 'Unknown')).toBe('GitHub Copilot');
  expect(getTypeLabel(i18n.getFixedT('en'), 'copilot')).toBe('GitHub Copilot');
});

test('every locale has the Copilot sign-in and quota copy', () => {
  for (const locale of ['en', 'ko', 'ru', 'vi', 'zh-CN', 'zh-TW']) {
    const translations = JSON.parse(readFileSync(`src/i18n/locales/${locale}.json`, 'utf8'));
    for (const suffix of [
      'oauth_button',
      'oauth_hint',
      'open_link',
      'copy_link',
      'oauth_status_waiting',
      'oauth_status_success',
      'oauth_status_error',
      'oauth_start_error',
    ]) {
      expect(translations.auth_login[`copilot_${suffix}`]).toBeTruthy();
    }
    expect(translations.auth_files.filter_copilot).toBeTruthy();
    for (const key of ['title', 'idle', 'loading', 'load_failed', 'empty_title', 'empty_desc']) {
      expect(translations.copilot_quota[key]).toBeTruthy();
    }
  }
});
