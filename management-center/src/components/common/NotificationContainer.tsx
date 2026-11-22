import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNotificationStore } from '@/stores';
import { EmailPrivacyText } from '@/components/common/EmailPrivacyText';

/**
 * Shows the notification store's messages as sonner toasts, so callers keep using
 * `showNotification`. Sonner pauses on hover, focus and hidden tabs; a closed toast leaves the store.
 */
export function NotificationContainer() {
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const shown = useRef(new Set<string>());

  useEffect(() => {
    const ids = new Set(notifications.map((notification) => notification.id));
    for (const { id, type, message, duration } of notifications) {
      if (shown.current.has(id)) continue;
      shown.current.add(id);
      toast[type](<EmailPrivacyText text={message} />, {
        id,
        duration,
        onDismiss: () => removeNotification(id),
        onAutoClose: () => removeNotification(id),
      });
    }
    // Dropped from the store some other way: close the toast too.
    for (const id of shown.current) {
      if (ids.has(id)) continue;
      shown.current.delete(id);
      toast.dismiss(id);
    }
  }, [notifications, removeNotification]);

  return null;
}
