import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '../src/i18n/index';
import { OAuthExcludedCard } from '../src/features/authFiles/components/OAuthExcludedCard';
import { OAuthModelAliasCard } from '../src/features/authFiles/components/OAuthModelAliasCard';

const noop = () => {};
const noopAsync = async () => {};

// The add button is the only control besides retry; it must be disabled while the
// config failed to load, and the empty state must offer a retry.
function expectRetryAndBlockedWrites(markup: string) {
  expect(markup).toContain('data-slot="empty-content"');
  expect(markup).toContain(`>${i18n.t('common.refresh')}</button>`);
  expect(markup).toContain(i18n.t('notification.refresh_failed'));
  const buttons = markup.match(/<button[^>]*>/g) ?? [];
  const retry = buttons.filter((tag) => !tag.includes('disabled=""'));
  expect(retry).toHaveLength(1);
  expect(buttons.length).toBeGreaterThan(1);
}

describe('OAuth configuration load guards', () => {
  test('disables excluded-model writes and exposes retry after a load failure', () => {
    const markup = renderToStaticMarkup(
      createElement(OAuthExcludedCard, {
        disableControls: false,
        excludedError: 'load',
        excluded: {},
        onRetry: noop,
        onAdd: noop,
        onEdit: noop,
        onDelete: noop,
      })
    );

    expectRetryAndBlockedWrites(markup);
  });

  test('disables model-alias writes and exposes retry after a load failure', () => {
    const markup = renderToStaticMarkup(
      createElement(OAuthModelAliasCard, {
        disableControls: false,
        viewMode: 'list',
        onViewModeChange: noop,
        onRetry: noop,
        onAdd: noop,
        onEditProvider: noop,
        onDeleteProvider: noop,
        modelAliasError: 'load',
        modelAlias: {},
        allProviderModels: {},
        onUpdate: noopAsync,
        onDeleteLink: noop,
        onToggleFork: noopAsync,
        onRenameAlias: noopAsync,
        onDeleteAlias: noop,
      })
    );

    expectRetryAndBlockedWrites(markup);
  });
});
