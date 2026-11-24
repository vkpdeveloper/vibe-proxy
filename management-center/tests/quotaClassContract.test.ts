/**
 * Guard for the QuotaClassMap contract. Both hosts (quota page cards and auth file rows)
 * share the Tailwind map in quotaClasses.ts, so a missing or empty key would render
 * unstyled quota rows.
 */

import { describe, expect, test } from 'bun:test';
import { QUOTA_CLASS_KEYS, bindQuotaClasses } from '@/features/quota/types';
import { quotaClasses } from '@/features/quota/components/quotaClasses';

const textSize = (classes: string) =>
  classes.split(/\s+/).find((c) => /^text-(xs|sm|base|\[\d+px\])$/.test(c));

describe('quota class contract', () => {
  test('the shared class map defines every QuotaClassMap key', () => {
    const missing = QUOTA_CLASS_KEYS.filter((key) => !quotaClasses[key]?.trim());
    expect(missing).toEqual([]);
    expect(Object.keys(quotaClasses).sort()).toEqual([...QUOTA_CLASS_KEYS].sort());
  });

  test('standalone amounts match quota metadata: same size, sans, medium, normal figures', () => {
    const amount = quotaClasses.quotaAmount;
    expect(textSize(amount)).toBeDefined();
    expect(textSize(amount)).toBe(textSize(quotaClasses.quotaMeta));
    expect(amount.split(/\s+/)).toContain('font-medium');
    // Mona Sans tabular figures draw slashed zeros that read like code.
    expect(`${amount} ${quotaClasses.quotaMeta}`).not.toContain('tabular-nums');
    // Amounts and reset times are prose with numbers in them, not code.
    expect(`${amount} ${quotaClasses.quotaMeta}`).not.toContain('font-mono');
  });

  test('bindQuotaClasses reports every missing key rather than the first', () => {
    const partial = Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, `_${key}`]));
    delete partial.quotaReset;
    delete partial.quotaResetRelative;

    expect(() => bindQuotaClasses(partial, 'test-host')).toThrow(/quotaReset.*quotaResetRelative/);
  });

  test('bindQuotaClasses returns exactly the contract keys', () => {
    const full = Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, `_${key}`]));
    const bound = bindQuotaClasses({ ...full, strayKey: '_stray' }, 'test-host');

    expect(Object.keys(bound).sort()).toEqual([...QUOTA_CLASS_KEYS].sort());
  });
});
