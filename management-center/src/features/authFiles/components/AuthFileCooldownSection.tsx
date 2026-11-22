import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AuthFileCooldownSnapshot } from '@/types/authFile';
import { createSharedClock } from '@/utils/time/sharedClock';
import { formatDateTimeValue } from '@/utils/format';
import { cooldownReasonKey, summarizeCooldowns } from '@/features/authFiles/cooldowns';
import { Hint } from '@/components/ui/tooltip';

// One timer for visible cooldown cards, never one interval/request per credential.
const clock = createSharedClock({ intervalMs: 1000 });

export type AuthFileCooldownSectionProps = {
  snapshot?: AuthFileCooldownSnapshot;
  resetting?: boolean;
  resetDisabled?: boolean;
  onReset?: () => void;
};

export function AuthFileCooldownSection({
  snapshot,
  resetting = false,
  resetDisabled = false,
  onReset,
}: AuthFileCooldownSectionProps) {
  const { t } = useTranslation();
  if (!snapshot) return null; // Old backend: no claim about cooldown support or health.
  if (snapshot.records === null) {
    return <p className="text-xs text-muted-foreground">{t('auth_files.cooldown_unknown')}</p>;
  }
  if (snapshot.records.length === 0) return null;
  return (
    <CooldownDetails
      snapshot={snapshot}
      resetting={resetting}
      resetDisabled={resetDisabled}
      onReset={onReset}
    />
  );
}

function CooldownDetails({
  snapshot,
  resetting,
  resetDisabled,
  onReset,
}: {
  snapshot: AuthFileCooldownSnapshot;
  resetting: boolean;
  resetDisabled: boolean;
  onReset?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const now = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
  const { rows, modelCount, credentialWide, earliestSeconds } = summarizeCooldowns(snapshot, now);
  const elapsed = earliestSeconds === 0;
  const duration = (seconds: number) => {
    if (seconds < 60) return t('auth_files.cooldown_seconds', { count: seconds });
    if (seconds < 3600) return t('auth_files.cooldown_minutes', { count: Math.ceil(seconds / 60) });
    return t('auth_files.cooldown_hours', { count: Math.ceil(seconds / 3600) });
  };
  const scopeLabel = credentialWide
    ? modelCount > 0
      ? t('auth_files.cooldown_credential_and_models', { count: modelCount })
      : t('auth_files.cooldown_credential')
    : t('auth_files.cooldown_models', { count: modelCount });

  return (
    <details
      className={cn(
        'group/cooldown rounded-lg border text-xs',
        elapsed ? 'text-muted-foreground' : 'text-warning'
      )}
    >
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="font-medium">
            {elapsed ? t('auth_files.cooldown_elapsed') : scopeLabel}
          </span>
          <span className="font-mono text-muted-foreground tabular-nums">
            {elapsed
              ? t('auth_files.cooldown_refresh_hint')
              : t('auth_files.cooldown_earliest', { time: duration(earliestSeconds) })}
          </span>
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={1.75}
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-open/cooldown:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="flex flex-col gap-2 border-t px-3 pt-1 pb-3 text-muted-foreground">
        <ul className="flex flex-col divide-y">
          {rows.map(({ record, remainingSeconds }, index) => (
            <li
              className="flex flex-col gap-0.5 py-2"
              key={`${record.scope}:${record.modelKey ?? ''}:${index}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 font-mono break-all text-foreground">
                  {record.scope === 'credential'
                    ? t('auth_files.cooldown_scope_credential')
                    : record.modelKey}
                </span>
                <span className="font-mono text-warning tabular-nums">
                  {remainingSeconds > 0
                    ? duration(remainingSeconds)
                    : t('auth_files.cooldown_timer_elapsed')}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3">
                <span>{t(cooldownReasonKey(record.reason))}</span>
                {record.httpStatus !== undefined && (
                  <span>{t('auth_files.cooldown_http_status', { status: record.httpStatus })}</span>
                )}
                {record.backoffLevel !== undefined && (
                  <span>{t('auth_files.cooldown_backoff', { level: record.backoffLevel })}</span>
                )}
              </div>
              <div>
                {t('auth_files.cooldown_deadline')}{' '}
                <time dateTime={record.retryAt}>
                  {formatDateTimeValue(record.retryAt, i18n.language)}
                </time>
              </div>
            </li>
          ))}
        </ul>
        {snapshot.observedAt && (
          <p>
            {t('auth_files.cooldown_observed')}{' '}
            <time dateTime={snapshot.observedAt}>
              {formatDateTimeValue(snapshot.observedAt, i18n.language)}
            </time>
          </p>
        )}
        <p className="text-faint">{t('auth_files.cooldown_note')}</p>
        {onReset && (
          <div>
            <Hint label={t('auth_files.cooldown_reset_hint')}>
              <Button
                variant="outline"
                size="sm"
                onClick={onReset}
                disabled={resetDisabled || resetting}
                aria-busy={resetting || undefined}
              >
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} data-icon="inline-start" />
                {t('auth_files.cooldown_reset_button')}
              </Button>
            </Hint>
          </div>
        )}
      </div>
    </details>
  );
}
