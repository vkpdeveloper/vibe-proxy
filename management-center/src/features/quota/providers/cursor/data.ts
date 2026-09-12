/** Cursor quota data from the IDE dashboard API. */

import type { TFunction } from 'i18next';
import type {
  AuthFileItem,
  CursorCurrentPeriodUsagePayload,
  CursorPlanInfoPayload,
  CursorQuotaState,
  CursorQuotaWindow,
  CursorSandUsagePayload,
} from '@/types';
import { apiCallApi, getApiCallErrorMessage } from '@/services/api';
import {
  CURSOR_CURRENT_PERIOD_USAGE_URL,
  CURSOR_PLAN_INFO_URL,
  CURSOR_REQUEST_HEADERS,
  CURSOR_SAND_USAGE_URL,
  createStatusError,
  isCursorFile,
  isDisabledAuthFile,
  normalizeNumberValue,
  normalizeStringValue,
  resolveResetMs,
} from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

export interface CursorQuotaData {
  windows: CursorQuotaWindow[];
  planType: string | null;
  onDemandUsedCents: number | null;
  onDemandLimitCents: number | null;
  billingCycleEnd: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const durationHours = (start: unknown, end: unknown): number | null => {
  const startMs = resolveResetMs([start]);
  const endMs = resolveResetMs([end]);
  if (startMs === null || endMs === null || endMs <= startMs) return null;
  return (endMs - startMs) / (60 * 60 * 1000);
};

const percentFromAmount = (usedCents: number | null, limitCents: number | null): number | null => {
  if (usedCents === null || limitCents === null || limitCents <= 0) return null;
  return (usedCents / limitCents) * 100;
};

export function buildCursorQuotaData(
  periodPayload: CursorCurrentPeriodUsagePayload,
  planPayload: CursorPlanInfoPayload,
  t: TFunction,
  sandPayload: CursorSandUsagePayload = {}
): CursorQuotaData {
  const planUsage = periodPayload.planUsage ?? {};
  const spendLimit = periodPayload.spendLimitUsage ?? {};
  const planInfo = planPayload.planInfo ?? {};
  const billingCycleStart = periodPayload.billingCycleStart;
  const rawBillingCycleEnd = periodPayload.billingCycleEnd ?? planInfo.billingCycleEnd;
  const billingCycleEnd = normalizeStringValue(rawBillingCycleEnd);
  const resetAtMs = resolveResetMs([rawBillingCycleEnd]);
  const periodHours = durationHours(billingCycleStart, rawBillingCycleEnd);

  const totalSpend = normalizeNumberValue(planUsage.totalSpend);
  const reportedLimit = normalizeNumberValue(planUsage.limit);
  const includedLimit = normalizeNumberValue(planInfo.includedAmountCents);
  const totalLimit = reportedLimit && reportedLimit > 0 ? reportedLimit : includedLimit;
  const totalPercent =
    normalizeNumberValue(planUsage.totalPercentUsed) ?? percentFromAmount(totalSpend, totalLimit);

  const windows: CursorQuotaWindow[] = [];
  const addWindow = (
    id: string,
    labelKey: string,
    descriptionKey: string,
    usedPercent: number | null,
    usedCents?: number | null,
    limitCents?: number | null
  ) => {
    if (usedPercent === null && usedCents == null && limitCents == null) return;
    windows.push({
      id,
      label: t(labelKey),
      labelKey,
      descriptionKey,
      usedPercent,
      resetAtMs,
      periodHours,
      usedCents,
      limitCents,
    });
  };

  const cursorModelsPercent = normalizeNumberValue(planUsage.autoPercentUsed);
  const otherModelsPercent = normalizeNumberValue(planUsage.apiPercentUsed);

  addWindow(
    'cursor-models',
    'cursor_quota.cursor_models',
    'cursor_quota.cursor_models_desc',
    cursorModelsPercent
  );
  addWindow(
    'other-models',
    'cursor_quota.other_models',
    'cursor_quota.other_models_desc',
    otherModelsPercent
  );

  // New Cursor plans expose two distinct monthly pools. totalPercentUsed is an
  // aggregate ruler, not a third allowance, so showing all three side-by-side
  // makes the card look as though the plan includes three independent buckets.
  // Keep the aggregate only as a compatibility fallback for older payloads.
  if (cursorModelsPercent === null && otherModelsPercent === null) {
    addWindow(
      'plan',
      'cursor_quota.overall_included_usage',
      'cursor_quota.overall_included_usage_desc',
      totalPercent,
      totalSpend,
      totalLimit
    );
  }

  const pooledEnterprise =
    sandPayload.usesPooledEnterpriseAllowance ??
    sandPayload.uses_pooled_enterprise_allowance ??
    false;
  if (!pooledEnterprise) {
    const grokReset =
      sandPayload.nextResetTimestampUtc ?? sandPayload.next_reset_timestamp_utc ?? null;
    const grokStart = sandPayload.currentPeriodStart ?? sandPayload.current_period_start ?? null;
    const grokPercent = normalizeNumberValue(sandPayload.usagePercent ?? sandPayload.usage_percent);
    if (grokPercent !== null) {
      windows.push({
        id: 'grok-bot',
        label: t('cursor_quota.grok_bot_weekly'),
        labelKey: 'cursor_quota.grok_bot_weekly',
        descriptionKey: 'cursor_quota.grok_bot_weekly_desc',
        usedPercent: grokPercent,
        resetAtMs: resolveResetMs([grokReset]),
        periodHours: durationHours(grokStart, grokReset),
      });
    }
  }

  return {
    windows,
    planType: normalizeStringValue(planInfo.planName),
    onDemandUsedCents:
      normalizeNumberValue(spendLimit.pooledUsed) ??
      normalizeNumberValue(spendLimit.individualUsed),
    onDemandLimitCents: normalizeNumberValue(spendLimit.pooledLimit),
    billingCycleEnd,
  };
}

const requestCursorDashboard = async (
  authIndex: string,
  url: string
): Promise<Record<string, unknown>> => {
  const result = await apiCallApi.request({
    authIndex,
    method: 'POST',
    url,
    header: CURSOR_REQUEST_HEADERS,
    data: '{}',
  });
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }
  const payload = asRecord(result.body);
  if (!payload) throw new Error('Invalid Cursor dashboard response');
  return payload;
};

const fetchCursorQuota = async (file: AuthFileItem, t: TFunction): Promise<CursorQuotaData> => {
  const authIndex = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
  if (!authIndex) throw new Error(t('cursor_quota.missing_auth_index'));

  const [periodPayload, planResult, sandResult] = await Promise.all([
    requestCursorDashboard(authIndex, CURSOR_CURRENT_PERIOD_USAGE_URL),
    requestCursorDashboard(authIndex, CURSOR_PLAN_INFO_URL).catch(() => ({})),
    requestCursorDashboard(authIndex, CURSOR_SAND_USAGE_URL).catch(() => ({})),
  ]);

  const data = buildCursorQuotaData(
    periodPayload as CursorCurrentPeriodUsagePayload,
    planResult as CursorPlanInfoPayload,
    t,
    sandResult as CursorSandUsagePayload
  );
  if (data.windows.length === 0 && data.onDemandLimitCents === null) {
    throw new Error(t('cursor_quota.empty_data'));
  }
  return data;
};

export const CURSOR_CONFIG: QuotaProviderData<CursorQuotaState, CursorQuotaData> = {
  type: 'cursor',
  i18nPrefix: 'cursor_quota',
  filterFn: (file) => isCursorFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchCursorQuota,
  storeSelector: (state) => state.cursorQuota,
  storeSetter: 'setCursorQuota',
  buildLoadingState: () => ({ status: 'loading', windows: [] }),
  buildSuccessState: (data) => ({ status: 'success', ...data }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    error: message,
    errorStatus: status,
  }),
};
