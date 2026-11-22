import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const readSource = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = readSource('src/features/logs/LogsPage.tsx');

// Structural guards complement the browser viewport/interaction checks. They do not
// assert browser layout: the important contract is a single flexible scrolling viewer.
describe('log workspace layout contract', () => {
  test('viewer uses remaining space instead of resolution-specific height budgets', () => {
    expect(page).toContain('<div className="relative min-h-0 flex-1">');
    expect(page).toMatch(/ref=\{logViewerRef\}\s+className="h-full overflow-auto\b/);
    expect(page).not.toMatch(/\b(?:h|max-h|min-h)-\[(?:\d+px|calc\(100vh)/);
    expect(page).not.toMatch(/\b(?:h|max-h|min-h)-(?:90|96|\[360px\]|\[420px\]|\[480px\])\b/);
  });

  test('advanced controls are closed initially and opened in a focus-managed dialog', () => {
    expect(page).toContain(
      '[structuredFiltersExpanded, setStructuredFiltersExpanded] = useState(false)'
    );
    expect(page).not.toContain('logsPage.structuredFiltersExpanded');
    expect(page).toContain('aria-haspopup="dialog"');
    expect(page).toMatch(/<Dialog\s+open=\{structuredFiltersExpanded\}/);
    expect(page).toContain("'logsPage.showRawLogs'");
    expect(page).toContain("'logsPage.hideManagementLogs'");
    expect(page).not.toContain('!fullscreenLogs &&');
  });

  test('row actions stay reachable by keyboard', () => {
    expect(page).toContain("useLocalStorage('logsPage.wrapLogs', false)");
    expect(page).toContain("aria-label={t('logs.copy_line')}");
    // The copy button is hidden until hover, but focus must reveal it.
    expect(page).toMatch(/opacity-0[^"]*focus-visible:opacity-100/);
    expect(page).toContain('tabIndex={0}');
    expect(page).toContain("aria-label={t('logs.log_content')}");
    expect(page).toContain('aria-pressed={autoRefresh}');
  });

  test('background refresh retains loaded content and compact status stays outside viewer', () => {
    expect(page).toContain('loading && logBuffer.buffer.length === 0');
    expect(page).toContain('<footer');
    expect(page).toContain('onScroll={handleLogScroll}');
    expect(page).toContain('onClick={resumeFollowing}');
    expect(page).toContain('data-log-id={line.id}');
  });

  test('routine buffer eviction does not add a persistent warning banner', () => {
    expect(page).not.toContain("t('logs.buffer_evicted')");
    expect(page).not.toContain('logBuffer.evicted > 0');
    // A lost reading position and a backend cursor reset remain actionable notices.
    expect(page).toContain("t('logs.history_evicted')");
    expect(page).toContain("t('logs.cursor_reset_notice')");
  });

  test('all supported locales describe both filtering and display settings', () => {
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ru']) {
      const messages = JSON.parse(readSource(`src/i18n/locales/${locale}.json`));
      expect(messages.logs.filter_panel_title).toBeTruthy();
      expect(messages.logs.show_raw_logs).toBeTruthy();
      expect(messages.logs.wrap_lines).toBeTruthy();
      expect(messages.logs.hide_management_logs).toBeTruthy();
    }
  });
});
