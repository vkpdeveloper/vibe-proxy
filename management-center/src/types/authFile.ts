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

export interface RoutingSelectionState {
  selected: boolean;
  model?: string;
  selected_at: string;
  expires_at: string;
}

export interface AuthFileItem {
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  /**
   * 凭证账号邮箱（后端 auth_files 两条分支都会填：磁盘扫描读 JSON 的 email 字段，
   * 注册表读 Metadata/Attributes）。卡片主行用它领衔。
   * 注意：后端还会下发 account/account_type，但 api-key 类凭证的 account 就是
   * API key 本身（AccountInfo() → return "api_key", apiKey），**绝不可用于展示或搜索**。
   */
  email?: string;
  /** GCP / Vertex 项目 ID，账号邮箱缺失时作为身份回落。 */
  projectId?: string;
  size?: number;
  authIndex?: string | number | null;
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
  /** 归一化后的累计成功/失败计数（由 API 边界从 success/failed 生字段填充）。 */
  successCount?: number;
  failureCount?: number;
  recent_requests?: RecentRequestBucket[];
  recentRequests?: RecentRequestBucket[];
  quota_capacity?: QuotaCapacityState;
  quotaCapacity?: QuotaCapacityState;
  routing_selection?: RoutingSelectionState;
  routingSelection?: RoutingSelectionState;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
}
