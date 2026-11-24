import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { EmailPrivacyText } from '@/components/common/EmailPrivacyText';
import { useNotificationStore } from '@/stores';

/** The store-driven confirmation behind `showConfirmation`. */
export function ConfirmationModal() {
  const { t } = useTranslation();
  const confirmation = useNotificationStore((state) => state.confirmation);
  const hideConfirmation = useNotificationStore((state) => state.hideConfirmation);
  const setConfirmationLoading = useNotificationStore((state) => state.setConfirmationLoading);
  const { isOpen, isLoading, options } = confirmation;

  const handleConfirm = async () => {
    if (!options) return;
    try {
      setConfirmationLoading(true);
      await options.onConfirm();
      hideConfirmation();
    } catch (error) {
      // The caller reports its own errors; keep the dialog open so it can be retried.
      console.error('Confirmation action failed:', error);
    } finally {
      setConfirmationLoading(false);
    }
  };

  const handleCancel = () => {
    if (isLoading) return;
    options?.onCancel?.();
    hideConfirmation();
  };

  const message = options?.message;

  return (
    <AlertDialog
      open={isOpen && Boolean(options)}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      {options && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {options.title ? <EmailPrivacyText text={options.title} /> : t('common.confirm')}
            </AlertDialogTitle>
            {typeof message === 'string' ? (
              <AlertDialogDescription>
                <EmailPrivacyText text={message} />
              </AlertDialogDescription>
            ) : (
              <AlertDialogDescription asChild>
                <div>{message}</div>
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Radix focuses the Cancel on open, which keeps Tab inside the dialog. Closing it
                goes through onOpenChange, which runs handleCancel. */}
            <AlertDialogCancel disabled={isLoading}>
              {options.cancelText || t('common.cancel')}
            </AlertDialogCancel>
            <Button
              variant={options.variant === 'danger' ? 'destructive' : 'default'}
              onClick={() => void handleConfirm()}
              disabled={isLoading}
            >
              {options.confirmText || t('common.confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
