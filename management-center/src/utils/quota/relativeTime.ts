/**
 * Relative time beside absolute time.
 *
 * A quota card used to say `08-13 14:30` and leave the arithmetic to the
 * reader. The absolute instant is what you need to plan around; the relative
 * one ("in 11 days") is what you need to *react* to. Showing both costs one
 * short span and removes the mental subtraction, so every date on a card now
 * carries its own countdown.
 *
 * Pure and clock-free — `nowMs` is always passed in, so every case is directly
 * testable and the caller decides how often it ticks (see `useNow`).
 */

import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/utils/time/durations';

type RelativeUnit = 'day' | 'hour' | 'minute';

export interface RelativeTimeParts {
  /** Positive is future, negative is past. */
  sign: 1 | -1;
  /** One or two non-zero components, largest first, e.g. `1 hour 25 minutes`. */
  components: { value: number; unit: RelativeUnit }[];
}

/**
 * Split a gap into its two most significant units: days + hours past a day,
 * hours + minutes below it. A bare "in 5 hours" for 5h59m was off by almost an
 * hour, which matters most on the short windows where the countdown is read.
 *
 * Signed on purpose: the earlier timeline-local version clamped with
 * `Math.max(0, …)`, so a credit that expired last week read "in 1 minute".
 *
 * Truncated, not rounded: the ordinary countdown convention, and for a deadline
 * it never claims more time than remains. Sub-minute gaps floor to 1 minute so
 * nothing renders "in 0 minutes".
 */
export function relativeTimeParts(targetMs: number, nowMs: number): RelativeTimeParts {
  const delta = targetMs - nowMs;
  const sign = delta < 0 ? -1 : 1;
  const abs = Math.abs(delta);

  if (abs >= DAY_MS) {
    const days = Math.floor(abs / DAY_MS);
    const hours = Math.floor((abs % DAY_MS) / HOUR_MS);
    const components: RelativeTimeParts['components'] = [{ value: days, unit: 'day' }];
    if (hours > 0) components.push({ value: hours, unit: 'hour' });
    return { sign, components };
  }
  if (abs >= HOUR_MS) {
    const hours = Math.floor(abs / HOUR_MS);
    const minutes = Math.floor((abs % HOUR_MS) / MINUTE_MS);
    const components: RelativeTimeParts['components'] = [{ value: hours, unit: 'hour' }];
    if (minutes > 0) components.push({ value: minutes, unit: 'minute' });
    return { sign, components };
  }
  return {
    sign,
    components: [{ value: Math.max(1, Math.floor(abs / MINUTE_MS)), unit: 'minute' }],
  };
}

/**
 * Formatters are cached per locale and unit: this runs once per quota row per
 * minute, and constructing an Intl formatter is the expensive part.
 */
const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();
const unitFormatters = new Map<string, Intl.NumberFormat>();

function cachedFormatter<T>(
  cache: Map<string, T>,
  key: string,
  locale: string | undefined,
  create: (locale?: string) => T
): T {
  const hit = cache.get(key);
  if (hit) return hit;

  let formatter: T;
  try {
    formatter = create(locale);
  } catch {
    // An unexpected `resolvedLanguage` throws RangeError rather than falling
    // back on its own. A countdown in the wrong language beats no card at all.
    formatter = create(undefined);
  }
  cache.set(key, formatter);
  return formatter;
}

const getRelativeFormatter = (locale?: string) =>
  cachedFormatter(
    relativeFormatters,
    locale ?? '',
    locale,
    (l) => new Intl.RelativeTimeFormat(l, { numeric: 'always' })
  );

const getUnitFormatter = (unit: RelativeUnit, locale?: string) =>
  cachedFormatter(
    unitFormatters,
    `${unit}:${locale ?? ''}`,
    locale,
    (l) => new Intl.NumberFormat(l, { style: 'unit', unit, unitDisplay: 'long' })
  );

/**
 * Localized relative phrase, e.g. `in 1 hour 25 minutes` / `1小时 25分钟后` /
 * `2 days 3 hours ago`.
 *
 * The smallest component goes through `Intl.RelativeTimeFormat`, which owns the
 * direction wording ("in …", "… ago", "через …", "…후"). Larger components are
 * inserted just before its number, so the direction words wrap the whole span
 * in every locale we ship.
 */
export function formatRelativeInstant(targetMs: number, nowMs: number, locale?: string): string {
  const { sign, components } = relativeTimeParts(targetMs, nowMs);
  const last = components[components.length - 1];
  const leading = components
    .slice(0, -1)
    .map(({ value, unit }) => getUnitFormatter(unit, locale).format(value))
    .join(' ');

  const parts = getRelativeFormatter(locale).formatToParts(sign * last.value, last.unit);
  if (!leading) return parts.map((part) => part.value).join('');

  let inserted = false;
  return parts
    .map((part) => {
      if (inserted || part.type === 'literal') return part.value;
      inserted = true;
      return `${leading} ${part.value}`;
    })
    .join('');
}

/**
 * Absolute instant in the shape every quota row already uses (`MM-DD HH:mm`,
 * browser-local, 24-hour). Kept in one place so the reset labels baked at fetch
 * time and the ones formatted at render time can never drift apart.
 */
export function formatInstantShort(ms: number): string {
  if (!Number.isFinite(ms)) return '-';
  return new Date(ms).toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** A readable, localized alternative for the click-to-cycle reset label. */
export function formatInstantFull(ms: number, locale?: string): string {
  if (!Number.isFinite(ms)) return '-';
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  }
}

export interface ResetDisplay {
  absolute: string;
  /** Null when no usable instant was available — render the absolute half alone. */
  relative: string | null;
  /** Null alongside relative when the reset instant itself is unavailable. */
  full: string | null;
}

/**
 * Pair an already-formatted absolute label with a freshly computed relative one.
 *
 * The absolute label wins when present because providers bake it at fetch time
 * and some of them cannot be reproduced at render (`formatCodexResetLabel`
 * resolves `reset_after_seconds` against the fetch-time clock). The instant is
 * only used for the relative half, and its absence degrades to exactly the
 * pre-existing rendering — which is what a store entry cached by an older
 * build, with no `resetAtMs` field, will hit.
 *
 * Returns null when there is nothing worth rendering at all.
 */
export function buildResetDisplay(
  absoluteLabel: string | undefined | null,
  atMs: number | undefined | null,
  nowMs: number,
  locale?: string
): ResetDisplay | null {
  const trimmed = typeof absoluteLabel === 'string' ? absoluteLabel.trim() : '';
  const absolute = trimmed && trimmed !== '-' ? trimmed : null;
  const usableMs = typeof atMs === 'number' && Number.isFinite(atMs) ? atMs : null;

  if (absolute === null && usableMs === null) return null;

  return {
    absolute: absolute ?? formatInstantShort(usableMs as number),
    relative: usableMs === null ? null : formatRelativeInstant(usableMs, nowMs, locale),
    full: usableMs === null ? null : formatInstantFull(usableMs, locale),
  };
}
