/**
 * 认证文件相关类型
 * 基于原项目 src/modules/auth-files.js
 */

import type { RecentRequestBucket } from '@/utils/recentRequests';

export type AuthFileType =
  | 'qwen'
  | 'kimi'
  | 'gemini'
  | 'aistudio'
  | 'claude'
  | 'codex'
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
}

export interface AuthFileItem {
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  size?: number;
  authIndex?: string | number | null;
  runtimeOnly?: boolean | string;
  disabled?: boolean;
  unavailable?: boolean;
  status?: string;
  statusMessage?: string;
  lastRefresh?: string | number;
  modified?: number;
  success?: unknown;
  failed?: unknown;
  recent_requests?: RecentRequestBucket[];
  recentRequests?: RecentRequestBucket[];
  quota_capacity?: QuotaCapacityState;
  quotaCapacity?: QuotaCapacityState;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
}
