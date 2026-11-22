/**
 * Builder functions for constructing quota data structures.
 */

import type {
  AntigravityQuotaBucket,
  AntigravityQuotaGroup,
  AntigravityQuotaSummaryPayload,
  XaiBillingConfig,
  XaiBillingPeriod,
  XaiBillingPeriodType,
  XaiBillingSummary,
  XaiProductUsageSummary,
} from '@/types';
import { normalizeNumberValue, normalizeQuotaFraction, normalizeStringValue } from './parsers';
import { resolveResetMs } from './resetInstants';

const ANTIGRAVITY_BUCKET_WINDOW_ORDER = new Map<string, number>([
  ['5h', 0],
  ['five-hour', 0],
  ['five_hour', 0],
  ['weekly', 1],
  ['week', 1],
]);

function toStableId(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function getAntigravityWindowOrder(bucket: AntigravityQuotaBucket): number {
  const window = bucket.window?.toLowerCase();
  if (!window) return Number.MAX_SAFE_INTEGER;
  return ANTIGRAVITY_BUCKET_WINDOW_ORDER.get(window) ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Window length in hours for an Antigravity bucket.
 *
 * Antigravity states the period explicitly in `window`, so this is a lookup
 * rather than a keyword guess. The accepted spellings mirror
 * ANTIGRAVITY_BUCKET_WINDOW_ORDER above.
 */
function antigravityPeriodHours(window: string | undefined): number | null {
  switch ((window ?? '').trim().toLowerCase()) {
    case '5h':
    case 'five-hour':
    case 'five_hour':
      return 5;
    case 'weekly':
    case 'week':
      return 24 * 7;
    default:
      return null;
  }
}

export function buildAntigravityQuotaGroups(
  payload: AntigravityQuotaSummaryPayload
): AntigravityQuotaGroup[] {
  const groups = Array.isArray(payload.groups) ? payload.groups : [];

  return groups
    .map((group, groupIndex): AntigravityQuotaGroup | null => {
      const label =
        normalizeStringValue(group.displayName ?? group.display_name) ??
        `Quota Group ${groupIndex + 1}`;
      const groupId = toStableId(label, `quota-group-${groupIndex + 1}`);
      const buckets = Array.isArray(group.buckets) ? group.buckets : [];
      const parsedBuckets = buckets
        .map((bucket, bucketIndex): AntigravityQuotaBucket | null => {
          const remainingFraction = normalizeQuotaFraction(
            bucket.remainingFraction ?? bucket.remaining_fraction
          );
          if (remainingFraction === null) return null;

          const window = normalizeStringValue(bucket.window) ?? undefined;
          const rawId =
            normalizeStringValue(bucket.bucketId ?? bucket.bucket_id) ??
            `${groupId}-${window ?? 'bucket'}-${bucketIndex + 1}`;
          const label =
            normalizeStringValue(bucket.displayName ?? bucket.display_name) ??
            normalizeStringValue(bucket.description) ??
            window ??
            rawId;

          const resetTime =
            normalizeStringValue(bucket.resetTime ?? bucket.reset_time) ?? undefined;

          return {
            id: rawId,
            label,
            window,
            remainingFraction,
            resetTime,
            description: normalizeStringValue(bucket.description) ?? undefined,
            resetAtMs: resolveResetMs([resetTime]),
            periodHours: antigravityPeriodHours(window),
          };
        })
        .filter((bucket): bucket is AntigravityQuotaBucket => bucket !== null)
        .sort((a, b) => {
          const orderDiff = getAntigravityWindowOrder(a) - getAntigravityWindowOrder(b);
          if (orderDiff !== 0) return orderDiff;
          return a.label.localeCompare(b.label);
        });

      if (parsedBuckets.length === 0) return null;

      return {
        id: groupId,
        label,
        description: normalizeStringValue(group.description) ?? undefined,
        buckets: parsedBuckets,
      };
    })
    .filter((group): group is AntigravityQuotaGroup => group !== null);
}

function normalizeXaiCentValue(value: XaiBillingConfig['monthlyLimit']): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return normalizeNumberValue((value as { val?: unknown }).val);
  }
  return normalizeNumberValue(value);
}

function resolveXaiPeriodType(period?: XaiBillingPeriod | null): XaiBillingPeriodType {
  const rawType = normalizeStringValue(period?.type)?.toLowerCase() ?? '';
  if (rawType.includes('weekly')) return 'weekly';
  if (rawType.includes('monthly')) return 'monthly';
  return 'unknown';
}

function normalizeXaiProductUsage(
  productUsage: XaiBillingConfig['productUsage'],
  fallbackPrefix: string
): XaiProductUsageSummary[] {
  if (!Array.isArray(productUsage)) return [];

  return productUsage
    .map((item, index): XaiProductUsageSummary | null => {
      if (!item || typeof item !== 'object') return null;
      const product = normalizeStringValue(item.product) ?? `${fallbackPrefix} ${index + 1}`;
      const usagePercent = normalizeNumberValue(item.usagePercent ?? item.usage_percent);
      return { product, usagePercent };
    })
    .filter((item): item is XaiProductUsageSummary => item !== null);
}

const emptyXaiBillingSummary = (): XaiBillingSummary => ({
  mode: 'billing',
  source: 'cli-chat-proxy',
  periodType: 'unknown',
  usagePercent: null,
  productUsage: [],
  monthlyLimitCents: null,
  usedCents: null,
  includedUsedCents: null,
  onDemandCapCents: null,
  onDemandUsedCents: null,
  onDemandUsedPercent: null,
  prepaidBalanceCents: null,
  usedPercent: null,
});

/**
 * Reset instant and length of an xAI period.
 *
 * The length comes from the period's own start → end span rather than being
 * assumed, so a non-standard cycle still positions correctly. Null when the
 * payload states an end without a start; the caller supplies the default it
 * knows is right for the period type.
 */
function xaiPeriodInstants(
  periodStart: string | undefined,
  periodEnd: string | undefined
): { resetAtMs: number | null; periodHours: number | null } {
  const resetAtMs = resolveResetMs([periodEnd]);
  const startMs = resolveResetMs([periodStart]);
  const periodHours =
    resetAtMs !== null && startMs !== null && resetAtMs > startMs
      ? (resetAtMs - startMs) / 3_600_000
      : null;
  return { resetAtMs, periodHours };
}

export function resolveXaiSubscriptionPlan(
  tier: string | null | undefined,
  display: string | null | undefined
): { label: string; tier: 'elite' | 'premium' | 'standard' } | null {
  const label = normalizeStringValue(display) ?? normalizeStringValue(tier);
  if (!label) return null;
  const key = `${display ?? ''} ${tier ?? ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const planTier = key.includes('heavy')
    ? 'elite'
    : key.includes('supergrok') || key.includes('premium')
      ? 'premium'
      : 'standard';
  return { label, tier: planTier };
}

export function buildXaiBillingSummary(
  config: XaiBillingConfig | null | undefined
): XaiBillingSummary | null {
  if (!config || typeof config !== 'object') return null;

  const summary = emptyXaiBillingSummary();
  const currentPeriod = config.currentPeriod ?? config.current_period ?? null;
  const periodType = resolveXaiPeriodType(currentPeriod);
  const creditUsagePercent = normalizeNumberValue(
    config.creditUsagePercent ?? config.credit_usage_percent
  );
  const periodStart =
    normalizeStringValue(currentPeriod?.start) ??
    normalizeStringValue(config.billingPeriodStart ?? config.billing_period_start) ??
    undefined;
  const periodEnd =
    normalizeStringValue(currentPeriod?.end) ??
    normalizeStringValue(config.billingPeriodEnd ?? config.billing_period_end) ??
    undefined;
  const productUsage = normalizeXaiProductUsage(
    config.productUsage ?? config.product_usage,
    'Product'
  );

  const monthlyLimitCents = normalizeXaiCentValue(config.monthlyLimit ?? config.monthly_limit);
  const usedCents = normalizeXaiCentValue(config.used);
  const onDemandCapCents = normalizeXaiCentValue(config.onDemandCap ?? config.on_demand_cap);
  const explicitOnDemandUsedCents = normalizeXaiCentValue(
    config.onDemandUsed ?? config.on_demand_used
  );
  const billingPeriodStart =
    normalizeStringValue(config.billingPeriodStart ?? config.billing_period_start) ?? undefined;
  const billingPeriodEnd =
    normalizeStringValue(config.billingPeriodEnd ?? config.billing_period_end) ?? undefined;

  const includedUsedCents =
    usedCents === null
      ? null
      : monthlyLimitCents !== null && monthlyLimitCents > 0
        ? Math.min(usedCents, monthlyLimitCents)
        : usedCents;
  const derivedOnDemandUsedCents =
    usedCents !== null && monthlyLimitCents !== null
      ? Math.max(0, usedCents - monthlyLimitCents)
      : null;
  const onDemandUsedCents = explicitOnDemandUsedCents ?? derivedOnDemandUsedCents;
  const prepaidBalanceCents = normalizeXaiCentValue(
    config.prepaidBalance ?? config.prepaid_balance
  );
  const usedPercent =
    monthlyLimitCents !== null && monthlyLimitCents > 0 && includedUsedCents !== null
      ? (includedUsedCents / monthlyLimitCents) * 100
      : null;
  const onDemandUsedPercent =
    onDemandCapCents !== null && onDemandCapCents > 0 && onDemandUsedCents !== null
      ? (onDemandUsedCents / onDemandCapCents) * 100
      : null;

  const hasWeeklyData =
    creditUsagePercent !== null || periodType === 'weekly' || productUsage.length > 0;
  const hasMonthlyData =
    monthlyLimitCents !== null ||
    usedCents !== null ||
    (!hasWeeklyData && (onDemandCapCents !== null || !!billingPeriodEnd));

  if (!hasWeeklyData && !hasMonthlyData) return null;

  summary.periodType = hasWeeklyData
    ? periodType === 'unknown'
      ? 'weekly'
      : periodType
    : 'monthly';
  summary.usagePercent = hasWeeklyData ? creditUsagePercent : usedPercent;
  summary.periodStart = hasWeeklyData ? periodStart : billingPeriodStart;
  summary.periodEnd = hasWeeklyData ? periodEnd : billingPeriodEnd;
  summary.productUsage = productUsage;
  summary.monthlyLimitCents = monthlyLimitCents;
  summary.usedCents = usedCents;
  summary.includedUsedCents = includedUsedCents;
  summary.onDemandCapCents = onDemandCapCents;
  summary.onDemandUsedCents = onDemandUsedCents;
  summary.onDemandUsedPercent = onDemandUsedPercent;
  summary.prepaidBalanceCents = prepaidBalanceCents;
  summary.billingPeriodStart = hasMonthlyData ? billingPeriodStart : undefined;
  summary.billingPeriodEnd = hasMonthlyData ? billingPeriodEnd : undefined;
  summary.usedPercent = usedPercent;

  const periodInstants = xaiPeriodInstants(summary.periodStart, summary.periodEnd);
  summary.resetAtMs = periodInstants.resetAtMs;
  summary.periodHours = periodInstants.periodHours;

  return summary;
}

export function mergeXaiBillingSummaries(
  primary: XaiBillingSummary | null,
  fallback: XaiBillingSummary | null
): XaiBillingSummary | null {
  if (!primary) return fallback;
  if (!fallback) return primary;

  // Keep the active period atomic. The primary (weekly endpoint) and fallback
  // (monthly endpoint) describe different clocks, so borrowing one endpoint's
  // dates for the other's period type would turn a billing rollover into a
  // quota reset. Keep usage with that same period too: monthly spending must
  // not replace an unavailable weekly percentage.
  const periodSummary =
    primary.periodType !== 'unknown'
      ? primary
      : fallback.periodType !== 'unknown'
        ? fallback
        : primary;
  const periodStart = periodSummary.periodStart;
  const periodEnd = periodSummary.periodEnd;
  const periodInstants = xaiPeriodInstants(periodStart, periodEnd);

  return {
    mode: 'billing',
    source: 'cli-chat-proxy',
    periodType: periodSummary.periodType,
    usagePercent: periodSummary.usagePercent,
    periodStart,
    periodEnd,
    resetAtMs: periodInstants.resetAtMs,
    periodHours: periodInstants.periodHours,
    productUsage: primary.productUsage.length > 0 ? primary.productUsage : fallback.productUsage,
    monthlyLimitCents: primary.monthlyLimitCents ?? fallback.monthlyLimitCents,
    usedCents: primary.usedCents ?? fallback.usedCents,
    includedUsedCents: primary.includedUsedCents ?? fallback.includedUsedCents,
    onDemandCapCents: primary.onDemandCapCents ?? fallback.onDemandCapCents,
    onDemandUsedCents: primary.onDemandUsedCents ?? fallback.onDemandUsedCents,
    onDemandUsedPercent: primary.onDemandUsedPercent ?? fallback.onDemandUsedPercent,
    prepaidBalanceCents: primary.prepaidBalanceCents ?? fallback.prepaidBalanceCents,
    planLabel: primary.planLabel ?? fallback.planLabel,
    planTier: primary.planTier ?? fallback.planTier,
    billingPeriodStart: primary.billingPeriodStart ?? fallback.billingPeriodStart,
    billingPeriodEnd: primary.billingPeriodEnd ?? fallback.billingPeriodEnd,
    usedPercent: primary.usedPercent ?? fallback.usedPercent,
  };
}
