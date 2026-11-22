import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { cn } from '@/lib/utils';

/** Where an item sits inside its nav, from offset* so transforms and scrolling don't skew it. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Highlight {
  item: string;
  label: string;
  box: Box;
  shown: boolean;
  /** False when it should jump into place: its first appearance, or a resize. */
  slide: boolean;
  /** Shown by keyboard focus rather than the pointer. */
  focused: boolean;
}

const sameBox = (a: Box, b: Box) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const measure = (element: HTMLElement): Box => ({
  x: element.offsetLeft,
  y: element.offsetTop,
  width: element.offsetWidth,
  height: element.offsetHeight,
});

/**
 * One hover highlight and one active highlight per nav, each a single element that moves between items
 * instead of every item fading its own background. Items need `relative` so they paint above the highlights.
 */
export function useSlidingNav(active: string | undefined) {
  const navRef = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState<{ box: Box; slide: boolean } | null>(null);
  const [hover, setHover] = useState<Highlight | null>(null);
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined);

  const find = (item: string) =>
    navRef.current?.querySelector<HTMLElement>(`[data-nav-item="${item}"]`);

  const place = (slide: boolean) => {
    const element = active ? find(active) : null;
    setCurrent((previous) => {
      if (!element) return null;
      const box = measure(element);
      // Keep a slide in flight when a resize didn't actually move the item.
      if (!slide && previous && sameBox(previous.box, box)) return previous;
      return { box, slide: slide && previous !== null };
    });
  };

  // Before paint, so a deep link or a change no click caused never shows the highlight on the wrong item.
  useLayoutEffect(() => place(true), [active]);

  // A resize (or the layout switching between rail and bottom bar) moves items without any interaction: jump, don't slide.
  const latestPlace = useRef(place);
  useLayoutEffect(() => {
    latestPlace.current = place;
  });
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(() => {
      latestPlace.current(false);
      setHover((previous) => {
        const element = previous && find(previous.item);
        if (!previous || !element) return null;
        const box = measure(element);
        return sameBox(previous.box, box) ? previous : { ...previous, box, slide: false };
      });
    });
    observer.observe(nav);
    for (const item of nav.querySelectorAll('[data-nav-item]')) observer.observe(item);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => clearTimeout(leaving.current), []);

  const show = (item: string, label: string, element: HTMLElement, focused: boolean) => {
    clearTimeout(leaving.current);
    setHover((previous) => ({
      item,
      label,
      box: measure(element),
      shown: true,
      slide: previous?.shown ?? false,
      focused,
    }));
  };
  const hide = () => {
    clearTimeout(leaving.current);
    setHover((previous) => previous && { ...previous, shown: false });
  };

  return {
    hover,
    current,
    hide,
    navProps: {
      ref: navRef,
      onPointerLeave: hide,
      onBlur: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) hide();
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape') hide();
      },
    },
    itemProps: (item: string, label: string) => ({
      'data-nav-item': item,
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        // Touch has no hover; a tap would leave the highlight stuck on the item.
        if (event.pointerType !== 'touch') show(item, label, event.currentTarget, false);
      },
      // Crossing the gap to the next item keeps the highlight; it only leaves when no item is entered soon.
      onPointerLeave: () => {
        leaving.current = setTimeout(hide, 120);
      },
      onFocus: (event: FocusEvent<HTMLElement>) => {
        if (event.currentTarget.matches(':focus-visible'))
          show(item, label, event.currentTarget, true);
      },
    }),
  };
}

export const boxStyle = ({ x, y, width, height }: Box): CSSProperties => ({
  transform: `translate(${x}px, ${y}px)`,
  width,
  height,
});

/** A highlight behind the nav's items. Transform and size only, and only while something changes. */
export function NavIndicator({
  box,
  shown = true,
  slide,
  className,
}: {
  box: Box;
  shown?: boolean;
  slide: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-0 left-0 ease-out motion-reduce:transition-none',
        slide
          ? 'transition-[transform,width,height,opacity] duration-200'
          : 'transition-opacity duration-150',
        !shown && 'opacity-0',
        className
      )}
      style={boxStyle(box)}
    />
  );
}
