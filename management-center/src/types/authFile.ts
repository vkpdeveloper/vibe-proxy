/**
 * Auth-file types.
 */

import type { RecentRequestBucket } from '@/utils/recentRequests';

export type AuthFileType =
  | 'qwen'
  | 'kimi'
  | 'gemini'
  | 'aistudio'
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'devin-cli'
  | 'devin'
  | 'meta'
  | 'opencode-go'
  | 'antigravity'
  | 'xai'
  | 'iflow'
  | 'vertex'
  | 'empty'
  | 'unknown';

export interface QuotaCapacityWindow {
  id: string;
  label: string;
  scope_model?: string;
  used_percent: number;
  remaining_percent: number;
  reset_at?: string;
  known: boolean;
  hard_exhausted?: boolean;
  routing: boolean;
}

export interface QuotaCapacityState {
  provider: string;
  supported: boolean;
  fetched_at?: string;
  stale_at?: string;
  last_attempt_at?: string;
  last_error?: string;
  windows?: QuotaCapacityWindow[];
  /** Anthropic's raw cedar_ember block, parsed by the reset-grant UI. */
  reset_grants?: unknown;
}

/** The dashboard's last full quota card for a credential, saved on the server. */
export interface QuotaDetailsSnapshot {
  saved_at: string;
  data: unknown;
}

export interface RoutingSelectionState {
  selected: boolean;
  model?: string;
  selected_at: string;
  expires_at: string;
}

export interface AuthFileCooldown {
  scope: 'model' | 'credential';
  modelKey?: string;
  reason: string;
  retryAt: string;
  remainingSeconds: number;
  backoffLevel?: number;
  httpStatus?: number;
}

export interface AuthFileCooldownSnapshot {
  observedAt?: string;
  receivedAtMs: number;
  records: AuthFileCooldown[] | null;
}

export interface AuthFileItem {
  name: string;
  siwcBindSupported?: boolean;
  useSiwc?: boolean;
  siwcBound?: boolean;
  siwcExpiresAt?: string;
  type?: AuthFileType | string;
  provider?: string;
  /**
   * Account email supplied by the file scanner or credential registry.
   * Never display or search account/account_type: API-key credentials may expose
   * the API key itself through those fields.
   */
  email?: string;
  /** GCP / Vertex project ID, used when account email is absent. */
  projectId?: string;
  size?: number;
  authIndex?: string | number | null;
  /** Generic plugin quota capability advertised by CPA's auth-files API. */
  supportsQuota?: boolean;
  quotaProvider?: string;
  /** Backend-selected quota plugin; authoritative when supplied by v8 credentials. */
  quotaPluginId?: string;
  runtimeOnly?: boolean | string;
  disabled?: boolean;
  unavailable?: boolean;
  status?: string;
  statusMessage?: string;
  lastRefresh?: string | number;
  modified?: number;
  priority?: number;
  weight?: number;
  note?: string;
  success?: unknown;
  failed?: unknown;
  /** Cumulative success/failure counts normalized by the API boundary. */
  successCount?: number;
  failureCount?: number;
  recent_requests?: RecentRequestBucket[];
  recentRequests?: RecentRequestBucket[];
  /** Devin CLI tracker credentials may carry a custom Connect-RPC base URL. */
  api_server_url?: string;
  apiServerUrl?: string;
  quota_capacity?: QuotaCapacityState;
  quotaCapacity?: QuotaCapacityState;
  quota_details?: QuotaDetailsSnapshot;
  routing_selection?: RoutingSelectionState;
  routingSelection?: RoutingSelectionState;
  cooldownSnapshot?: AuthFileCooldownSnapshot;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
  observed_at?: unknown;
  observedAt?: string;
}
