import type { PropsWithChildren, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  Sheet as UiSheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type SheetSize = 'md' | 'lg' | 'xl';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  size?: SheetSize;
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  closeDisabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /**
   * If provided, called when the user closes the sheet (Escape, outside click, or the close
   * button). Return false (or a Promise that resolves to false) to keep the sheet open.
   */
  confirmClose?: () => boolean | Promise<boolean>;
}

const SIZE_CLASS: Record<SheetSize, string> = {
  md: 'data-[side=right]:sm:max-w-[640px]',
  lg: 'data-[side=right]:sm:max-w-[720px]',
  xl: 'data-[side=right]:sm:max-w-[960px]',
};

/** The old right-side Sheet API on top of VM Bridge's Radix sheet. */
export function Sheet({
  open,
  onClose,
  size = 'md',
  eyebrow,
  title,
  description,
  footer,
  closeDisabled = false,
  className,
  ariaLabel,
  confirmClose,
  children,
}: PropsWithChildren<SheetProps>) {
  const { t } = useTranslation();

  const requestClose = async () => {
    if (closeDisabled) return;
    if (confirmClose) {
      try {
        if ((await confirmClose()) === false) return;
      } catch {
        return;
      }
    }
    onClose();
  };

  return (
    <UiSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        {...(description ? {} : { 'aria-describedby': undefined })}
        aria-label={!title && ariaLabel ? ariaLabel : undefined}
        className={cn('gap-0 data-[side=right]:w-full', SIZE_CLASS[size], className)}
      >
        <div className="flex shrink-0 items-start gap-3 border-b p-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {eyebrow ? <div className="text-xs text-muted-foreground">{eyebrow}</div> : null}
            <SheetTitle
              className={cn('truncate text-lg font-semibold tracking-tight', !title && 'sr-only')}
            >
              {title ?? ariaLabel}
            </SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-0.5 -mr-1.5 shrink-0"
            onClick={() => void requestClose()}
            disabled={closeDisabled}
            aria-label={t('common.close')}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-muted/50 px-4 py-3 sm:px-6">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </UiSheet>
  );
}
