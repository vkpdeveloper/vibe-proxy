import { apiClient } from './client';

export interface ClientApiKey {
  id: string;
  name: string;
  masked_key: string;
  allowed_providers: string[];
  allowed_models: string[];
  daily_limit_usd: number;
  daily_request_limit: number;
  daily_token_limit: number;
  requests_per_minute: number;
  disabled: boolean;
  managed: boolean;
  today_usd: number;
  today_requests: number;
  today_tokens: number;
  minute_requests: number;
  remaining_usd: number | null;
  blocked: boolean;
  block_reason?: string;
  reset_at: string;
}

export interface ClientApiKeyInput {
  name: string;
  allowed_providers: string[];
  allowed_models: string[];
  daily_limit_usd: number;
  daily_request_limit: number;
  daily_token_limit: number;
  requests_per_minute: number;
  disabled: boolean;
}

export interface ClientApiKeyOptions {
  providers: string[];
  models: Array<{ id: string; providers: string[] }>;
}

export interface ClientApiKeysResponse {
  keys: ClientApiKey[];
  options: ClientApiKeyOptions;
}

function normalizeKey(key: ClientApiKey): ClientApiKey {
  return {
    ...key,
    allowed_providers: Array.isArray(key.allowed_providers) ? key.allowed_providers : [],
    allowed_models: Array.isArray(key.allowed_models) ? key.allowed_models : [],
  };
}

function normalizeResponse(response: ClientApiKeysResponse): ClientApiKeysResponse {
  return {
    keys: Array.isArray(response?.keys) ? response.keys.map(normalizeKey) : [],
    options: {
      providers: Array.isArray(response?.options?.providers) ? response.options.providers : [],
      models: Array.isArray(response?.options?.models) ? response.options.models : [],
    },
  };
}

export const clientApiKeysApi = {
  list: async () =>
    normalizeResponse(await apiClient.get<ClientApiKeysResponse>('/client-api-keys')),
  create: (input: ClientApiKeyInput) =>
    apiClient.post<{ api_key: string; key: ClientApiKey }>('/client-api-keys', input),
  update: (id: string, input: ClientApiKeyInput) =>
    apiClient.put<{ key: ClientApiKey }>(`/client-api-keys/${encodeURIComponent(id)}`, input),
  rotate: (id: string) =>
    apiClient.post<{ api_key: string; id: string }>(
      `/client-api-keys/${encodeURIComponent(id)}/rotate`
    ),
  remove: (id: string) =>
    apiClient.delete<{ status: string }>(`/client-api-keys/${encodeURIComponent(id)}`),
};
