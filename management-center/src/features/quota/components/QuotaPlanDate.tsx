/**
 * A plan date in the Plan row style: grey label, white value such as
 * "Renews  Dec 13, 4:52 PM · in 19d 20h", with the full date on hover.
 * Shared so Codex renewal and both Devin plan ends read the same.
 */

import { useTranslation } from 'react-i18next';
import type { ResetDisplay } from '@/utils/quota';
import type { QuotaClassMap } from '../types';

interface QuotaPlanDateProps {
  label: string;
  display: ResetDisplay;
  classes: QuotaClassMap;
}

export function QuotaPlanDate({ label, display, classes }: QuotaPlanDateProps) {
  const { t } = useTranslation();
  const value = display.span
    ? `${display.absolute} · ${t('quota_management.in_span', { span: display.span })}`
    : display.absolute;

  return (
    <span className={classes.codexPlanItem}>
      <span className={classes.codexPlanLabel}>{label}</span>
      <span className={classes.codexPlanValue} title={display.full ?? undefined}>
        {value}
      </span>
    </span>
  );
}
