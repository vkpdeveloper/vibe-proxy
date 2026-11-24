import { isRecord } from '@/utils/helpers';

/**
 * Scheme, optional userinfo, host (or bracketed IPv6) and port, with nothing after but an
 * optional `/`. The backend (validateOAuthSessionProxyURL) also refuses paths, queries and
 * fragments, so catching them here saves a round trip; it stays the final judge.
 */
const PROXY_URL =
  /^(https?|socks5h?):\/\/(?:[^\s@/?#]+@)?([^\s@/?#:[\]]+|\[[0-9a-f:.]+\])(?::(\d+))?\/?$/i;

export type LoginProxyCheck =
  { kind: 'empty' } | { kind: 'valid'; url: string } | { kind: 'invalid' };

export function checkLoginProxyUrl(raw: string): LoginProxyCheck {
  const url = raw.trim();
  if (!url) return { kind: 'empty' };
  const match = PROXY_URL.exec(url);
  if (!match) return { kind: 'invalid' };
  const [, scheme, , port] = match;
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) return { kind: 'invalid' };
  if (scheme.toLowerCase().startsWith('socks5') && port === undefined) return { kind: 'invalid' };
  return { kind: 'valid', url };
}

/** The backend's 400 for a proxy it refuses: `{"error": "invalid proxy_url"}`. */
export const isInvalidProxyUrlError = (error: unknown): boolean =>
  isRecord(error) &&
  error.status === 400 &&
  (error.apiCode === 'invalid proxy_url' || error.message === 'invalid proxy_url');
