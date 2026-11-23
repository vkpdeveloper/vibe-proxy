import { createContext, useContext, useSyncExternalStore } from 'react';

/** Tailwind's `max-sm:` breakpoint: phones get the bottom bar and the page bar in the top bar. */
const PHONE_QUERY = '(max-width: 639px)';

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

export function usePhone() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  );
}

/** What a page put into the top bar, so the layout can hide its own title, refresh and logo. */
export interface PageBarUse {
  actions: boolean;
  back: boolean;
}

interface PageBar {
  element: HTMLElement | null;
  /** Called while a page's content is in the bar; returns the cleanup. */
  register: (use: PageBarUse) => () => void;
  /** The short name of a top-level page, shown in the bar instead of the page's own title. */
  title?: string;
}

/**
 * On phones a page puts its title and actions inside the app's top bar (see PageBarContent), so
 * the title shows once and the content gets the height of a second header.
 */
export const PageBarContext = createContext<PageBar>({ element: null, register: () => () => {} });

/** The top bar element to portal into, on phones inside the app layout; otherwise null. */
export function usePageBar() {
  const phone = usePhone();
  const { element } = useContext(PageBarContext);
  return phone ? element : null;
}
