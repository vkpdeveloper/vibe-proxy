import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import type { DevinCliQuotaState } from '@/types';
import { buildResetDisplay } from '@/utils/quota';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import type { QuotaBodyProps } from '../../types';

const formatUsd = (value: number | null | undefined): string | null => {
  if (value == null) return null;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
};

export function DevinCliQuotaBody({ quota, classes }: QuotaBodyProps<DevinCliQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const urgentRowId = useMemo(
    () => pickUrgentRowId(collectQuotaRowInstants('devin-cli', quota), now),
    [quota, now]
  );

  const overageBalance = formatUsd(quota.overageBalanceUsd);
  const planEndDisplay = buildResetDisplay(null, quota.planEndMs, now, i18n.resolvedLanguage);

  if (quota.windows.length === 0 && !overageBalance) {
    return <div className={classes.quotaMessage}>{t('devin_cli_quota.empty_data')}</div>;
  }

  return (
    <>
      {(quota.planType || planEndDisplay) && (
        <div className={classes.codexPlan}>
          {quota.planType && (
            <span className={classes.codexPlanItem}>
              <span className={classes.codexPlanLabel}>{t('devin_cli_quota.plan_label')}</span>
              <span className={classes.codexPlanValue}>{quota.planType}</span>
            </span>
          )}
          {planEndDisplay && (
            <span className={classes.codexPlanItem}>
              <span className={classes.codexPlanLabel}>{t('devin_cli_quota.plan_end_label')}</span>
              <QuotaResetLabel display={planEndDisplay} classes={classes} />
            </span>
          )}
        </div>
      )}
      {quota.windows.map((window, index) => {
        const used =
          window.usedPercent == null ? null : Math.max(0, Math.min(100, window.usedPercent));
        const remaining = used == null ? null : 100 - used;
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
                <span className={classes.quotaModel}>{t(window.labelKey)}</span>
                <span className={classes.quotaDescription}>{t(window.descriptionKey)}</span>
              </span>
              <div className={classes.quotaMeta}>
                <span className={classes.quotaPercent}>
                  {remaining == null
                    ? '--'
                    : t('devin_cli_quota.remaining_percent', {
                        percent: Math.round(remaining),
                      })}
                </span>
                {resetDisplay && (
                  <QuotaResetLabel display={resetDisplay} classes={classes} soon={urgent} />
                )}
              </div>
            </div>
            <QuotaMeter percent={remaining} classes={classes} index={index} />
          </div>
        );
      })}
      {overageBalance && (
        <div className={classes.quotaRow}>
          <div className={classes.quotaRowHeader}>
            <span className={classes.quotaLabel}>
              <span className={classes.quotaModel}>{t('devin_cli_quota.overage_balance')}</span>
              <span className={classes.quotaDescription}>
                {t('devin_cli_quota.overage_balance_desc')}
              </span>
            </span>
            <div className={classes.quotaMeta}>
              <span className={classes.quotaAmount}>{overageBalance}</span>
            </div>
          </div>
          <QuotaMeter percent={null} classes={classes} index={quota.windows.length} />
        </div>
      )}
    </>
  );
}
