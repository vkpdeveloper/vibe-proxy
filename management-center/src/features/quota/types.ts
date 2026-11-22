/**
 * 额度渲染层的类型化样式契约。
 *
 * 额度 body 由宿主传入 QuotaClassMap（Tailwind 类名表，见 components/quotaClasses.ts），
 * 额度页与认证文件卡片共用同一份。bindQuotaClasses 仍可把 CSS Module 绑定成
 * QuotaClassMap：缺任何一个类名会抛错并列出缺失清单。
 */

import type { ReactNode } from 'react';

export interface QuotaClassMap {
  // 额度行（五个提供商共用）
  quotaRow: string;
  quotaRowHeader: string;
  quotaLabel: string;
  quotaModel: string;
  quotaDescription: string;
  quotaMeta: string;
  quotaPercent: string;
  quotaReset: string;
  quotaResetCycle: string;
  quotaResetRelative: string;
  quotaResetRelativeSoon: string;
  quotaAmount: string;
  quotaMessage: string;
  // 套餐 chip 行（codex 命名，claude/antigravity/kimi/xai 复用；
  // premium=金卡、elite=Pro 20x 液态铂金 —— 均为定稿资产，样式不可改）
  codexPlan: string;
  codexPlanItem: string;
  codexPlanLabel: string;
  codexPlanValue: string;
  premiumPlanValue: string;
  elitePlanValue: string;
  // Codex 重置积分
  codexResetCredits: string;
  codexResetCreditsTitle: string;
  codexResetCreditRow: string;
  codexResetCreditRowSoon: string;
  codexResetCreditLabel: string;
  codexResetCreditTime: string;
  codexResetCreditUse: string;
  codexResetCreditsError: string;
  // Antigravity 分组
  antigravityQuotaGroup: string;
  antigravityQuotaGroupHeader: string;
  antigravityQuotaGroupTitle: string;
  antigravityQuotaGroupDescription: string;
  // 水位条（QuotaMeter）
  quotaBar: string;
  quotaBarFill: string;
  quotaBarFillHigh: string;
  quotaBarFillMedium: string;
  quotaBarFillLow: string;
}

export const QUOTA_CLASS_KEYS: readonly (keyof QuotaClassMap)[] = [
  'quotaRow',
  'quotaRowHeader',
  'quotaLabel',
  'quotaModel',
  'quotaDescription',
  'quotaMeta',
  'quotaPercent',
  'quotaReset',
  'quotaResetCycle',
  'quotaResetRelative',
  'quotaResetRelativeSoon',
  'quotaAmount',
  'quotaMessage',
  'codexPlan',
  'codexPlanItem',
  'codexPlanLabel',
  'codexPlanValue',
  'premiumPlanValue',
  'elitePlanValue',
  'codexResetCredits',
  'codexResetCreditsTitle',
  'codexResetCreditRow',
  'codexResetCreditRowSoon',
  'codexResetCreditLabel',
  'codexResetCreditTime',
  'codexResetCreditUse',
  'codexResetCreditsError',
  'antigravityQuotaGroup',
  'antigravityQuotaGroupHeader',
  'antigravityQuotaGroupTitle',
  'antigravityQuotaGroupDescription',
  'quotaBar',
  'quotaBarFill',
  'quotaBarFillHigh',
  'quotaBarFillMedium',
  'quotaBarFillLow',
];

/** 宿主 CSS Module → 类型化契约。缺键即抛（fail-loud），`source` 用于报错定位。 */
export function bindQuotaClasses(module: Record<string, string>, source: string): QuotaClassMap {
  const missing = QUOTA_CLASS_KEYS.filter((key) => !module[key]);
  if (missing.length > 0) {
    throw new Error(`[quota] ${source} 缺少额度契约类名: ${missing.join(', ')}`);
  }
  const bound = {} as Record<keyof QuotaClassMap, string>;
  for (const key of QUOTA_CLASS_KEYS) {
    bound[key] = module[key];
  }
  return bound;
}

export interface QuotaBodyProps<TState> {
  quota: TState;
  classes: QuotaClassMap;
  /** Host-owned chips appended to the provider's plan row (`codexPlanItem` spans). */
  planItems?: ReactNode;
  /** Host-owned content placed right after the plan row, before usage rows. */
  afterPlan?: ReactNode;
  /** Spends one specific reset credit; omitted on read-only hosts. */
  onUseReset?: (resetId: string) => void;
  useResetDisabled?: boolean;
}
