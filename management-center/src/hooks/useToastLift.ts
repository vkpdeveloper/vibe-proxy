import { useLayoutEffect, type RefObject } from 'react';

/**
 * Toasts dock at the bottom of the screen (on phones just above the bottom nav), where floating
 * action bars also sit. While `active`, this sets two variables the toasts read so they stack
 * above the bar instead of covering it:
 * - --toast-lift, the bar's height plus a gap (phones, where the bar docks just above the nav);
 * - --toast-clear, the distance from the bottom of the screen to just above the bar's top edge
 *   (desktop, where bars sit at different heights, some inside the page's scroller).
 */
export function useToastLift(ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const element = active ? ref.current : null;
    if (!element) return;
    const root = document.documentElement;
    const update = () => {
      const rect = element.getBoundingClientRect();
      root.style.setProperty('--toast-lift', `${rect.height + 8}px`);
      root.style.setProperty('--toast-clear', `${window.innerHeight - rect.top + 12}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    // Measured again once the bar has slid in, and whenever it moves: a sticky bar moves while
    // its scroller scrolls, and every bar moves with the window.
    element.addEventListener('animationend', update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('animationend', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, { capture: true });
      root.style.removeProperty('--toast-lift');
      root.style.removeProperty('--toast-clear');
    };
  }, [ref, active]);
}
