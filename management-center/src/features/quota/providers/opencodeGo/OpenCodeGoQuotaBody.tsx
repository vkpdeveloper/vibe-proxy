import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import type { OpenCodeGoQuotaState } from '@/types';
import { buildResetDisplay } from '@/utils/quota';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import type { QuotaBodyProps } from '../../types';

export function OpenCodeGoQuotaBody({ quota, classes }: QuotaBodyProps<OpenCodeGoQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const urgentRowId = useMemo(
    () => pickUrgentRowId(collectQuotaRowInstants('opencode-go', quota), now),
    [quota, now]
  );

  if (quota.windows.length === 0) {
    return <div className={classes.quotaMessage}>{t('opencode_go_quota.empty_data')}</div>;
  }

  return (
    <>
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
                    : t('opencode_go_quota.remaining_percent', {
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
    </>
  );
}
