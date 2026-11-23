import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotificationStore } from '@/stores';

/** Returns a handler that asks before logging out, through the shared confirmation sheet. */
export function useConfirmLogout() {
  const { t } = useTranslation();
  const logout = useAuthStore((state) => state.logout);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);

  return () =>
    showConfirmation({
      title: t('header.logout_confirm_title'),
      message: t('header.logout_confirm_message'),
      confirmText: t('header.logout'),
      variant: 'danger',
      onConfirm: logout,
    });
}
