import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  MultiplicationSignCircleIcon,
} from '@hugeicons/core-free-icons';
import { EmailPrivacyText } from '@/components/common/EmailPrivacyText';
import { usePhone } from '@/components/layout/pageBar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { prefersReducedMotion } from '@/hooks/motion';
import { cn } from '@/lib/utils';
import { useNotificationStore } from '@/stores';
import type { Notification, NotificationType } from '@/types';
import { NOTIFICATION_DURATION_MS } from '@/utils/constants';

const ICONS: Record<NotificationType, IconSvgElement> = {
  success: CheckmarkCircle02Icon,
  info: InformationCircleIcon,
  warning: Alert02Icon,
  error: MultiplicationSignCircleIcon,
};

const TONES: Record<NotificationType, string> = {
  success: '[--tone:var(--success)]',
  info: '[--tone:var(--primary)]',
  warning: '[--tone:var(--warning)]',
  error: '[--tone:var(--destructive)]',
};

const MAX_VISIBLE = 3;
/** A swipe dismisses once it travels this far (px), or is flicked this fast (px/ms). */
const SWIPE_DISTANCE = 56;
const SWIPE_VELOCITY = 0.35;
/** Movement before a press counts as a swipe and picks its axis, so taps stay taps. */
const SWIPE_SLOP = 6;
const EXIT_MS = 180;
const SETTLE = 'transform 200ms ease-out, translate 200ms ease-out, opacity 200ms ease-out';

// Radix marks the body while a dialog, sheet or menu holds the page; overlays portal into it.
const watchOverlays = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-scroll-locked'],
    childList: true,
  });
  return () => observer.disconnect();
};
/**
 * -1 while nothing holds the page; otherwise how much of the right edge an open side sheet
 * covers (0 for a centred dialog), so desktop toasts can sit beside it.
 */
const overlayInset = () => {
  if (!document.body.hasAttribute('data-scroll-locked')) return -1;
  const sheet = document.querySelector<HTMLElement>(
    '[data-slot=sheet-content][data-side=right][data-state=open]'
  );
  return sheet?.offsetWidth ?? 0;
};

const watchWidth = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};

const TOAST_WIDTH = 380;
const EDGE_GAP = 24;

const watchVisibility = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};

/**
 * The notification store's messages as toasts: cards one step lighter than the page with a tinted
 * icon tile. Swipe one left or right (or toward its screen edge) to dismiss it; with a mouse,
 * its close button.
 *
 * Built in-house because sonner pauses its timer on hover, and a tap on a touch screen counts as
 * a hover that never ends, so toasts tapped on a phone never went away.
 */
export function NotificationContainer() {
  const { t } = useTranslation();
  const notifications = useNotificationStore((state) => state.notifications);
  const phone = usePhone();
  const inset = useSyncExternalStore(watchOverlays, overlayInset, () => -1);
  const width = useSyncExternalStore(
    watchWidth,
    () => window.innerWidth,
    () => 0
  );
  // Beside an open side sheet when it fits there, otherwise centred along the top.
  const beside = inset + TOAST_WIDTH + 2 * EDGE_GAP <= width;
  // While a dialog or sheet is open toasts drop in from the top instead of covering its buttons
  // (phone sheets rise from the bottom; desktop dialogs and sheets keep their buttons there).
  const edge = inset >= 0 ? 'top' : 'bottom';

  return (
    <section
      data-toaster=""
      aria-label={t('notification.region_label')}
      className={cn(
        'pointer-events-none fixed z-[100] flex gap-2.5',
        edge === 'top' ? 'flex-col-reverse' : 'flex-col',
        phone ? 'inset-x-4' : 'w-[380px] max-w-[calc(100vw-2rem)]'
      )}
      style={
        phone
          ? edge === 'top'
            ? { top: 'calc(0.5rem + env(safe-area-inset-top))' }
            : // Just above the bottom nav; a docked bar (useToastLift) raises it further.
              { bottom: 'calc(5rem + var(--toast-lift, 0px) + env(safe-area-inset-bottom))' }
          : edge === 'top'
            ? beside
              ? { top: EDGE_GAP, right: EDGE_GAP + inset }
              : { top: EDGE_GAP, left: 0, right: 0, marginInline: 'auto' }
            : // A floating bar (useToastLift) sets how far above the bottom its top edge is.
              { right: EDGE_GAP, bottom: `max(${EDGE_GAP}px, var(--toast-clear, 0px))` }
      }
    >
      {notifications.slice(-MAX_VISIBLE).map((notification) => (
        <Toast key={notification.id} notification={notification} edge={edge} />
      ))}
    </section>
  );
}

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  time: number;
  axis: 'x' | 'y' | null;
  dx: number;
  dy: number;
}

function Toast({ notification, edge }: { notification: Notification; edge: 'top' | 'bottom' }) {
  const { t } = useTranslation();
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const [leaving, setLeaving] = useState(false);
  // Only a real mouse hovering pauses; touch has no hover to end.
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const hidden = useSyncExternalStore(
    watchVisibility,
    () => document.hidden,
    () => false
  );
  const remaining = useRef(notification.duration ?? NOTIFICATION_DURATION_MS);
  const drag = useRef<Drag | null>(null);

  const paused = hovered || pressed || hidden || leaving;
  useEffect(() => {
    if (paused || !Number.isFinite(remaining.current)) return;
    const started = Date.now();
    const timer = window.setTimeout(() => setLeaving(true), Math.max(remaining.current, 0));
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(
      () => removeNotification(notification.id),
      prefersReducedMotion() ? 0 : EXIT_MS
    );
    return () => window.clearTimeout(timer);
  }, [leaving, notification.id, removeNotification]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Swipes are for touch; a mouse selects the text (to copy an error) and has the close button.
    if (leaving || event.button !== 0 || event.pointerType === 'mouse') return;
    if (event.target instanceof Element && event.target.closest('button, a')) return;
    // Capture on the card itself, so the swipe keeps tracking when the finger leaves it.
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.style.transition = 'none';
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      axis: null,
      dx: 0,
      dy: 0,
    };
    setPressed(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.axis) {
      if (Math.hypot(dx, dy) < SWIPE_SLOP) return;
      current.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }
    const card = event.currentTarget;
    if (current.axis === 'x') {
      current.dx = dx;
      card.style.transform = `translateX(${dx}px)`;
      card.style.opacity = String(1 - Math.min(Math.abs(dx) / card.offsetWidth, 1) * 0.7);
    } else {
      // Free toward the screen edge, resisted the other way.
      const toward = edge === 'bottom' ? Math.max(dy, 0) : Math.min(dy, 0);
      current.dy = toward + (dy - toward) * 0.2;
      card.style.transform = `translateY(${current.dy}px)`;
    }
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setPressed(false);
    const card = event.currentTarget;
    card.style.transition = prefersReducedMotion() ? 'none' : SETTLE;

    const distance = current.axis === 'x' ? current.dx : current.dy;
    const velocity = Math.abs(distance) / Math.max(performance.now() - current.time, 1);
    const towardEdge = current.axis === 'x' || (edge === 'bottom' ? distance > 0 : distance < 0);
    const swiped =
      !cancelled &&
      current.axis !== null &&
      towardEdge &&
      (Math.abs(distance) >= SWIPE_DISTANCE ||
        (Math.abs(distance) > SWIPE_SLOP * 2 && velocity >= SWIPE_VELOCITY));

    if (!swiped) {
      card.style.transform = '';
      card.style.opacity = '';
      return;
    }
    const away = Math.sign(distance);
    card.style.transform =
      current.axis === 'x'
        ? `translateX(${away * (card.offsetWidth + 32)}px)`
        : `translateY(${away * (card.offsetHeight + 32)}px)`;
    card.style.opacity = '0';
    setLeaving(true);
  };

  const { type } = notification;
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endDrag(event, false)}
      onPointerCancel={(event) => endDrag(event, true)}
      onPointerEnter={(event) => event.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && setHovered(false)}
      className={cn(
        TONES[type],
        // touch-none: the browser must not take the swipe for scrolling or back navigation.
        'group/toast pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-white/10 bg-secondary p-3.5 pr-4 font-sans text-popover-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.04),0_16px_40px_-8px_rgb(0_0_0/0.85),0_0_0_1px_rgb(0_0_0/0.7)] sm:gap-2.5 sm:p-2.5 sm:pr-2.5 pointer-coarse:touch-none pointer-coarse:select-none',
        'transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-none',
        edge === 'top' ? 'starting:-translate-y-3' : 'starting:translate-y-3',
        'starting:opacity-0',
        leaving && cn('opacity-0', edge === 'top' ? '-translate-y-2' : 'translate-y-2')
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--tone)/14 text-(--tone) ring-1 ring-(--tone)/20 ring-inset sm:size-7 sm:rounded-md">
        <HugeiconsIcon icon={ICONS[type]} strokeWidth={1.75} className="size-[18px] sm:size-4" />
      </div>
      <p className="min-w-0 flex-1 self-center py-0.5 text-sm leading-5 font-medium break-words text-foreground">
        <EmailPrivacyText text={notification.message} />
      </p>
      {/* Mouse and keyboard only: touch swipes the toast away. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('common.close')}
            onClick={() => setLeaving(true)}
            className="text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/toast:opacity-100 sm:-my-0.5 focus-visible:opacity-100 max-sm:hidden motion-reduce:transition-none pointer-coarse:hidden"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} />
          </Button>
        </TooltipTrigger>
        {/* Above the toasts' own layer. */}
        <TooltipContent className="z-[101]">{t('common.close')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
