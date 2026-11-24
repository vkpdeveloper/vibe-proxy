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

  test('folds the actions into one named menu beside the switch', () => {
    const markup = render();
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toMatch(
      new RegExp(`aria-label="${i18n.t('common.more')}"[^>]*aria-haspopup="menu"`)
    );
    // No bare icon actions on the card itself.
    for (const key of ['auth_files.models_button', 'auth_files.delete_button']) {
      expect(markup).not.toContain(`aria-label="${i18n.t(key)}"`);
    }
    expect(markup).toContain(
      `aria-label="${i18n.t('auth_files.card_select', { name: 'person@example.com' })}"`
    );
  });

  test('offers the sign-in fix as a labelled button on a sign-in problem', () => {
    const label = i18n.t('auth_files.manual_refresh_button');
    expect(render()).not.toContain(`>${label}</button>`);
    const markup = render({
      file: { ...file, status: 'error', status_message: '401 invalid_grant' } as AuthFileItem,
    });
    expect(markup).toMatch(new RegExp(`<button[^>]*>(<svg.*?</svg>)?${label}</button>`));
  });

  test('hides the selection cell on phones until select mode', () => {
    // The label around the checkbox is the phone tap target, so it carries the visibility.
    const cell = (markup: string) =>
      markup.match(/<label[^>]*>(?=<button[^>]*role="checkbox")/)?.[0] ?? '';
    expect(cell(render())).toContain('max-sm:hidden');
    expect(cell(render({ selecting: true }))).not.toContain('max-sm:hidden');
  });

  test('labels request counts and names both badges when in use and preferred', () => {
    const markup = render({
      file: {
        ...file,
        successCount: 66,
        failureCount: 0,
        routing_selection: {
          selected: true,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      } as AuthFileItem,
      showAccountPreference: true,
      accountPreferred: true,
    });
    expect(markup).not.toContain('> / <');
    expect(markup).toContain(i18n.t('auth_files.count_success', { count: 66 }));
    expect(markup).toContain(i18n.t('auth_files.count_failure', { count: 0 }));
    expect(markup).toContain(`${i18n.t('auth_files.preferred_short')}</span>`);
    expect(markup).toContain(i18n.t('auth_files.routing_selected'));
  });

  test('locks the switch while controls are disabled', () => {
    const markup = render({ disableControls: true });
    expect(markup).toMatch(/role="switch"[^>]*disabled=""|disabled=""[^>]*role="switch"/);
  });

  test('shows the last known quota even when stale or when no window routes', () => {
    const past = '2020-06-01T00:00:00Z';
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const window = (id: string, remaining: number, routing: boolean) => ({
      id,
      label: id,
      used_percent: 100 - remaining,
      remaining_percent: remaining,
      reset_at: future,
      known: true,
      routing,
    });
    const percent = (remaining: number) =>
      i18n.t('auth_files.quota_drain_remaining', { percent: remaining });
    // A poll past its stale time still reads as a percentage, not "stale".
    const stale = render({
      file: {
        ...file,
        quota_capacity: {
          provider: 'claude',
          supported: true,
          fetched_at: past,
          stale_at: past,
          windows: [window('weekly', 94, true)],
        },
      } as AuthFileItem,
    });
    expect(stale).toContain(percent(94));
    // OpenCode Go marks no window as routing: fall back to the tightest known one.
    const noRouting = render({
      file: {
        ...file,
        type: 'opencode-go',
        quota_capacity: {
          provider: 'opencode-go',
          supported: true,
          windows: [window('rolling', 100, false), window('monthly', 63, false)],
        },
      } as AuthFileItem,
    });
    expect(noRouting).toContain(percent(63));
    expect(noRouting).not.toContain(i18n.t('auth_files.quota_drain_unavailable'));
  });
});
