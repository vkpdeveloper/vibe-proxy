import type { PropsWithChildren, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number | string;
  className?: string;
  closeDisabled?: boolean;
}

/**
 * The old Modal API on top of VM Bridge's Dialog. Like before, clicking outside does not
 * close it (forms inside would lose their input), and closeDisabled also blocks Escape.
 */
export function Modal({
  open,
  title,
  onClose,
  footer,
  width = 520,
  className,
  closeDisabled = false,
  children,
}: PropsWithChildren<ModalProps>) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !closeDisabled) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onInteractOutside={(event) => event.preventDefault()}
        className={cn(
          'flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100%-2rem)]',
          className
        )}
        style={{ width }}
      >
        <div className="flex shrink-0 items-start gap-3 p-4 pb-3">
          <DialogTitle className="min-w-0 flex-1 pt-1.5 leading-snug">{title}</DialogTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-1 -mr-1 shrink-0"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label={t('common.close')}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-end">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
