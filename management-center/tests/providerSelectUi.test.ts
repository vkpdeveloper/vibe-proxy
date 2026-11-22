import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormSelect } from '@/features/providers/sheets/forms/FormControls';

test('Provider advanced editors consistently use the shared FormSelect instead of native menus', () => {
  for (const file of [
    'RuntimePolicyEditor',
    'ProviderBehaviorEditor',
    'ModelAdvancedFields',
    'ErrorRulesEditor',
  ]) {
    const source = readFileSync(
      new URL(`../src/features/providers/sheets/forms/${file}.tsx`, import.meta.url),
      'utf8'
    );
    expect(source).toMatch(/import \{[^}]*\bFormSelect\b[^}]*\} from '\.\/FormControls'/);
    expect(source).toContain('<FormSelect');
    expect(source).not.toMatch(/<select[\s>]/);
    expect(source).not.toMatch(/<option[\s>]/);
  }
});

test('FormSelect forwards validation, labels and disabled state to its trigger', () => {
  const markup = renderToStaticMarkup(
    createElement(FormSelect, {
      id: 'rule-action',
      value: 'stop',
      options: [{ value: 'stop', label: 'Stop' }],
      onChange: () => {},
      ariaLabel: 'Action',
      ariaLabelledBy: 'action-label',
      ariaDescribedBy: 'action-error',
      ariaInvalid: true,
      disabled: true,
    })
  );
  const trigger = /<button[^>]*id="rule-action"[^>]*>/.exec(markup)?.[0] ?? '';
  expect(trigger).not.toBe('');
  expect(trigger).toContain('aria-haspopup="listbox"');
  expect(trigger).toContain('aria-expanded="false"');
  expect(trigger).toContain('aria-label="Action"');
  expect(trigger).toContain('aria-labelledby="action-label"');
  expect(trigger).toContain('aria-describedby="action-error"');
  expect(trigger).toContain('aria-invalid="true"');
  expect(trigger).toContain('disabled=""');
  // The chosen label shows before the menu has ever opened.
  expect(markup).toContain('>Stop</span>');
});

test('FormSelect shows the label of an option whose value is empty', () => {
  const markup = renderToStaticMarkup(
    createElement(FormSelect, {
      value: '',
      options: [
        { value: '', label: 'Auto' },
        { value: 'gpt-5', label: 'gpt-5' },
      ],
      onChange: () => {},
      ariaLabel: 'Test model',
    })
  );
  expect(markup).toContain('>Auto</span>');
});
