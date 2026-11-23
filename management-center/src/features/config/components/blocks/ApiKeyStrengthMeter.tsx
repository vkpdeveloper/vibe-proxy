import { memo, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  API_KEY_STRENGTH_SEGMENTS,
  evaluateApiKeyStrength,
  type ApiKeyStrengthTier,
} from '@/utils/apiKeyStrength';
import { cn } from '@/lib/utils';
import { segmentFillDelayMs } from './shared';

// Three tones; the number of lit segments tells good and strong apart.
const TIER_COLORS: Record<ApiKeyStrengthTier, string> = {
  weak: 'bg-destructive',
  fair: 'bg-warning',
  good: 'bg-success',
  strong: 'bg-success',
};

const SEGMENT_INDEXES = Array.from({ length: API_KEY_STRENGTH_SEGMENTS }, (_, index) => index);

/**
 * A strength guide for a hand-written API key: four segments light up in turn. It only
 * shows a tier label and never blocks saving.
 */
export const ApiKeyStrengthMeter = memo(function ApiKeyStrengthMeter({ value }: { value: string }) {
  const { t } = useTranslation();
  const { tier, segments } = useMemo(() => evaluateApiKeyStrength(value), [value]);

  // The previous segment count decides which segments queue up; read during render, advanced after.
  const previousSegments = useRef(segments);
  const cascadeFrom = previousSegments.current;
  useEffect(() => {
    previousSegments.current = segments;
  }, [segments]);

  const empty = segments === 0;
  const tierLabel = empty
    ? t('config_management.visual.api_keys.strength.empty')
    : t(`config_management.visual.api_keys.strength.${tier}`);

  return (
    <div className="flex items-center gap-3">
      <div
        className="grid flex-1 grid-cols-4 gap-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={API_KEY_STRENGTH_SEGMENTS}
        aria-valuenow={segments}
        aria-valuetext={tierLabel}
        aria-label={t('config_management.visual.api_keys.strength.label')}
      >
        {SEGMENT_INDEXES.map((index) => (
          <span key={index} className="h-1 overflow-hidden rounded-full bg-muted">
            <span
              className={cn(
                'block h-full origin-left scale-x-0 rounded-full transition-transform duration-150 ease-out data-[filled=true]:scale-x-100 motion-reduce:transition-none',
                TIER_COLORS[tier]
              )}
              data-filled={index < segments}
              style={{ transitionDelay: `${segmentFillDelayMs(index, segments, cascadeFrom)}ms` }}
            />
          </span>
        ))}
      </div>
      <span className="w-14 text-right text-xs text-muted-foreground" aria-hidden="true">
        {empty ? '-' : tierLabel}
      </span>
    </div>
  );
});
