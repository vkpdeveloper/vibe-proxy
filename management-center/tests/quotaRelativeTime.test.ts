/**
 * Relative-time formatting for quota cards.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildResetDisplay,
  formatInstantShort,
  formatQuotaResetTime,
  formatRelativeInstant,
  relativeTimeParts,
} from '@/utils/quota';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/utils/time/durations';

const NOW = new Date(2026, 7, 2, 12, 0, 0).getTime();

describe('relativeTimeParts', () => {
  const parts = (target: number) => relativeTimeParts(target, NOW);

  test('shows the two most significant units', () => {
    expect(parts(NOW + 35 * MINUTE_MS)).toEqual({
      sign: 1,
      components: [{ value: 35, unit: 'minute' }],
    });
    expect(parts(NOW + HOUR_MS + 25 * MINUTE_MS)).toEqual({
      sign: 1,
      components: [
        { value: 1, unit: 'hour' },
        { value: 25, unit: 'minute' },
      ],
    });
    expect(parts(NOW + 6 * DAY_MS + 4 * HOUR_MS + 30 * MINUTE_MS)).toEqual({
      sign: 1,
      components: [
        { value: 6, unit: 'day' },
        { value: 4, unit: 'hour' },
      ],
    });
  });

  test('drops a zero second component', () => {
    expect(parts(NOW + 2 * HOUR_MS)).toEqual({ sign: 1, components: [{ value: 2, unit: 'hour' }] });
    expect(parts(NOW + DAY_MS + 30 * MINUTE_MS)).toEqual({
      sign: 1,
      components: [{ value: 1, unit: 'day' }],
    });
  });

  test('truncates, so a deadline never appears further off than it is', () => {
    expect(parts(NOW + DAY_MS - 1)).toEqual({
      sign: 1,
      components: [
        { value: 23, unit: 'hour' },
        { value: 59, unit: 'minute' },
      ],
    });
  });

  test('past instants are negative rather than clamped to zero', () => {
    // The timeline-local predecessor clamped with Math.max(0, …), so an expired
    // credit read "in 1 minute".
    expect(parts(NOW - 3 * DAY_MS)).toEqual({ sign: -1, components: [{ value: 3, unit: 'day' }] });
  });

  test('sub-minute magnitudes floor to 1 in both directions', () => {
    expect(parts(NOW)).toEqual({ sign: 1, components: [{ value: 1, unit: 'minute' }] });
    expect(parts(NOW - 1)).toEqual({ sign: -1, components: [{ value: 1, unit: 'minute' }] });
  });
});

describe('formatRelativeInstant', () => {
  test('direction words wrap the whole two-unit span', () => {
    expect(formatRelativeInstant(NOW + HOUR_MS + 25 * MINUTE_MS, NOW, 'en')).toBe(
      'in 1 hour 25 minutes'
    );
    expect(formatRelativeInstant(NOW - 2 * DAY_MS - 3 * HOUR_MS, NOW, 'en')).toBe(
      '2 days 3 hours ago'
    );
    expect(formatRelativeInstant(NOW + HOUR_MS + 25 * MINUTE_MS, NOW, 'ru')).toBe(
      'через 1 час 25 минут'
    );
  });

  test('renders in the requested locale', () => {
    expect(formatRelativeInstant(NOW + 11 * DAY_MS, NOW, 'en')).toContain('days');
    expect(formatRelativeInstant(NOW + 11 * DAY_MS, NOW, 'zh-CN')).toContain('天');
    expect(formatRelativeInstant(NOW + 11 * DAY_MS, NOW, 'zh-TW')).toContain('天');
    expect(formatRelativeInstant(NOW + 11 * DAY_MS, NOW, 'ru')).toBeTruthy();
  });

  test('distinguishes past from future', () => {
    const future = formatRelativeInstant(NOW + 3 * DAY_MS, NOW, 'en');
    const past = formatRelativeInstant(NOW - 3 * DAY_MS, NOW, 'en');
    expect(future).not.toBe(past);
    expect(past).toContain('ago');
  });

  test('falls back instead of throwing on an unusable locale tag', () => {
    expect(() => formatRelativeInstant(NOW + DAY_MS, NOW, 'not-a-locale!!')).not.toThrow();
    expect(formatRelativeInstant(NOW + DAY_MS, NOW, 'not-a-locale!!')).toBeTruthy();
  });
});

describe('formatInstantShort', () => {
  test('matches the shape the baked reset labels already use', () => {
    const iso = new Date(2026, 7, 13, 14, 30).toISOString();
    expect(formatInstantShort(new Date(iso).getTime())).toBe(formatQuotaResetTime(iso));
  });

  test('degrades to a dash rather than "Invalid Date"', () => {
    expect(formatInstantShort(Number.NaN)).toBe('-');
  });
});

describe('buildResetDisplay', () => {
  test('pairs a baked absolute label with a computed relative one', () => {
    const display = buildResetDisplay('08-13 14:30', NOW + 11 * DAY_MS, NOW, 'en');
    expect(display).not.toBeNull();
    expect(display?.absolute).toBe('08-13 14:30');
    expect(display?.relative).toContain('11 days');
    expect(display?.full).toContain('2026');
  });

  test('keeps the baked label alone when the instant is missing', () => {
    // A store entry cached by an older build carries resetLabel but no resetAtMs.
    expect(buildResetDisplay('08-13 14:30', null, NOW, 'en')).toEqual({
      absolute: '08-13 14:30',
      relative: null,
      full: null,
    });
    expect(buildResetDisplay('08-13 14:30', undefined, NOW, 'en')?.relative).toBeNull();
  });

  test('derives the absolute half from the instant when no label was baked', () => {
    const at = NOW + 2 * HOUR_MS;
    const display = buildResetDisplay(undefined, at, NOW, 'en');
    expect(display?.absolute).toBe(formatInstantShort(at));
    expect(display?.relative).toContain('2 hours');
    expect(display?.full).toContain('2026');
  });

  test('returns null when there is nothing to render', () => {
    expect(buildResetDisplay(undefined, null, NOW, 'en')).toBeNull();
    expect(buildResetDisplay('', null, NOW, 'en')).toBeNull();
    expect(buildResetDisplay('   ', null, NOW, 'en')).toBeNull();
    // '-' is the providers' own placeholder for "no reset known".
    expect(buildResetDisplay('-', null, NOW, 'en')).toBeNull();
  });

  test('treats a placeholder label with a real instant as renderable', () => {
    const display = buildResetDisplay('-', NOW + DAY_MS, NOW, 'en');
    expect(display?.absolute).toBe(formatInstantShort(NOW + DAY_MS));
    expect(display?.relative).toContain('1 day');
  });

  test('rejects a non-finite instant', () => {
    expect(buildResetDisplay(undefined, Number.NaN, NOW, 'en')).toBeNull();
    expect(
      buildResetDisplay('08-13 14:30', Number.POSITIVE_INFINITY, NOW, 'en')?.relative
    ).toBeNull();
  });
});
