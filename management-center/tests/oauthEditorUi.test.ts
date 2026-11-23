import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { OAuthEditorProviderCard } from '../src/features/authFiles/components/OAuthEditorProviderCard';
import { OAuthAliasMappingRow } from '../src/features/authFiles/components/OAuthAliasMappingRow';
import en from '../src/i18n/locales/en.json';
import zhCN from '../src/i18n/locales/zh-CN.json';
import zhTW from '../src/i18n/locales/zh-TW.json';
import ru from '../src/i18n/locales/ru.json';

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en } } });
const noop = () => {};
const render = (element: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(I18nextProvider, { i18n }, element));

function renderMapping(overrides: { disabled?: boolean; canRemove?: boolean } = {}) {
  return render(
    createElement(OAuthAliasMappingRow, {
      entry: { name: 'source-model', alias: 'client-model', fork: true },
      index: 1,
      options: [{ value: 'source-model' }],
      disabled: false,
      canRemove: true,
      onChange: noop,
      onRemove: noop,
      ...overrides,
    })
  );
}

describe('OAuth editor UI', () => {
  test('provider shortcuts expose normalized selection and an associated input label', () => {
    const markup = render(
      createElement(OAuthEditorProviderCard, {
        provider: ' CODEX ',
        options: ['codex', 'claude', 'custom-provider'],
        onChange: noop,
        disabled: false,
        translationPrefix: 'oauth_excluded',
      })
    );
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(2);
    const inputId = markup.match(/<input[^>]*\sid="([^"]+)"/)?.[1];
    expect(inputId).toBeDefined();
    expect(markup).toContain(`for="${inputId}"`);
    expect(markup).toContain('Custom-provider');
  });

  test('disables provider input and every shortcut while saving or disconnected', () => {
    const markup = render(
      createElement(OAuthEditorProviderCard, {
        provider: 'codex',
        options: ['codex', 'claude'],
        onChange: noop,
        disabled: true,
        translationPrefix: 'oauth_model_alias',
      })
    );
    expect(markup.match(/\sdisabled=""/g)).toHaveLength(3);
  });

  test('mapping fields have persistent accessible names and a contextual delete name', () => {
    const markup = renderMapping();
    expect(markup).toContain('aria-label="Alias 2"');
    expect(markup).toContain('aria-label="Delete alias 2"');
    for (const [value, label] of [
      ['source-model', en.oauth_model_alias.alias_name_placeholder],
      ['client-model', en.oauth_model_alias.alias_placeholder],
    ]) {
      const input = markup.match(new RegExp(`<input[^>]*value="${value}"[^>]*>`))?.[0];
      expect(input).toBeDefined();
      expect(input).toContain(`aria-label="${label}"`);
    }
    // The fork switch is labelled by visible text, not only by its position.
    const forkId = markup.match(/<button[^>]*role="switch"[^>]*\sid="([^"]+)"/)?.[1];
    expect(forkId).toBeDefined();
    expect(markup).toContain(`for="${forkId}"`);
    expect(markup).toContain('aria-checked="true"');
  });

  test('preserves the last-row delete guard and disabled editing state', () => {
    const lastRow = renderMapping({ canRemove: false });
    expect(lastRow.match(/\sdisabled=""/g)).toHaveLength(1);
    const disabledRow = renderMapping({ disabled: true });
    // Both model fields, the fork switch and the delete button are all locked.
    const controls = [
      ...(disabledRow.match(/<input[^>]*value="(source|client)-model"[^>]*>/g) ?? []),
      ...(disabledRow.match(/<button[^>]*role="switch"[^>]*>/g) ?? []),
      ...(disabledRow.match(/<button[^>]*aria-label="Delete alias 2"[^>]*>/g) ?? []),
    ];
    expect(controls).toHaveLength(4);
    for (const tag of controls) expect(tag).toMatch(/\sdisabled=""/);
  });

  test('all four locales include the editor title and accessible row labels', () => {
    for (const locale of [en, zhCN, zhTW, ru]) {
      expect(locale.oauth_model_alias.edit_title).toBeTruthy();
      expect(locale.oauth_model_alias.mapping_row).toContain('{{number}}');
      expect(locale.oauth_model_alias.remove_mapping).toContain('{{number}}');
    }
  });
});
