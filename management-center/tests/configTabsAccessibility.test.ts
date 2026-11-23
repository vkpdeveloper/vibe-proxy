import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { Page } from '@/components/layout/Page';
import { countSectionErrors, buildConfigTabs } from '@/features/config/uiState';

describe('config tabs accessibility', () => {
  test('announces validation errors and unsaved changes in the tab name', () => {
    const t = i18n.getFixedT('en');
    const errorCounts = { ...countSectionErrors(undefined, false), streaming: 2 };
    const tabs = buildConfigTabs(t, new Set(['streaming']), errorCounts);
    const markup = renderToStaticMarkup(
      createElement(Page<(typeof tabs)[number]['id']>, {
        title: 'Config',
        tabs,
        tab: 'connectivity',
        children: null,
      })
    );

    const streaming = markup.match(
      /<button\b[^>]*data-nav-item="streaming"[^>]*>(.*?)<\/button>/
    )?.[1];
    const note = [
      t('config_management.meta_errors', { count: 2 }),
      t('config_management.status_dirty_short'),
    ].join(', ');
    expect(streaming).toContain(t('config_management.tabs.streaming'));
    expect(streaming).toContain(`<span class="sr-only">, ${note}</span>`);
    // The dot itself stays out of the accessible name.
    expect(streaming).toMatch(/<span aria-hidden="true" class="[^"]*bg-warning/);

    const clean = markup.match(/<button\b[^>]*data-nav-item="logging"[^>]*>(.*?)<\/button>/)?.[1];
    expect(clean).not.toContain('sr-only');
    expect(clean).not.toContain('bg-warning');
  });
});
