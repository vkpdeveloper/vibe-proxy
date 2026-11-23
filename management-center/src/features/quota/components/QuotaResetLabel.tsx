/**
 * A reset instant. Desktop cycles every quota card through relative → compact
 * → full date on click; phones show a plain sentence such as
 * "Resets in 3d 13h · Nov 27, 7:30 AM", because a hidden tap-to-cycle was never
 * discovered there.
 *
 * Shared by every provider body so the two halves can never drift apart in
 * markup or spacing. Inside a phone window row the line drops below the bar
 * (`order-last`, full width; see quotaClasses).
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ResetDisplay } from '@/utils/quota';
import type { QuotaClassMap } from '../types';
import { quotaLevel } from './QuotaMeter';
import {
  getResetDisplayFormats,
  getResetDisplayValue,
  useQuotaResetDisplayStore,
} from './resetDisplayFormats';
import { Hint } from '@/components/ui/tooltip';

export interface QuotaResetLabelProps {
  display: ResetDisplay;
  classes: QuotaClassMap;
  /**
   * What is left on the limit this resets, in percent. It sets the colour with the meter's
   * thresholds, so a near reset with plenty left stays muted. Omit it for dates with no limit.
   */
  remainingPercent?: number | null;
  /**
   * The phone sentence: a limit that resets, a saved reset that expires, or `plain`
   * where a label beside it already names the date (Claude's balance reset).
   */
  kind?: 'reset' | 'expiry' | 'plain';
}

export function QuotaResetLabel({
  display,
  classes,
  remainingPercent,
  kind = 'reset',
}: QuotaResetLabelProps) {
  const { t } = useTranslation();
  const mode = useQuotaResetDisplayStore((state) => state.mode);
  const cycleMode = useQuotaResetDisplayStore((state) => state.cycleMode);
  const formats = getResetDisplayFormats(display);
  const tone = { high: undefined, medium: classes.quotaResetMedium, low: classes.quotaResetLow }[
    quotaLevel(remainingPercent)
  ];
  const value = getResetDisplayValue(display, mode);

  if (formats.length === 1) {
    return (
      <span className={`${classes.quotaReset} max-sm:col-span-2 max-sm:order-last`}>{value}</span>
    );
  }

  // Phones always use the short countdown ("3d 13h"). A passed reset says so ("Reset 12m ago")
  // until the next refresh brings the new window.
  let phoneText = display.absolute;
  if (display.span && kind === 'plain') {
    phoneText = `${t('quota_management.in_span', { span: display.span })} · ${display.absolute}`;
  } else if (display.span) {
    const key = kind === 'expiry' ? 'quota_management.expires_in' : 'quota_management.resets_in';
    phoneText = t(key, { span: display.span, date: display.absolute });
  } else if (display.ago && kind === 'reset') {
    phoneText = t('quota_management.reset_ago', { span: display.ago, date: display.absolute });
  } else if (display.relative) {
    phoneText = `${display.relative} · ${display.absolute}`;
  }

  return (
    <>
      <span className={cn(classes.quotaReset, tone, 'col-span-2 order-last sm:hidden')}>
        {phoneText}
      </span>
      <Hint label={t('quota_management.cycle_reset_time')}>
        <button
          type="button"
          className={cn(classes.quotaResetCycle, tone, 'max-sm:hidden')}
          onClick={(event) => {
            event.stopPropagation();
            cycleMode();
          }}
          aria-label={t('quota_management.cycle_reset_time')}
        >
          {value}
        </button>
      </Hint>
    </>
  );
}
