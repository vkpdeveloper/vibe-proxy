/**
 * A reset instant that cycles every quota card through compact → relative
 * → full date on click.
 *
 * Shared by every provider body so the two halves can never drift apart in
 * markup or spacing. The separator lives in CSS (`.quotaResetRelative::before`)
 * rather than here, so the relative half stays independently styleable.
 */

import { useTranslation } from 'react-i18next';
import type { ResetDisplay } from '@/utils/quota';
import type { QuotaClassMap } from '../types';
import {
  getResetDisplayFormats,
  getResetDisplayValue,
  useQuotaResetDisplayStore,
} from './resetDisplayFormats';

export interface QuotaResetLabelProps {
  display: ResetDisplay;
  classes: QuotaClassMap;
  /** True on the row that recovers first for this credential. */
  soon?: boolean;
}

export function QuotaResetLabel({ display, classes, soon = false }: QuotaResetLabelProps) {
  const { t } = useTranslation();
  const mode = useQuotaResetDisplayStore((state) => state.mode);
  const cycleMode = useQuotaResetDisplayStore((state) => state.cycleMode);
  const formats = getResetDisplayFormats(display);
  const value = getResetDisplayValue(display, mode);

  if (formats.length === 1) {
    return <span className={classes.quotaReset}>{value}</span>;
  }

  return (
    <button
      type="button"
      className={
        soon
          ? `${classes.quotaResetCycle} ${classes.quotaResetRelativeSoon}`
          : classes.quotaResetCycle
      }
      onClick={(event) => {
        event.stopPropagation();
        cycleMode();
      }}
      aria-label={t('quota_management.cycle_reset_time')}
      title={t('quota_management.cycle_reset_time')}
    >
      {value}
    </button>
  );
}
