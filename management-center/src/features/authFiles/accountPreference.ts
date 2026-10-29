import type { AuthFileItem } from '@/types';
import { normalizeOAuthProviderKey } from '@/utils/providerKeys';
import { isRuntimeOnlyAuthFile } from './constants';

const ROUTING_PROVIDERS = new Set([
  'claude',
  'codex',
  'antigravity',
  'gemini',
  'qwen',
  'iflow',
  'kimi',
  'meta',
  'xai',
  'devin',
]);

const providerOf = (file: AuthFileItem) =>
  normalizeOAuthProviderKey(String(file.type ?? file.provider ?? ''));
const priorityOf = (file: AuthFileItem) =>
  Number.isSafeInteger(file.priority) ? (file.priority as number) : 0;

export const canPreferAccount = (file: AuthFileItem): boolean =>
  !isRuntimeOnlyAuthFile(file) && ROUTING_PROVIDERS.has(providerOf(file));

export function nextAccountPriority(file: AuthFileItem, files: AuthFileItem[]): number {
  const highest = files.reduce(
    (value, candidate) =>
      providerOf(candidate) === providerOf(file) ? Math.max(value, priorityOf(candidate)) : value,
    0
  );
  if (highest >= Number.MAX_SAFE_INTEGER) throw new Error('auth_files.prefer_priority_limit');
  return highest + 1;
}

export function isPreferredAccount(file: AuthFileItem, files: AuthFileItem[]): boolean {
  if (!canPreferAccount(file) || file.disabled || priorityOf(file) <= 0) return false;
  const peers = files.filter(
    (candidate) => providerOf(candidate) === providerOf(file) && !candidate.disabled
  );
  return peers.every((candidate) => candidate === file || priorityOf(candidate) < priorityOf(file));
}
