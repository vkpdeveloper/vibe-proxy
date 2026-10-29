import { describe, expect, test } from 'bun:test';
import { modelDisplayName, namedModels } from '@/features/authFiles/modelNames';

describe('model display names', () => {
  test('rebuilds Claude names from the id in one order', () => {
    expect(modelDisplayName({ id: 'claude-haiku-4-5-20251001', display_name: 'Claude 4.5 Haiku' })).toBe(
      'Claude Haiku 4.5'
    );
    expect(modelDisplayName({ id: 'claude-opus-4-20250514', display_name: 'Claude 4 Opus' })).toBe(
      'Claude Opus 4'
    );
    expect(modelDisplayName({ id: 'claude-3-7-sonnet-20250219' })).toBe('Claude Sonnet 3.7');
    expect(modelDisplayName({ id: 'claude-fable-5-1' })).toBe('Claude Fable 5.1');
  });

  test('keeps aliases and other providers on their display name', () => {
    expect(modelDisplayName({ id: 'claude-6-astra', display_name: 'GPT 6.0 Astra' })).toBe(
      'GPT-6 Astra'
    );
    expect(modelDisplayName({ id: 'gpt-5.6-sol', display_name: 'GPT 5.6 Sol' })).toBe('GPT-5.6 Sol');
    expect(modelDisplayName({ id: 'gpt-image-2', display_name: 'GPT Image 2' })).toBe('GPT Image 2');
    expect(modelDisplayName({ id: 'grok-4.7' })).toBe('grok-4.7');
  });

  test('sorts newest version first', () => {
    const names = namedModels([
      { id: 'claude-3-5-haiku-20241022' },
      { id: 'claude-opus-5-5' },
      { id: 'claude-sonnet-4-6' },
    ]).map((model) => model.name);
    expect(names).toEqual(['Claude Opus 5.5', 'Claude Sonnet 4.6', 'Claude Haiku 3.5']);
  });
});
