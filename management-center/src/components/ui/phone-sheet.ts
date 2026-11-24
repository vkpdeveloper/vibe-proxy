/**
 * Phones show every overlay (sheet, dialog, alert dialog) as the same bottom sheet as the More
 * menu: rounded top, grab handle, muted surface, scrolling inside when it is taller than the screen.
 *
 * One header everywhere: the handle 8px from the top, a 40px close 12px from the top and 8px from
 * the right, and a 16px title on a 24px line 20px from the top, so it centres on the close.
 */

/**
 * Turns a centred dialog into the bottom sheet below sm. The sheet itself doesn't scroll; its
 * children sit in PHONE_SHEET_BODY, so the handle and close stay put.
 */
export const PHONE_SHEET_DIALOG =
  'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:flex max-sm:max-h-[90dvh] max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:flex-col max-sm:overflow-hidden max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:bg-muted max-sm:pt-5 max-sm:pb-0 max-sm:duration-200 max-sm:data-open:zoom-in-100 max-sm:data-open:slide-in-from-bottom-10 max-sm:data-closed:zoom-out-100 max-sm:data-closed:slide-out-to-bottom-10';

/**
 * Wraps a dialog's children. Desktop: `contents`, so the dialog's own layout is unchanged. Phone:
 * the scrolling region, edge to edge whatever the dialog's padding, keeping the dialog's gap. The
 * header and footer stick inside it, so callers don't need a body element of their own. A footer
 * carries the bottom safe area itself; without one the body does.
 */
export const PHONE_SHEET_BODY =
  'contents max-sm:-mx-4 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col max-sm:gap-[inherit] max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:px-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:has-data-[slot=dialog-footer]:pb-0 max-sm:has-data-[slot=alert-dialog-footer]:pb-0';

/** A dialog header that stays at the top of the phone sheet while the body scrolls under it. */
export const PHONE_SHEET_HEADER =
  'max-sm:sticky max-sm:top-0 max-sm:z-10 max-sm:-mx-4 max-sm:-mb-3 max-sm:bg-muted max-sm:px-4 max-sm:pb-3';

/**
 * Every overlay title on phones: one size and weight, clear of the close. Only the title makes
 * room for the close, so descriptions below it use the full width.
 */
export const PHONE_SHEET_TITLE =
  'max-sm:pr-8 max-sm:text-base max-sm:leading-6 max-sm:font-semibold';

/**
 * A dialog footer that stays at the bottom of the phone sheet, edge to edge, with equal-width
 * buttons in one row.
 */
export const PHONE_SHEET_FOOTER =
  'max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:mb-0 max-sm:rounded-b-none max-sm:bg-muted max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:[&>button]:flex-1';

/** Desktop dialog footers: every regular button 36px tall, whatever size the caller picked. */
export const DIALOG_FOOTER_BUTTONS =
  'sm:[&_:is([data-slot=button],[data-slot=alert-dialog-action],[data-slot=alert-dialog-cancel]):not([data-size^=icon])]:h-9';

export const SHEET_GRABBER =
  'absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-foreground/20';

/** The close button's phone position, shared by every overlay. */
export const PHONE_SHEET_CLOSE = 'max-sm:top-3 max-sm:right-2 max-sm:z-20 max-sm:size-10';

/**
 * `onOpenAutoFocus` for overlays: on phones, focus the sheet itself instead of its first field, so
 * opening one doesn't pop the keyboard over it or draw a focus ring on the first control.
 */
export function focusSheetOnPhone(event: Event) {
  if (event.defaultPrevented || !window.matchMedia('(width < 40rem)').matches) return;
  event.preventDefault();
  if (event.currentTarget instanceof HTMLElement)
    event.currentTarget.focus({ preventScroll: true });
}

/**
 * Toasts can sit beside an open dialog or sheet. Touching one (to swipe it away) is outside the
 * dialog, which would otherwise close it.
 */
export function ignoreToastPress(event: Event) {
  if (event.target instanceof Element && event.target.closest('[data-toaster]')) {
    event.preventDefault();
  }
}

/** The dimmer behind phone sheets; the desktop blur is costly and hard to see on a small screen. */
export const PHONE_SHEET_OVERLAY =
  'max-sm:bg-black/60 max-sm:supports-backdrop-filter:backdrop-blur-none';
