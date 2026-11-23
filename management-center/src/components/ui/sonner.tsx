import { useSyncExternalStore } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { usePhone } from '@/components/layout/pageBar';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Alert02Icon,
  MultiplicationSignCircleIcon,
  Loading03Icon,
} from '@hugeicons/core-free-icons';

const icon = 'size-[18px]';

// Radix marks the body while a dialog, sheet or menu holds the page.
const watchScrollLock = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-scroll-locked'] });
  return () => observer.disconnect();
};
const isScrollLocked = () => document.body.hasAttribute('data-scroll-locked');

/**
 * Toasts styled like the app's cards but one step lighter, so they lift off the page: a dark surface with a hairline border and a tinted icon tile
 * whose colour comes from `--tone`, set per toast type. Swiping sideways or toward the edge it sits on
 * dismisses one.
 */
const Toaster = ({ position, ...props }: ToasterProps) => {
  const phone = usePhone();
  const locked = useSyncExternalStore(watchScrollLock, isScrollLocked, () => false);
  // A phone's dialogs and sheets rise from the bottom, so while one is open toasts drop in from
  // the top instead of covering its title or buttons.
  const onTop = phone && locked;
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      gap={10}
      position={onTop ? 'top-center' : position}
      swipeDirections={['left', 'right', onTop ? 'top' : 'bottom']}
      // Phones: full width with the page gutter, sitting just above the bottom nav. A docked bar
      // (e.g. the auth files batch bar) sets --toast-lift to its height so toasts stack above it.
      mobileOffset={{
        top: 'calc(0.5rem + env(safe-area-inset-top))',
        bottom: 'calc(5rem + var(--toast-lift, 0px) + env(safe-area-inset-bottom))',
        left: 16,
        right: 16,
      }}
      icons={{
        success: <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.75} className={icon} />,
        info: <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={1.75} className={icon} />,
        warning: <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.75} className={icon} />,
        error: (
          <HugeiconsIcon icon={MultiplicationSignCircleIcon} strokeWidth={1.75} className={icon} />
        ),
        loading: (
          <HugeiconsIcon
            icon={Loading03Icon}
            strokeWidth={1.75}
            className={`${icon} animate-spin motion-reduce:animate-none`}
          />
        ),
      }}
      style={{ '--width': '380px' } as React.CSSProperties}
      toastOptions={{
        unstyled: true,
        classNames: {
          // Radix turns off pointer events on the page while a dialog is open; toasts stay swipeable.
          toast:
            'group/toast pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-white/10 bg-secondary p-3 pr-4 font-sans text-popover-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.04),0_16px_40px_-8px_rgb(0_0_0/0.85),0_0_0_1px_rgb(0_0_0/0.7)] max-sm:p-3.5',
          // Each type sets its own tone; a shared default on `toast` could win by CSS order.
          default: '[--tone:var(--muted-foreground)]',
          success: '[--tone:var(--success)]',
          error: '[--tone:var(--destructive)]',
          warning: '[--tone:var(--warning)]',
          info: '[--tone:var(--primary)]',
          loading: '[--tone:var(--primary)]',
          icon: 'm-0! flex size-8! shrink-0 items-center justify-center rounded-lg bg-(--tone)/14 text-(--tone) ring-1 ring-(--tone)/20 ring-inset',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5 self-center py-0.5',
          title: 'text-sm leading-5 font-medium break-words text-foreground',
          description: 'text-[13px] leading-5 text-muted-foreground',
          actionButton:
            'h-8 shrink-0 self-center rounded-md bg-primary-solid px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-solid/85',
          cancelButton:
            'h-8 shrink-0 self-center rounded-md border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
