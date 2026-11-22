import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import type { AnthropicResetGrant } from '@/services/api/claudeResetGrants';
import { buildResetDisplay, parseIsoToMs } from '@/utils/quota';
import { resolveTimeZoneLabel } from '@/utils/time/timezone';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { ResetExpirySection } from '../../components/ResetExpirySection';
import type { QuotaClassMap } from '../../types';

interface ClaudeResetGrantDetailsProps {
  grants: readonly AnthropicResetGrant[];
  classes: QuotaClassMap;
  /** Per-grant spend action; omitted on read-only hosts. */
  onUse?: (grantId: string) => void;
  canUse?: (grantId: string) => boolean;
}

/** Match Codex's reset-credit details without treating a multi-reset grant as one credit. */
export function ClaudeResetGrantDetails({
  grants,
  classes,
  onUse,
  canUse,
}: ClaudeResetGrantDetailsProps) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const remaining = grants
    .filter((grant) => grant.resetsLeft > 0)
    .sort((a, b) => (parseIsoToMs(a.endsAt) ?? Infinity) - (parseIsoToMs(b.endsAt) ?? Infinity));

  if (remaining.length === 0) return null;

  return (
    <ResetExpirySection
      classes={classes}
      title={t('claude_reset.expiry_title', { timezone: resolveTimeZoneLabel() })}
    >
      {remaining.map((grant, index) => {
        const display = buildResetDisplay(
          null,
          parseIsoToMs(grant.endsAt),
          now,
          i18n.resolvedLanguage
        );
        return (
          <div key={grant.id} className={classes.codexResetCreditRow}>
            <span className={classes.codexResetCreditLabel}>
              {grant.label || t('claude_reset.grant_number', { index: index + 1 })}
              {' · '}
              {t('claude_reset.count', { left: grant.resetsLeft, total: grant.resetsTotal })}
            </span>
            <span className={classes.codexResetCreditTime}>
              {display ? (
                <QuotaResetLabel display={display} classes={classes} />
              ) : (
                <span className={classes.quotaReset}>{t('claude_reset.expiry_unknown')}</span>
              )}
            </span>
            {onUse && (
              <button
                type="button"
                className={classes.codexResetCreditUse}
                disabled={!canUse?.(grant.id)}
                onClick={() => onUse(grant.id)}
              >
                {t('quota_management.use_reset')}
              </button>
            )}
          </div>
        );
      })}
    </ResetExpirySection>
  );
}
