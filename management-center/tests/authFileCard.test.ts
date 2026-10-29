import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// The row binds CSS-module classes at import time, which Bun cannot render.
// Keep these source contracts small; browser checks cover the actual row.
const source = readFileSync(
  new URL('../src/features/authFiles/components/AuthFileCard.tsx', import.meta.url),
  'utf8'
);
const styles = readFileSync(
  new URL('../src/features/authFiles/components/AuthFileCard.module.scss', import.meta.url),
  'utf8'
);

describe('auth file row contract', () => {
  test('leads with the blurred account, never the file name', () => {
    expect(source).toContain('<EmailPrivacyText text={identity.primary} />');
    expect(source).not.toContain('file.name}</');
    expect(source).not.toContain('identity.secondary');
  });

  test('has one enable toggle named after the account', () => {
    expect(source.match(/<ToggleSwitch/g)).toHaveLength(1);
    expect(source).toContain("t('auth_files.card_toggle', { name: identity.primary })");
    expect(source).toContain('checked={!file.disabled}');
  });

  test('dims a disabled row but keeps its controls clear', () => {
    expect(source).toContain("file.disabled === true ? styles.rowDisabled : ''");
    expect(styles).toMatch(/\.rowDisabled\s*>\s*:not\(\.actions\)\s*\{\s*opacity:/);
  });

  test('keeps the per-credential actions', () => {
    for (const handler of [
      'onShowModels(file)',
      'onManualRefresh(file)',
      'onCooldownReset(file)',
      'onOpenPrefixProxyEditor(file)',
      'onDelete(file.name)',
    ]) {
      expect(source).toContain(handler);
    }
  });
});
