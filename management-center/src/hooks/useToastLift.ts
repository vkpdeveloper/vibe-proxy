import { useLayoutEffect, type RefObject } from 'react';

/**
 * Phone toasts dock just above the bottom nav, where floating action bars also sit. While `active`,
 * this sets --toast-lift (read by the Toaster's phone offset) to the bar's height plus a gap, so
 * toasts stack above the bar instead of covering it.
 */
export function useToastLift(ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const element = active ? ref.current : null;
    if (!element) return;
    const root = document.documentElement;
    const update = () =>
      root.style.setProperty('--toast-lift', `${element.getBoundingClientRect().height + 8}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--toast-lift');
    };
  }, [ref, active]);
}
