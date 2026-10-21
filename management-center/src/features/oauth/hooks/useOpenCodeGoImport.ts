import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '@/stores';
import { getErrorMessage } from '@/utils/helpers';
import { notifyAuthFilesChanged } from '@/features/authFiles/authFilesEvents';
import { uploadCredentialJson, type ApiKeyImportState } from '../apiKeyImport';

export interface OpenCodeGoImportState extends ApiKeyImportState {
  email: string;
}

export type OpenCodeGoField = 'apiKey' | 'email';

const INITIAL_STATE: OpenCodeGoImportState = {
  apiKey: '',
  email: '',
  showKey: false,
  loading: false,
  success: false,
};

/** OpenCode Go API key import: writes `opencode-go.json` and uploads it as an auth file. */
export function useOpenCodeGoImport(options: {
  /** Inline result while the dialog is open; toast only when it was closed mid-upload. */
  isFocused: () => boolean;
  onCredentialAdded: () => void;
}) {
  const { isFocused, onCredentialAdded } = options;
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const [openCodeGo, setOpenCodeGo] = useState<OpenCodeGoImportState>(INITIAL_STATE);

  const setField = (field: OpenCodeGoField, value: string) =>
    setOpenCodeGo((prev) => ({ ...prev, [field]: value, error: undefined, success: false }));

  const toggleShowKey = () => setOpenCodeGo((prev) => ({ ...prev, showKey: !prev.showKey }));

  const importCredential = async () => {
    if (openCodeGo.loading) return;
    const apiKey = openCodeGo.apiKey.trim();
    const email = openCodeGo.email.trim();
    if (!apiKey) {
      setOpenCodeGo((prev) => ({
        ...prev,
        error: t('opencode_go_login.api_key_required'),
        success: false,
      }));
      return;
    }

    setOpenCodeGo((prev) => ({ ...prev, loading: true, error: undefined, success: false }));
    try {
      await uploadCredentialJson(
        'opencode-go.json',
        {
          type: 'opencode-go',
          auth_kind: 'api_key',
          api_key: apiKey,
          note: 'OpenCode Go quota tracking',
          ...(email ? { email } : {}),
        },
        t('notification.upload_failed')
      );
      setOpenCodeGo((prev) => ({
        ...prev,
        apiKey: '',
        loading: false,
        error: undefined,
        success: true,
      }));
      notifyAuthFilesChanged();
      onCredentialAdded();
      if (!isFocused()) showNotification(t('opencode_go_login.success'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err) || t('notification.upload_failed');
      setOpenCodeGo((prev) => ({ ...prev, loading: false, error: message, success: false }));
      if (!isFocused()) showNotification(`${t('opencode_go_login.failed')} ${message}`, 'error');
    }
  };

  /** Back to the form after a successful import; keeps the email. */
  const resetForAnother = () =>
    setOpenCodeGo((prev) => ({ ...prev, error: undefined, success: false }));

  return { openCodeGo, setField, toggleShowKey, importCredential, resetForAnother };
}
