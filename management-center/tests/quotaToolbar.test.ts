import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchField } from '@/features/authFiles/components/ListControls';

const render = (value: string) =>
  renderToStaticMarkup(
    createElement(SearchField, {
      value,
      onChange: () => {},
      placeholder: 'Search',
      label: 'Search quotas',
      clearLabel: 'Clear search',
    })
  );

describe('quota search field', () => {
  test('is a named search input that hides the native clear button', () => {
    const markup = render('');
    expect(markup).toContain('type="search"');
    expect(markup).toContain('aria-label="Search quotas"');
    expect(markup).toContain('[&amp;::-webkit-search-cancel-button]:hidden');
  });

  test('offers a named clear action only while there is a query', () => {
    expect(render('')).not.toContain('aria-label="Clear search"');
    expect(render('claude')).toContain('aria-label="Clear search"');
  });

  test('the quota page uses it and clearing restores input focus', () => {
    expect(readFileSync('src/features/quota/QuotaPage.tsx', 'utf8')).toContain('<SearchField');
    const field = readFileSync('src/features/authFiles/components/ListControls.tsx', 'utf8');
    expect(field).toMatch(/onChange\(''\);\s*inputRef\.current\?\.focus\(\);/);
  });
});
