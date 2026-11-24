import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';

import { usePhone } from '@/components/layout/pageBar';
import { Button } from '@/components/ui/button';
import { useReturnFocus } from '@/components/ui/return-focus';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
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
} from '@/components/ui/phone-sheet';

function AlertDialog({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        PHONE_SHEET_OVERLAY,
        className
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  size = 'default',
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: 'default' | 'sm';
}) {
  const { t } = useTranslation();
  const phone = usePhone();
  const focus = useReturnFocus();
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        onOpenAutoFocus={(event) => {
          focus.remember();
          onOpenAutoFocus?.(event);
          focusSheetOnPhone(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          focus.restore(event);
        }}
        data-size={size}
        className={cn(
          'group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full max-w-xs -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-[size=default]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          PHONE_SHEET_DIALOG,
          className
        )}
        {...props}
      >
        <span aria-hidden className={cn('sm:hidden', SHEET_GRABBER)} />
        {/* Phones get the same close as every other sheet. Only phones mount it: Radix focuses
            one Cancel on open, and on desktop that must stay the footer's. */}
        {phone && (
          <AlertDialogPrimitive.Cancel asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn('absolute', PHONE_SHEET_CLOSE)}
              aria-label={t('common.close')}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </AlertDialogPrimitive.Cancel>
        )}
        <div data-slot="alert-dialog-body" className={PHONE_SHEET_BODY}>
          {children}
        </div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 group-data-[size=default]/alert-dialog-content:place-items-start group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]',
        PHONE_SHEET_HEADER,
        className
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        '-mx-4 -mb-4 flex flex-wrap gap-2 rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:justify-end',
        DIALOG_FOOTER_BUTTONS,
        PHONE_SHEET_FOOTER,
        className
      )}
      {...props}
    />
  );
}

function AlertDialogMedia({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        'text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
        PHONE_SHEET_TITLE,
        className
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        'text-sm text-balance text-muted-foreground max-sm:text-pretty md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className
      )}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Action
        data-slot="alert-dialog-action"
        className={cn(className)}
        {...props}
      />
    </Button>
  );
}

function AlertDialogCancel({
  className,
  variant = 'outline',
  size = 'default',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Cancel
        data-slot="alert-dialog-cancel"
        className={cn(className)}
        {...props}
      />
    </Button>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
