import { apiClient } from './client';

export interface UsageTotals {
  requests: number;
  successful: number;
  failed: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
  estimated_usd: number;
  priced_requests: number;
  unpriced_requests: number;
}

export interface UsageBreakdown extends UsageTotals {
  key: string;
  provider?: string;
  account?: string;
  model?: string;
  auth_type?: string;
}

export interface UsageDailyTotal extends UsageTotals {
  date: string;
}

export interface UsageEvent {
  id: string;
  timestamp: string;
  provider: string;
  account: string;
  auth_type: string;
  model: string;
  failed: boolean;
  tokens: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    total_tokens: number;
  };
  cost: {
    total_usd: number;
    priced: boolean;
    rule_id?: string;
  };
  origin: string;
}

export interface UsageCostReport {
  currency: string;
  pricing_as_of: string;
  pricing_rules: number;
  generated_at: string;
  totals: UsageTotals;
  by_provider: UsageBreakdown[];
  by_account: UsageBreakdown[];
  by_model: UsageBreakdown[];
  by_provider_model: UsageBreakdown[];
  by_auth_type: UsageBreakdown[];
  daily: UsageDailyTotal[];
  unpriced_models: Array<{ provider: string; model: string; requests: number; tokens: number }>;
  recent: UsageEvent[];
  historical: {
    detailed_log_files: number;
    imported_usage_records: number;
    legacy_requests_seen: number;
    uncostable_legacy_rows: number;
    last_scan_at: string;
    notice: string;
  };
}

function normalizeReport(report: UsageCostReport): UsageCostReport {
  if (!report || typeof report !== 'object') {
    throw new Error('The usage service returned an invalid response.');
  }
  return {
    ...report,
    by_provider: Array.isArray(report.by_provider) ? report.by_provider : [],
    by_account: Array.isArray(report.by_account) ? report.by_account : [],
    by_model: Array.isArray(report.by_model) ? report.by_model : [],
    by_provider_model: Array.isArray(report.by_provider_model) ? report.by_provider_model : [],
    by_auth_type: Array.isArray(report.by_auth_type) ? report.by_auth_type : [],
    daily: Array.isArray(report.daily) ? report.daily : [],
    unpriced_models: Array.isArray(report.unpriced_models) ? report.unpriced_models : [],
    recent: Array.isArray(report.recent) ? report.recent : [],
  };
}

export const usageCostsApi = {
  getReport: async (params?: { from?: string; to?: string }) => {
    const report = await apiClient.get<UsageCostReport>('/usage-costs', { params });
    return normalizeReport(report);
  },
};
