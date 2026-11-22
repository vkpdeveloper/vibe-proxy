import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const readSource = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Source contracts only: these do not verify iframe painting in a browser.
describe('plugin resource theme backgrounds', () => {
  const page = readSource('src/features/plugins/PluginResourcePage.tsx');

  test('the page and the iframe both paint the theme background', () => {
    const iframe = page.match(/<iframe\b[^>]*>/)?.[0] ?? '';
    expect(iframe).toContain('bg-background');
    expect(page).toMatch(/className="[^"]*\bbg-background\b[^"]*"[^<]*>\s*\{/);
  });

  test('no hard-coded white that would flash before the plugin paints', () => {
    expect(page).not.toMatch(/#fff(?:fff)?\b/i);
    expect(page).not.toMatch(/\bbg-white\b/);
  });
});
