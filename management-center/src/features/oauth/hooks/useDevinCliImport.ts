import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '@/stores';
import { getErrorMessage } from '@/utils/helpers';
import { notifyAuthFilesChanged } from '@/features/authFiles/authFilesEvents';
import { uploadCredentialJson, type ApiKeyImportState } from '../apiKeyImport';

export interface DevinCliImportState extends ApiKeyImportState {
  serverUrl: string;
  email: string;
}

export type DevinCliField = 'apiKey' | 'serverUrl' | 'email';

const INITIAL_STATE: DevinCliImportState = {
  apiKey: '',
  serverUrl: '',
  email: '',
  showKey: false,
  loading: false,
  success: false,
};

/** Devin CLI session token import: writes `devin-cli.json` and uploads it as an auth file. */
export function useDevinCliImport(options: {
  /** Inline result while the dialog is open; toast only when it was closed mid-upload. */
  isFocused: () => boolean;
  onCredentialAdded: () => void;
}) {
  const { isFocused, onCredentialAdded } = options;
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const [devinCli, setDevinCli] = useState<DevinCliImportState>(INITIAL_STATE);

  const setField = (field: DevinCliField, value: string) =>
    setDevinCli((prev) => ({ ...prev, [field]: value, error: undefined, success: false }));

  const toggleShowKey = () => setDevinCli((prev) => ({ ...prev, showKey: !prev.showKey }));

  const importCredential = async () => {
    if (devinCli.loading) return;
    const apiKey = devinCli.apiKey.trim();
    const serverUrl = devinCli.serverUrl.trim().replace(/\/+$/, '');
    const email = devinCli.email.trim();
    if (!apiKey) {
      setDevinCli((prev) => ({
        ...prev,
        error: t('devin_cli_login.api_key_required'),
        success: false,
      }));
      return;
    }
    if (serverUrl && !serverUrl.startsWith('https://')) {
      setDevinCli((prev) => ({
        ...prev,
        error: t('devin_cli_login.server_url_invalid'),
        success: false,
      }));
      return;
    }

    setDevinCli((prev) => ({ ...prev, loading: true, error: undefined, success: false }));
    try {
      await uploadCredentialJson(
        'devin-cli.json',
        {
          type: 'devin-cli',
          auth_kind: 'api_key',
          api_key: apiKey,
          note: 'Devin CLI quota tracking',
          ...(serverUrl ? { api_server_url: serverUrl } : {}),
          ...(email ? { email } : {}),
        },
        t('notification.upload_failed')
      );
      setDevinCli((prev) => ({
        ...prev,
        apiKey: '',
        loading: false,
        error: undefined,
        success: true,
      }));
      notifyAuthFilesChanged();
      onCredentialAdded();
      if (!isFocused()) showNotification(t('devin_cli_login.success'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err) || t('notification.upload_failed');
      setDevinCli((prev) => ({ ...prev, loading: false, error: message, success: false }));
      if (!isFocused()) showNotification(`${t('devin_cli_login.failed')} ${message}`, 'error');
    }
  };

  /** Back to the form after a successful import; keeps server URL and email. */
  const resetForAnother = () =>
    setDevinCli((prev) => ({ ...prev, error: undefined, success: false }));

  return { devinCli, setField, toggleShowKey, importCredential, resetForAnother };
}
