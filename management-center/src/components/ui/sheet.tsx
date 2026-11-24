'use client';

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Dialog as SheetPrimitive } from 'radix-ui';

import { Button } from '@/components/ui/button';
import { useReturnFocus } from '@/components/ui/return-focus';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import {
  DIALOG_FOOTER_BUTTONS,
  PHONE_SHEET_CLOSE,
  PHONE_SHEET_OVERLAY,
  PHONE_SHEET_TITLE,
  SHEET_GRABBER,
  focusSheetOnPhone,
  ignoreToastPress,
} from '@/components/ui/phone-sheet';

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        PHONE_SHEET_OVERLAY,
        className
      )}
      {...props}
    />
  );
}

/** The phone bottom sheet that left and right sheets turn into below sm. */
const SIDE_TO_BOTTOM =
  'max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:h-auto max-sm:max-h-[90dvh] max-sm:w-full max-sm:rounded-t-2xl max-sm:border-0 max-sm:bg-muted max-sm:ring-1 max-sm:ring-foreground/10 max-sm:pt-1 max-sm:pb-[env(safe-area-inset-bottom)] max-sm:data-open:slide-in-from-bottom-10 max-sm:data-closed:slide-out-to-bottom-10';

// Per side, so a caller's own classes (padding, height) merge over these instead of losing to
// higher-specificity data-[side] variants.
const SIDE_CLASS = {
  bottom:
    'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl bg-muted ring-1 ring-foreground/10 pt-1 pb-[env(safe-area-inset-bottom)] data-open:slide-in-from-bottom-10 data-closed:slide-out-to-bottom-10',
  top: 'inset-x-0 top-0 h-auto border-b data-open:slide-in-from-top-10 data-closed:slide-out-to-top-10',
  left: cn(
    'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm sm:data-open:slide-in-from-left-10 sm:data-closed:slide-out-to-left-10',
    SIDE_TO_BOTTOM
  ),
  right: cn(
    'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm sm:data-open:slide-in-from-right-10 sm:data-closed:slide-out-to-right-10',
    SIDE_TO_BOTTOM
  ),
};

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  overlayClassName,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  showCloseButton?: boolean;
  overlayClassName?: string;
}) {
  const { t } = useTranslation();
  const focus = useReturnFocus();
  return (
    <SheetPortal>
      <SheetOverlay className={overlayClassName} />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        onOpenAutoFocus={(event) => {
          focus.remember();
          onOpenAutoFocus?.(event);
          focusSheetOnPhone(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          focus.restore(event);
        }}
        onInteractOutside={(event) => {
          ignoreToastPress(event);
          onInteractOutside?.(event);
        }}
        data-side={side}
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-popover outline-none bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
          SIDE_CLASS[side],
          className
        )}
        {...props}
      >
        {side !== 'top' && (
          <span
            aria-hidden
            data-slot="sheet-grabber"
            className={cn(SHEET_GRABBER, side !== 'bottom' && 'sm:hidden')}
          />
        )}
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              className={cn('absolute top-3 right-3', PHONE_SHEET_CLOSE)}
              size="icon-sm"
              aria-label={t('common.close')}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

// Phones keep the shared header position (see phone-sheet.ts) even when a caller pads the header
// differently for desktop; the title leaves room for the close.
function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-0.5 p-4 max-sm:p-4', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        'mt-auto flex flex-col gap-2 p-4 max-sm:flex-row max-sm:flex-wrap max-sm:[&>button]:flex-1',
        DIALOG_FOOTER_BUTTONS,
        className
      )}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-base font-medium text-foreground', PHONE_SHEET_TITLE, className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
