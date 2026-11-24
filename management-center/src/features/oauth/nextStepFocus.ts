import { useEffect, useRef } from 'react';

const isPhone = () => window.matchMedia('(width < 40rem)').matches;

/**
 * On desktop a dialog opens on its next step (marked `data-next-step`, e.g. "Open link") rather
 * than on the first control, which is often the close button or Cancel. While that step is still
 * disabled (the link is loading) the dialog itself holds focus until `useNextStepFocus` moves it.
 * Phones keep focusing the sheet itself.
 */
export function focusNextStep(event: Event) {
  const dialog = event.currentTarget;
  if (isPhone() || !(dialog instanceof HTMLElement)) return;
  const next = dialog.querySelector<HTMLElement>('[data-next-step]');
  if (!next) return;
  event.preventDefault();
  if (next.matches(':disabled')) dialog.focus();
  else next.focus();
}

/**
 * Focuses the returned element once `ready` turns true, if focus is still waiting: on the dialog
 * itself, its close button, or nowhere (the previous view's button was replaced).
 */
export function useNextStepFocus<T extends HTMLElement>(ready: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    const dialog = element?.closest<HTMLElement>('[role=dialog]');
    const active = document.activeElement;
    if (!ready || !element || !dialog || isPhone()) return;
    const waiting =
      active === dialog ||
      active === document.body ||
      (active instanceof HTMLElement && active.dataset.slot === 'dialog-close');
    if (waiting) element.focus();
  }, [ready]);
  return ref;
}
