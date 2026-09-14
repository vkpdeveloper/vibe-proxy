/**
 * Devin CLI tracker: Connect-RPC GetUserStatus → daily/weekly quota rows.
 *
 * Devin reports percent REMAINING (the opposite of every other provider here)
 * plus unix-second resets and a dollar-valued overage balance, so the mapping
 * does more than pick fields: percentages flip to "used" for the shared row
 * component, micros convert to USD, and plans that hide the daily meter fall
 * back to showing it in the weekly row — mirroring openusage's Devin provider.
 */

import type { TFunction } from 'i18next';
import type {
  AuthFileItem,
  DevinCliPlanInfoPayload,
  DevinCliPlanStatusPayload,
  DevinCliQuotaState,
  DevinCliQuotaWindow,
  DevinCliUserStatusPayload,
} from '@/types';
import { apiCallApi, getApiCallErrorMessage } from '@/services/api';
import {
  DEVIN_CLI_DEFAULT_API_SERVER_URL,
  DEVIN_CLI_REQUEST_HEADERS,
  DEVIN_CLI_USER_STATUS_BODY,
  DEVIN_CLI_USER_STATUS_PATH,
  createStatusError,
  isDevinCliFile,
  isDisabledAuthFile,
  normalizeNumberValue,
  normalizeStringValue,
  parseIsoToMs,
  resolveResetMs,
} from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

export interface DevinCliQuotaData {
  windows: DevinCliQuotaWindow[];
  planType: string | null;
  /** Extra-usage balance in USD, converted from the payload's micros. */
  overageBalanceUsd: number | null;
  planEndMs: number | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * The Connect-RPC base URL for this credential. Tracker files may carry a
 * custom `api_server_url` (exposed on the auth-file entry by the backend);
 * only https URLs are honored, anything else falls back to the default host.
 */
export const resolveDevinCliApiServerUrl = (file: AuthFileItem): string => {
  const raw = normalizeStringValue(file['api_server_url'] ?? file.apiServerUrl);
  if (raw && raw.startsWith('https://')) {
    const trimmed = raw.replace(/\/+$/, '');
    if (trimmed) return trimmed;
  }
  return DEVIN_CLI_DEFAULT_API_SERVER_URL;
};

const resolvePlanStatus = (
  payload: DevinCliUserStatusPayload
): DevinCliPlanStatusPayload | null => {
  const userStatus = payload.userStatus ?? payload.user_status ?? null;
  return userStatus?.planStatus ?? userStatus?.plan_status ?? null;
};

const resolvePlanInfo = (
  planStatus: DevinCliPlanStatusPayload | null
): DevinCliPlanInfoPayload | null => planStatus?.planInfo ?? planStatus?.plan_info ?? null;

const boolValue = (value: unknown): boolean =>
  value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');

export function buildDevinCliQuotaData(
  payload: DevinCliUserStatusPayload,
  t: TFunction
): DevinCliQuotaData {
  const planStatus = resolvePlanStatus(payload);
  const planInfo = resolvePlanInfo(planStatus);
  const hideDaily = boolValue(planInfo?.hideDailyQuota ?? planInfo?.hide_daily_quota);

  const dailyRemaining = normalizeNumberValue(
    planStatus?.dailyQuotaRemainingPercent ?? planStatus?.daily_quota_remaining_percent
  );
  const weeklyRemaining = normalizeNumberValue(
    planStatus?.weeklyQuotaRemainingPercent ?? planStatus?.weekly_quota_remaining_percent
  );
  const dailyResetAtMs = resolveResetMs([
    planStatus?.dailyQuotaResetAtUnix ?? planStatus?.daily_quota_reset_at_unix,
  ]);
  const weeklyResetAtMs = resolveResetMs([
    planStatus?.weeklyQuotaResetAtUnix ?? planStatus?.weekly_quota_reset_at_unix,
  ]);

  const windows: DevinCliQuotaWindow[] = [];
  const appendRemaining = (
    id: string,
    labelKey: string,
    descriptionKey: string,
    remaining: number,
    resetAtMs: number | null,
    periodHours: number | null
  ) => {
    windows.push({
      id,
      label: t(labelKey),
      labelKey,
      descriptionKey,
      usedPercent: Math.max(0, Math.min(100, 100 - remaining)),
      resetAtMs,
      periodHours,
    });
  };

  if (!hideDaily && dailyRemaining !== null) {
    appendRemaining(
      'daily',
      'devin_cli_quota.daily',
      'devin_cli_quota.daily_desc',
      dailyRemaining,
      dailyResetAtMs,
      24
    );
  }
  if (weeklyRemaining !== null) {
    appendRemaining(
      'weekly',
      'devin_cli_quota.weekly',
      'devin_cli_quota.weekly_desc',
      weeklyRemaining,
      weeklyResetAtMs,
      7 * 24
    );
  } else if (hideDaily && dailyRemaining !== null) {
    // Plans that hide the daily meter and report no weekly quota still have a
    // real daily allowance; surface it in the weekly row so the card stays
    // meaningful (mirrors openusage's Devin fallback).
    appendRemaining(
      'weekly',
      'devin_cli_quota.weekly',
      'devin_cli_quota.weekly_desc',
      dailyRemaining,
      weeklyResetAtMs,
      7 * 24
    );
  }

  const overageMicros = normalizeNumberValue(
    planStatus?.overageBalanceMicros ?? planStatus?.overage_balance_micros
  );
  const planEnd = normalizeStringValue(planStatus?.planEnd ?? planStatus?.plan_end);

  return {
    windows,
    planType: normalizeStringValue(planInfo?.planName ?? planInfo?.plan_name) ?? null,
    overageBalanceUsd: overageMicros === null ? null : overageMicros / 1_000_000,
    planEndMs: planEnd ? parseIsoToMs(planEnd) : null,
  };
}

const fetchDevinCliQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<DevinCliQuotaData> => {
  const authIndex = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
  if (!authIndex) throw new Error(t('devin_cli_quota.missing_auth_index'));

  const result = await apiCallApi.request({
    authIndex,
    method: 'POST',
    url: resolveDevinCliApiServerUrl(file) + DEVIN_CLI_USER_STATUS_PATH,
    header: { ...DEVIN_CLI_REQUEST_HEADERS },
    // Devin authenticates inside the Connect-RPC body; the proxy replaces the
    // $TOKEN$ placeholder with the credential's API key before sending.
    data: DEVIN_CLI_USER_STATUS_BODY,
  });
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }
  const body = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;
  const payload = asRecord(body);
  if (!payload) throw new Error(t('devin_cli_quota.empty_data'));

  const data = buildDevinCliQuotaData(payload as DevinCliUserStatusPayload, t);
  if (data.windows.length === 0) throw new Error(t('devin_cli_quota.empty_data'));
  return data;
};

export const DEVIN_CLI_CONFIG: QuotaProviderData<DevinCliQuotaState, DevinCliQuotaData> = {
  type: 'devin-cli',
  i18nPrefix: 'devin_cli_quota',
  filterFn: (file) => isDevinCliFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchDevinCliQuota,
  storeSelector: (state) => state.devinCliQuota,
  storeSetter: 'setDevinCliQuota',
  buildLoadingState: () => ({ status: 'loading', windows: [] }),
  buildSuccessState: (data) => ({ status: 'success', ...data }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    error: message,
    errorStatus: status,
  }),
};
