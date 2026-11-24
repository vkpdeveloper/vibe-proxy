import type { TFunction } from 'i18next';
import type { AuthFileItem, CopilotQuotaData, CopilotQuotaState } from '@/types';
import { apiCallApi } from '@/services/api/apiCall';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import { captureQuotaCacheGeneration, commitIfQuotaCacheCurrent } from '@/stores/useQuotaStore';
import { normalizeAuthIndex } from '@/utils/authIndex';
import { isRecord } from '@/utils/helpers';
import {
  isDisabledAuthFile,
  isPluginQuotaFile,
  normalizeNumberValue,
  resolveAuthProvider,
} from '@/utils/quota';
import type { QuotaProviderData } from '../types';

export const COPILOT_QUOTA_URL = 'https://api.github.com/copilot_internal/user';

const parseAmount = (value: unknown): number | null => {
  const amount = normalizeNumberValue(value);
  return amount !== null && amount >= 0 ? amount : null;
};

/** Keeps only the premium request figures; unlimited plans have no quota to show. */
export function parseCopilotQuota(body: unknown): CopilotQuotaData | null {
  if (!isRecord(body) || !isRecord(body.quota_snapshots)) return null;
  const premium = body.quota_snapshots.premium_interactions;
  if (!isRecord(premium) || premium.unlimited === true) return null;
  const percentRemaining = parseAmount(premium.percent_remaining);
  if (percentRemaining === null || percentRemaining > 100) return null;
  return {
    percentRemaining,
    remaining: parseAmount(premium.quota_remaining),
    entitlement: parseAmount(premium.entitlement),
  };
}

async function fetchCopilotQuota(file: AuthFileItem, t: TFunction): Promise<CopilotQuotaData> {
  const unavailable = () => new Error(t('copilot_quota.unavailable'));
  const authIndex = normalizeAuthIndex(file.authIndex ?? file.auth_index);
  if (
    !authIndex ||
    !file.name?.trim() ||
    String(file.runtimeOnly ?? file.runtime_only) === 'true'
  ) {
    throw unavailable();
  }
  const revision = apiClient.getConnectionRevision();
  const generation = captureQuotaCacheGeneration(file.name);
  const isCurrent = () =>
    revision === apiClient.getConnectionRevision() &&
    commitIfQuotaCacheCurrent(generation, () => {});
  try {
    const credential: unknown = JSON.parse(await authFilesApi.downloadText(file.name));
    if (!isCurrent() || !isRecord(credential) || credential.type !== 'copilot') {
      throw unavailable();
    }
    // The access token only serves inference; the GitHub OAuth token is stored as refresh_token.
    const token = credential.refresh_token;
    if (typeof token !== 'string' || !/^[A-Za-z0-9._~-]+$/.test(token)) throw unavailable();
    const result = await apiCallApi.request({
      authIndex,
      method: 'GET',
      url: COPILOT_QUOTA_URL,
      header: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'copilot/1.0.114',
        Accept: 'application/json',
      },
    });
    if (!isCurrent() || result.statusCode < 200 || result.statusCode >= 300) throw unavailable();
    const data = parseCopilotQuota(result.body);
    if (data) return data;
  } catch {
    // Transport and parse errors can carry the token or raw account data, so none are surfaced.
  }
  throw unavailable();
}

export const COPILOT_CONFIG: QuotaProviderData<CopilotQuotaState, CopilotQuotaData> = {
  type: 'copilot',
  i18nPrefix: 'copilot_quota',
  filterFn: (file) =>
    resolveAuthProvider(file) === 'copilot' &&
    !isDisabledAuthFile(file) &&
    !isPluginQuotaFile(file),
  fetchQuota: fetchCopilotQuota,
  storeSelector: (state) => state.copilotQuota,
  storeSetter: 'setCopilotQuota',
  buildLoadingState: () => ({ status: 'loading' }),
  buildSuccessState: (data) => ({ status: 'success', data }),
  buildErrorState: (error, errorStatus) => ({ status: 'error', error, errorStatus }),
};
