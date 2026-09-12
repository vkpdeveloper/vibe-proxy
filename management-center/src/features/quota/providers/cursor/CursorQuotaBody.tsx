import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import type { CursorQuotaState } from '@/types';
import { buildResetDisplay } from '@/utils/quota';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import type { QuotaBodyProps } from '../../types';

const formatUsd = (cents: number | null | undefined): string | null => {
  if (cents == null) return null;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(
    cents / 100
  );
};

const formatAmount = (usedCents?: number | null, limitCents?: number | null): string | null => {
  const used = formatUsd(usedCents);
  const limit = formatUsd(limitCents);
  if (!used && !limit) return null;
  if (!limit) return used;
  return `${used ?? formatUsd(0)} / ${limit}`;
};

export function CursorQuotaBody({ quota, classes }: QuotaBodyProps<CursorQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const urgentRowId = useMemo(
    () => pickUrgentRowId(collectQuotaRowInstants('cursor', quota), now),
    [quota, now]
  );

  if (quota.windows.length === 0 && !quota.onDemandLimitCents) {
    return <div className={classes.quotaMessage}>{t('cursor_quota.empty_data')}</div>;
  }

  const onDemandPercent =
    quota.onDemandUsedCents != null &&
    quota.onDemandLimitCents != null &&
    quota.onDemandLimitCents > 0
      ? (quota.onDemandUsedCents / quota.onDemandLimitCents) * 100
      : null;

  return (
    <>
      {quota.planType && (
        <div className={classes.codexPlan}>
          <span className={classes.codexPlanLabel}>{t('cursor_quota.plan_label')}</span>
          <span className={classes.codexPlanValue}>{quota.planType}</span>
        </div>
      )}
      {quota.windows.map((window, index) => {
        const used =
          window.usedPercent == null ? null : Math.max(0, Math.min(100, window.usedPercent));
        const remaining = used == null ? null : 100 - used;
        const amount = formatAmount(window.usedCents, window.limitCents);
        const resetDisplay = buildResetDisplay(null, window.resetAtMs, now, i18n.resolvedLanguage);
        const urgent = urgentRowId === window.id;

        return (
          <div
            key={window.id}
            className={classes.quotaRow}
            title={urgent ? t('quota_management.soonest_row_hint') : undefined}
          >
            <div className={classes.quotaRowHeader}>
              <span className={classes.quotaLabel}>
                <span className={classes.quotaModel}>
                  {window.labelKey ? t(window.labelKey) : window.label}
                </span>
                {window.descriptionKey && (
                  <span className={classes.quotaDescription}>{t(window.descriptionKey)}</span>
                )}
              </span>
              <div className={classes.quotaMeta}>
                <span className={classes.quotaPercent}>
                  {remaining == null
                    ? '--'
                    : t('cursor_quota.remaining_percent', { percent: Math.round(remaining) })}
                </span>
                {amount && <span className={classes.quotaAmount}>{amount}</span>}
                {resetDisplay && (
                  <QuotaResetLabel display={resetDisplay} classes={classes} soon={urgent} />
                )}
              </div>
            </div>
            <QuotaMeter percent={remaining} classes={classes} index={index} />
          </div>
        );
      })}
      {quota.onDemandLimitCents != null && quota.onDemandLimitCents > 0 && (
        <div className={classes.quotaRow}>
          <div className={classes.quotaRowHeader}>
            <span className={classes.quotaLabel}>
              <span className={classes.quotaModel}>{t('cursor_quota.on_demand')}</span>
              <span className={classes.quotaDescription}>{t('cursor_quota.on_demand_desc')}</span>
            </span>
            <div className={classes.quotaMeta}>
              <span className={classes.quotaPercent}>
                {onDemandPercent == null
                  ? '--'
                  : t('cursor_quota.remaining_percent', {
                      percent: Math.round(100 - onDemandPercent),
                    })}
              </span>
              <span className={classes.quotaAmount}>
                {formatAmount(quota.onDemandUsedCents, quota.onDemandLimitCents)}
              </span>
            </div>
          </div>
          <QuotaMeter
            percent={onDemandPercent == null ? null : 100 - onDemandPercent}
            classes={classes}
            index={quota.windows.length}
          />
        </div>
      )}
    </>
  );
}
