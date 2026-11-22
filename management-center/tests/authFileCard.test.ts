import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../src/i18n/index';
import {
  AuthFileCard,
  type AuthFileCardProps,
} from '../src/features/authFiles/components/AuthFileCard';
import type { AuthFileItem } from '../src/types';

const noop = () => {};
const file: AuthFileItem = {
  name: 'claude-person@example.com.json',
  type: 'claude',
  email: 'person@example.com',
  authIndex: 'idx-1',
} as AuthFileItem;

function render(overrides: Partial<AuthFileCardProps> = {}) {
  const props: AuthFileCardProps = {
    file,
    selected: false,
    disableControls: false,
    deleting: null,
    statusUpdating: {},
    manualRefreshing: {},
    cooldownResetting: {},
    onShowModels: noop,
    onManualRefresh: noop,
    onCooldownReset: noop,
    onOpenPrefixProxyEditor: noop,
    onDelete: noop,
    onToggleStatus: noop,
    onToggleSelect: noop,
    ...overrides,
  };
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(AuthFileCard, props))
  );
}

describe('auth file row', () => {
  test('leads with the blurred account, never the file name', () => {
    const markup = render();
    expect(markup).toMatch(/<span role="button"[^>]*blur-\[5px\][^>]*>person@example\.com<\/span>/);
    expect(markup).not.toContain('claude-person@example.com.json');
  });

  test('has one enable switch named after the account and reflecting the state', () => {
    const toggleLabel = i18n.t('auth_files.card_toggle', { name: 'person@example.com' });
    const enabled = render();
    expect(enabled.match(/role="switch"/g)).toHaveLength(1);
    expect(enabled).toMatch(new RegExp(`role="switch"[^>]*aria-checked="true"`));
    expect(enabled).toContain(`aria-label="${toggleLabel}"`);
    const disabled = render({ file: { ...file, disabled: true } });
    expect(disabled).toMatch(/role="switch"[^>]*aria-checked="false"/);
  });

  test('dims a disabled row but keeps its controls clear', () => {
    const markup = render({ file: { ...file, disabled: true } });
    expect(markup).toMatch(/data-slot="item-content"[^>]*class="[^"]*opacity-60/);
    const actions = markup.match(/<div data-slot="item-actions"[^>]*>/g) ?? [];
    expect(actions.length).toBeGreaterThan(0);
    for (const tag of actions) expect(tag).not.toContain('opacity-');
  });

  test('keeps the per-credential actions, each with an accessible name', () => {
    const markup = render();
    for (const key of [
      'auth_files.models_button',
      'auth_files.manual_refresh_button',
      'auth_files.prefix_proxy_button',
      'auth_files.delete_button',
    ]) {
      expect(markup).toContain(`aria-label="${i18n.t(key)}"`);
    }
    expect(markup).toContain(
      `aria-label="${i18n.t('auth_files.card_select', { name: 'person@example.com' })}"`
    );
  });

  test('locks the actions while controls are disabled', () => {
    const markup = render({ disableControls: true });
    const label = i18n.t('auth_files.delete_button');
    expect(markup).toMatch(
      new RegExp(
        `<button[^>]*disabled=""[^>]*aria-label="${label}"|<button[^>]*aria-label="${label}"[^>]*disabled=""`
      )
    );
    expect(markup).toMatch(/role="switch"[^>]*disabled=""|disabled=""[^>]*role="switch"/);
  });
});
