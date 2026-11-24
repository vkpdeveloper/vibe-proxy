import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { apiClient } from '@/services/api/client';
import { oauthApi } from '@/services/api/oauth';
import { checkLoginProxyUrl, isInvalidProxyUrlError } from '@/features/oauth/loginProxy';

afterEach(() => mock.restore());

test('a proxied login is a POST with proxy_url in the body and the rest in the query', async () => {
  const post = spyOn(apiClient, 'post').mockResolvedValue({ url: 'https://example.test' });
  const get = spyOn(apiClient, 'get');
  await oauthApi.startAuth('anthropic', undefined, {
    accountName: ' Work ',
    reconnect: 'claude-a.json',
    proxyUrl: ' socks5://127.0.0.1:1080 ',
  });
  expect(post).toHaveBeenCalledWith(
    '/oauth/auth-url',
    { proxy_url: 'socks5://127.0.0.1:1080' },
    {
      params: {
        provider: 'claude',
        is_webui: true,
        account_name: 'Work',
        reconnect: 'claude-a.json',
      },
    }
  );
  expect(get).not.toHaveBeenCalled();
});

test('a direct login stays a GET and never sends name, which selects a credential to replace', async () => {
  const get = spyOn(apiClient, 'get').mockResolvedValue({ url: 'https://example.test' });
  await oauthApi.startAuth('anthropic', undefined, { accountName: 'Work', proxyUrl: '  ' });
  expect(get).toHaveBeenCalledWith('/oauth/auth-url', {
    params: { provider: 'claude', is_webui: true, account_name: 'Work' },
  });
});

test('accepts the proxies the backend accepts', () => {
  for (const url of [
    'http://proxy.example',
    'https://user:pass@proxy.example:8443',
    'socks5://127.0.0.1:1080',
    'SOCKS5H://[::1]:1080/',
  ]) {
    expect(checkLoginProxyUrl(` ${url} `)).toEqual({ kind: 'valid', url });
  }
  expect(checkLoginProxyUrl('   ')).toEqual({ kind: 'empty' });
});

test('rejects what the backend would refuse', () => {
  for (const url of [
    'proxy.example:8080',
    'ftp://proxy.example',
    'http://',
    'http://proxy.example/path',
    'http://proxy.example?x=1',
    'http://proxy.example#frag',
    'http://proxy.example:',
    'http://proxy.example:0',
    'http://proxy.example:70000',
    'socks5://proxy.example',
    'http://proxy example',
  ]) {
    expect(checkLoginProxyUrl(url)).toEqual({ kind: 'invalid' });
  }
});

test('recognizes the backend refusal', () => {
  expect(isInvalidProxyUrlError({ status: 400, message: 'invalid proxy_url' })).toBe(true);
  expect(isInvalidProxyUrlError({ status: 400, message: 'provider is required' })).toBe(false);
});
