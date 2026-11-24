import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { useReturnFocus } from '@/components/ui/return-focus';
import {
  DIALOG_FOOTER_BUTTONS,
  PHONE_SHEET_BODY,
  PHONE_SHEET_CLOSE,
  PHONE_SHEET_DIALOG,
  PHONE_SHEET_FOOTER,
  PHONE_SHEET_HEADER,
  PHONE_SHEET_OVERLAY,
  PHONE_SHEET_TITLE,
  SHEET_GRABBER,
  focusSheetOnPhone,
  ignoreToastPress,
} from '@/components/ui/phone-sheet';

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        PHONE_SHEET_OVERLAY,
        className
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  const { t } = useTranslation();
  const focus = useReturnFocus();
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
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
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          PHONE_SHEET_DIALOG,
          className
        )}
        {...props}
      >
        <span aria-hidden className={cn('sm:hidden', SHEET_GRABBER)} />
        <div data-slot="dialog-body" className={PHONE_SHEET_BODY}>
          {children}
        </div>
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className={cn('absolute top-2 right-2', PHONE_SHEET_CLOSE)}
              size="icon-sm"
              aria-label={t('common.close')}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2', PHONE_SHEET_HEADER, className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        '-mx-4 -mb-4 flex flex-wrap gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:justify-end',
        DIALOG_FOOTER_BUTTONS,
        PHONE_SHEET_FOOTER,
        className
      )}
      {...props}
    >
      {children}
      {/* Phones already have the sheet's X. */}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline" className="max-sm:hidden">
            {t('common.close')}
          </Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base leading-none font-medium', PHONE_SHEET_TITLE, className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
