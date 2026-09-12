/** OpenCode Go quota data from its official API-key endpoint. */

import type { TFunction } from 'i18next';
import type {
  AuthFileItem,
  OpenCodeGoQuotaState,
  OpenCodeGoQuotaWindow,
  OpenCodeGoUsagePayload,
  OpenCodeGoUsageWindowPayload,
} from '@/types';
import { apiCallApi, getApiCallErrorMessage } from '@/services/api';
import {
  OPENCODE_GO_REQUEST_HEADERS,
  OPENCODE_GO_USAGE_URL,
  createStatusError,
  isDisabledAuthFile,
  isOpenCodeGoFile,
  normalizeNumberValue,
  resolveResetMs,
} from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

export interface OpenCodeGoQuotaData {
  windows: OpenCodeGoQuotaWindow[];
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const WINDOW_SPECS = [
  {
    id: 'rolling',
    labelKey: 'opencode_go_quota.five_hour',
    descriptionKey: 'opencode_go_quota.five_hour_desc',
    periodHours: 5,
  },
  {
    id: 'weekly',
    labelKey: 'opencode_go_quota.weekly',
    descriptionKey: 'opencode_go_quota.weekly_desc',
    periodHours: 24 * 7,
  },
  {
    id: 'monthly',
    labelKey: 'opencode_go_quota.monthly',
    descriptionKey: 'opencode_go_quota.monthly_desc',
    periodHours: null,
  },
] as const;

export function buildOpenCodeGoQuotaData(
  payload: OpenCodeGoUsagePayload,
  t: TFunction
): OpenCodeGoQuotaData {
  const usage = payload.usage ?? {};
  const windows = WINDOW_SPECS.flatMap<OpenCodeGoQuotaWindow>((spec) => {
    const raw = usage[spec.id] as OpenCodeGoUsageWindowPayload | null | undefined;
    if (!raw) return [];
    const usedPercent = normalizeNumberValue(raw.percent);
    if (usedPercent === null) return [];
    return [
      {
        id: spec.id,
        label: t(spec.labelKey),
        labelKey: spec.labelKey,
        descriptionKey: spec.descriptionKey,
        usedPercent,
        resetAtMs: resolveResetMs([raw.resetsAt, raw.resets_at]),
        periodHours: spec.periodHours,
        rateLimited: raw.status === 'rate-limited' || usedPercent >= 100,
      },
    ];
  });

  return { windows };
}

const fetchOpenCodeGoQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<OpenCodeGoQuotaData> => {
  const authIndex = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
  if (!authIndex) throw new Error(t('opencode_go_quota.missing_auth_index'));

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: OPENCODE_GO_USAGE_URL,
    header: OPENCODE_GO_REQUEST_HEADERS,
  });
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }
  const body = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;
  const payload = asRecord(body);
  if (!payload) throw new Error(t('opencode_go_quota.empty_data'));

  const data = buildOpenCodeGoQuotaData(payload as OpenCodeGoUsagePayload, t);
  if (data.windows.length === 0) throw new Error(t('opencode_go_quota.empty_data'));
  return data;
};

export const OPENCODE_GO_CONFIG: QuotaProviderData<OpenCodeGoQuotaState, OpenCodeGoQuotaData> = {
  type: 'opencode-go',
  i18nPrefix: 'opencode_go_quota',
  filterFn: (file) => isOpenCodeGoFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchOpenCodeGoQuota,
  storeSelector: (state) => state.openCodeGoQuota,
  storeSetter: 'setOpenCodeGoQuota',
  buildLoadingState: () => ({ status: 'loading', windows: [] }),
  buildSuccessState: (data) => ({ status: 'success', ...data }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    error: message,
    errorStatus: status,
  }),
};
