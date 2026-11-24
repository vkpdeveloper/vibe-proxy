import { expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import { getPayloadReplaceRuleError, useVisualConfig } from '../src/hooks/useVisualConfig';
import type { PayloadReplaceRule, VisualConfigValues } from '../src/types/visualConfig';

const unescape = (markup: string) =>
  markup
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');

type Outcome = { values: VisualConfigValues; yaml: string; blocked: boolean };

/** Loads YAML, applies one visual edit, and returns what the editor saw and would save. */
function edit(
  yaml: string,
  change: (values: VisualConfigValues) => Partial<VisualConfigValues>
): Outcome {
  let outcome: Outcome | undefined;
  function Harness() {
    const visualConfig = useVisualConfig();
    const [phase, setPhase] = useState(0);
    if (phase === 0) {
      visualConfig.loadVisualValuesFromYaml(yaml);
      setPhase(1);
    } else if (phase === 1) {
      visualConfig.setVisualValues(change(visualConfig.visualValues));
      setPhase(2);
    } else {
      outcome = {
        values: visualConfig.visualValues,
        yaml: visualConfig.applyVisualChangesToYaml(yaml),
        blocked: visualConfig.visualHasPayloadValidationErrors,
      };
    }
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  if (!outcome) throw new Error('harness did not finish');
  return { ...outcome, yaml: unescape(outcome.yaml) };
}

const REPLACE_YAML = `requests:
  payload:
    replace:
      # keep-role-rule
      - models:
          - name: gpt-*
            protocol: openai
        target:
          role: system
          all: true
        replacements:
          - Claude Code: Assistant
          - pattern: "(?i)anthropic"
            replacement: vendor
      - models:
          - name: gemini-*
        target:
          paths:
            - contents.0.parts.0.text
        replacements:
          - foo: bar
`;

test('parses role and path targets with literal and regex replacements', () => {
  const { values } = edit(REPLACE_YAML, () => ({}));
  const [role, paths] = values.payloadReplaceRules;
  expect(role).toMatchObject({
    targetKind: 'role',
    role: 'system',
    all: true,
    models: [{ name: 'gpt-*', protocol: 'openai' }],
    replacements: [
      { regex: false, from: 'Claude Code', to: 'Assistant' },
      { regex: true, from: '(?i)anthropic', to: 'vendor' },
    ],
  });
  expect(paths).toMatchObject({
    targetKind: 'paths',
    paths: ['contents.0.parts.0.text'],
    replacements: [{ regex: false, from: 'foo', to: 'bar' }],
  });
});

test('editing one rule keeps comments and the untouched rule as written', () => {
  const { yaml } = edit(REPLACE_YAML, (values) => ({
    payloadReplaceRules: values.payloadReplaceRules.map((rule, index) =>
      index === 1
        ? {
            ...rule,
            targetKind: 'role',
            role: 'user',
            all: false,
            positions: '1, 3',
            replacements: [...rule.replacements, { id: 'n', regex: false, from: '', to: 'x' }],
          }
        : rule
    ),
  }));
  expect(yaml).toContain('# keep-role-rule');
  expect(parseYaml(yaml).requests.payload.replace).toEqual([
    {
      models: [{ name: 'gpt-*', protocol: 'openai' }],
      target: { role: 'system', all: true },
      replacements: [
        { 'Claude Code': 'Assistant' },
        { pattern: '(?i)anthropic', replacement: 'vendor' },
      ],
    },
    {
      models: [{ name: 'gemini-*' }],
      // The blank replacement row is not written.
      target: { role: 'user', positions: [1, 3] },
      replacements: [{ foo: 'bar' }],
    },
  ]);
});

test('removing every rule removes the replace key', () => {
  const { yaml } = edit(REPLACE_YAML, () => ({ payloadReplaceRules: [] }));
  expect(parseYaml(yaml) ?? {}).not.toHaveProperty('requests.payload.replace');
});

const rule = (patch: Partial<PayloadReplaceRule>): PayloadReplaceRule => ({
  id: 'r',
  models: [{ id: 'm', name: 'gpt-*' }],
  targetKind: 'role',
  role: 'user',
  all: false,
  positions: '1',
  paths: [],
  replacements: [{ id: 'e', regex: false, from: 'a', to: 'b' }],
  ...patch,
});

test('rejects rules the backend would drop', () => {
  expect(getPayloadReplaceRuleError(rule({}))).toBeUndefined();
  expect(getPayloadReplaceRuleError(rule({ positions: '' }))).toBe('payload_replace_positions');
  expect(getPayloadReplaceRuleError(rule({ positions: '0' }))).toBe('payload_replace_positions');
  expect(getPayloadReplaceRuleError(rule({ positions: '1.5' }))).toBe('payload_replace_positions');
  expect(getPayloadReplaceRuleError(rule({ positions: '', all: true }))).toBeUndefined();
  expect(getPayloadReplaceRuleError(rule({ targetKind: 'paths', paths: [' '] }))).toBe(
    'payload_replace_paths'
  );
  expect(
    getPayloadReplaceRuleError(
      rule({ replacements: [{ id: 'e', regex: true, from: '', to: 'x' }] })
    )
  ).toBe('payload_replace_replacements');
});

test('an invalid rule blocks the save only once it names a model', () => {
  const broken = rule({ positions: '' });
  expect(edit('', () => ({ payloadReplaceRules: [broken] })).blocked).toBe(true);
  expect(edit('', () => ({ payloadReplaceRules: [{ ...broken, models: [] }] })).blocked).toBe(
    false
  );
});

const SENSITIVE_YAML = `oauth:
  providers:
    devin:
      sensitive-words:
        - secret
      sensitive-words-replace:
        Claude Code: Devin
      sensitive-patterns-replace:
        - pattern: "v\\\\d+"
          replacement: vN
`;

test('sensitive replacements split back into the words map and the patterns list', () => {
  const { values, yaml } = edit(SENSITIVE_YAML, (current) => ({
    devinSensitiveReplacements: [
      ...current.devinSensitiveReplacements,
      { id: 'n', regex: false, from: 'Anthropic', to: 'Vendor' },
    ],
    antigravitySensitiveReplacements: [{ id: 'a', regex: true, from: 'gpt-\\d', to: 'model' }],
  }));
  expect(values.devinSensitiveReplacements).toMatchObject([
    { regex: false, from: 'Claude Code', to: 'Devin' },
    { regex: true, from: 'v\\d+', to: 'vN' },
    { regex: false, from: 'Anthropic', to: 'Vendor' },
  ]);
  expect(parseYaml(yaml).oauth.providers).toEqual({
    devin: {
      'sensitive-words': ['secret'],
      'sensitive-words-replace': { 'Claude Code': 'Devin', Anthropic: 'Vendor' },
      'sensitive-patterns-replace': [{ pattern: 'v\\d+', replacement: 'vN' }],
    },
    antigravity: {
      'sensitive-patterns-replace': [{ pattern: 'gpt-\\d', replacement: 'model' }],
    },
  });
});

test('clearing sensitive replacements removes both keys and keeps the sensitive words', () => {
  const { yaml } = edit(SENSITIVE_YAML, () => ({ devinSensitiveReplacements: [] }));
  expect(parseYaml(yaml).oauth.providers).toEqual({ devin: { 'sensitive-words': ['secret'] } });
});
