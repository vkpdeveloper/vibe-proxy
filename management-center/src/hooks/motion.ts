import { useLayoutEffect, useRef } from 'react';

/**
 * VM Bridge motion: a short opacity and transform reveal, ease-out, and nothing at all when the
 * viewer prefers reduced motion. The Web Animations API runs it, so no motion library is needed.
 */
const REVEAL_DISTANCE = 6;
const REVEAL_DURATION = 200;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
/** Group stagger, capped so a long list never takes more than 120ms to settle. */
const GROUP_STAGGER = 30;
const GROUP_MAX_TOTAL = 120;

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canReveal = () =>
  !prefersReducedMotion() &&
  typeof IntersectionObserver !== 'undefined' &&
  typeof Element !== 'undefined' &&
  typeof Element.prototype.animate === 'function';

/**
 * Hides the element before paint and fades it up once it scrolls into view. The hidden state
 * is written by script, so content stays visible if the script never runs.
 */
function reveal(elements: HTMLElement[], trigger: HTMLElement, delayMs: number) {
  const step =
    elements.length > 1
      ? Math.min(GROUP_STAGGER, GROUP_MAX_TOTAL / (elements.length - 1))
      : GROUP_STAGGER;
  const hidden = { opacity: '0', transform: `translate3d(0, ${REVEAL_DISTANCE}px, 0)` };
  elements.forEach((element) => Object.assign(element.style, hidden));

  const animations: Animation[] = [];
  const clear = () =>
    elements.forEach((element) => {
      element.style.removeProperty('opacity');
      element.style.removeProperty('transform');
    });

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      elements.forEach((element, index) => {
        element.style.removeProperty('opacity');
        element.style.removeProperty('transform');
        animations.push(
          element.animate([hidden, { opacity: '1', transform: 'translate3d(0, 0, 0)' }], {
            duration: REVEAL_DURATION,
            delay: delayMs + index * step,
            easing: EASE_OUT,
            fill: 'backwards',
          })
        );
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
  );
  observer.observe(trigger);

  return () => {
    observer.disconnect();
    animations.forEach((animation) => animation.cancel());
    clear();
  };
}

/** Fades an element up as it scrolls into view. */
export function useRevealOnScroll<T extends HTMLElement>(delaySeconds = 0) {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !canReveal()) return;
    return reveal([element], element, delaySeconds * 1000);
  }, [delaySeconds]);

  return ref;
}

/**
 * When the container scrolls into view, its `[data-reveal]` children fade up in DOM order with
 * a small stagger.
 */
export function useRevealGroup<T extends HTMLElement>(baseDelaySeconds = 0) {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container || !canReveal()) return;
    const children = Array.from(container.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (children.length === 0) return;
    return reveal(children, container, baseDelaySeconds * 1000);
  }, [baseDelaySeconds]);

  return ref;
}
