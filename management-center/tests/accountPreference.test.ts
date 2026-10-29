import { describe, expect, test } from 'bun:test';
import type { AuthFileItem } from '../src/types';
import {
  canPreferAccount,
  isPreferredAccount,
  nextAccountPriority,
} from '../src/features/authFiles/accountPreference';

const account = (name: string, priority?: number): AuthFileItem => ({
  name,
  type: 'claude',
  priority,
});

describe('manual account preference', () => {
  test('promotes above every account of the same provider without changing other priorities', () => {
    const selected = account('selected');
    const files = [
      selected,
      account('other-page', 50),
      { ...account('codex', 100), type: 'codex' },
    ];
    const priority = nextAccountPriority(selected, files);
    expect(priority).toBe(51);
    const promoted = { ...selected, priority };
    expect(isPreferredAccount(promoted, [promoted, ...files.slice(1)])).toBe(true);
    expect(files[1].priority).toBe(50);
  });

  test('a later manual choice supersedes the previous one', () => {
    const first = account('first', 1);
    const second = account('second');
    const promoted = { ...second, priority: nextAccountPriority(second, [first, second]) };
    const files = [first, promoted];
    expect(isPreferredAccount(first, files)).toBe(false);
    expect(isPreferredAccount(promoted, files)).toBe(true);
  });

  test('default, tied, and disabled priorities do not claim a unique preference', () => {
    const first = account('first');
    const tied = account('tied', 1);
    const disabled = { ...account('disabled', 5), disabled: true };
    expect(isPreferredAccount(first, [first])).toBe(false);
    expect(isPreferredAccount(tied, [tied, account('also-tied', 1)])).toBe(false);
    expect(isPreferredAccount(disabled, [disabled])).toBe(false);
    expect(nextAccountPriority(first, [first, disabled])).toBe(6);
  });

  test('excludes tracker-only, virtual, and unknown providers from account selection', () => {
    for (const type of ['cursor', 'devin-cli', 'opencode-go', 'unknown']) {
      expect(canPreferAccount({ name: type, type })).toBe(false);
    }
    expect(canPreferAccount({ ...account('virtual'), runtimeOnly: true })).toBe(false);
    expect(canPreferAccount(account('claude'))).toBe(true);
  });

  test('handles missing or invalid priorities and prevents integer overflow', () => {
    const selected = account('selected');
    expect(nextAccountPriority(selected, [account('negative', -5), account('invalid', NaN)])).toBe(
      1
    );
    expect(() => nextAccountPriority(selected, [account('max', Number.MAX_SAFE_INTEGER)])).toThrow(
      'auth_files.prefer_priority_limit'
    );
  });
});
