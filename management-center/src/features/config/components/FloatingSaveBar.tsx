import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Loading03Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { prefersReducedMotion } from '@/hooks/motion';
import { useToastLift } from '@/hooks/useToastLift';
import { usePhone } from '@/components/layout/pageBar';
import { cn } from '@/lib/utils';
import type { ConfigStatusTone } from '../uiState';

export type FloatingSaveBarProps = {
  /** Shown while there are unsaved changes (the same condition as the leave guard). */
  visible: boolean;
  statusText: string;
  statusTone: ConfigStatusTone;
  saving: boolean;
  saveDisabled: boolean;
  discardDisabled: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /**
   * Wider screens render the bar in place, centred on its container, positioned by these
   * classes (sticky at the end of a scrolling column, or absolute over a panel). Phones always
   * dock it above the bottom nav.
   */
  inlineClassName: string;
};

const toneDot: Record<ConfigStatusTone, string> = {
  error: 'bg-destructive',
  warning: 'bg-warning',
  busy: 'bg-primary',
  muted: 'bg-faint',
  ok: 'bg-success',
};

/**
 * A small bar at the bottom of the form while the config has unsaved changes.
 * It slides in and out with CSS (ease-out in, ease-in out) and unmounts after the exit.
 */
export function FloatingSaveBar({
  visible,
  statusText,
  statusTone,
  saving,
  saveDisabled,
  discardDisabled,
  onSave,
  onDiscard,
  inlineClassName,
}: FloatingSaveBarProps) {
  const { t } = useTranslation();
  const phone = usePhone();
  // Stays mounted through the exit animation; reduced motion has no animation, so it unmounts now.
  const [leaving, setLeaving] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    setLeaving(!visible && !prefersReducedMotion());
  }
  const barRef = useRef<HTMLDivElement>(null);
  useToastLift(barRef, visible);

  if ((!visible && !leaving) || typeof document === 'undefined') return null;

  const bar = (
    <div
      className={cn(
        'pointer-events-none z-40 flex justify-center px-4',
        phone
          ? 'fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))]'
          : inlineClassName
      )}
    >
      <div
        ref={barRef}
        role="group"
        aria-label={t('config_management.status_dirty')}
        onAnimationEnd={() => {
          if (!visible) setLeaving(false);
        }}
        className={cn(
          'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border bg-popover py-2 pr-2 pl-3.5 shadow-lg max-sm:gap-2 max-sm:pl-2 shadow-black/60 motion-reduce:animate-none',
          visible
            ? 'animate-in fade-in-0 slide-in-from-bottom-4 duration-200 ease-out'
            : 'animate-out fade-out-0 slide-out-to-bottom-4 fill-mode-forwards duration-150 ease-in'
        )}
      >
        {/* Phones have no room for the status beside both buttons, which already say what is pending. */}
        <span
          className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-muted-foreground max-sm:sr-only"
          aria-live="polite"
        >
          <span className={cn('size-2 shrink-0 rounded-full', toneDot[statusTone])} />
          <span className="truncate">{statusText}</span>
        </span>
        <Button
          variant="ghost"
          className="h-8 max-sm:flex-1"
          onClick={onDiscard}
          disabled={discardDisabled}
        >
          {t('config_management.actions.discard')}
        </Button>
        <Button className="h-8 max-sm:flex-1" onClick={onSave} disabled={saveDisabled}>
          <HugeiconsIcon
            icon={saving ? Loading03Icon : Tick02Icon}
            data-icon="inline-start"
            strokeWidth={2}
            className={cn(saving && 'animate-spin motion-reduce:animate-none')}
          />
          {t('config_management.actions.save')}
        </Button>
      </div>
    </div>
  );
  return phone ? createPortal(bar, document.body) : bar;
}
