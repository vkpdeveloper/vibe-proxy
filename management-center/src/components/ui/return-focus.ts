import { useRef } from 'react';

/**
 * Radix returns focus to an overlay's Trigger on close, so overlays opened from state (a menu
 * item, a row, a store action) drop focus to the page body. This remembers what had focus when
 * the overlay opened and returns there instead, unless the caller already moved focus itself.
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    // `onOpenAutoFocus` runs before focus moves into the overlay, so this is still the opener.
    remember: () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body) {
        opener.current = null;
        return;
      }
      // A menu item is gone by the time the overlay closes; its menu's button is what opened it.
      const menu = active.closest('[role=menu]');
      const menuButton = menu?.id
        ? document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`)
        : null;
      opener.current = menuButton ?? active;
    },
    restore: (event: Event) => {
      const element = opener.current;
      opener.current = null;
      if (event.defaultPrevented || !element?.isConnected) return;
      event.preventDefault();
      element.focus({ preventScroll: true });
    },
  };
}
