import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { IconEye, IconEyeOff, IconLoader2 } from '@/components/ui/icons';
import type { ApiKeyImportState } from '../apiKeyImport';
import { DialogTitle, type DialogHeading } from './OAuthFlowDialog';
import dialogStyles from './OAuthFlowDialog.module.scss';
import styles from './ApiKeyImportDialog.module.scss';

/** Optional plain field; label/hint/placeholder come from `<namespace>.<id>_*`. */
export interface ApiKeyImportField {
  id: 'server_url' | 'email';
  type: 'url' | 'email';
  value: string;
  onChange: (value: string) => void;
}

export interface ApiKeyImportDialogProps {
  open: boolean;
  heading: DialogHeading;
  /** i18n namespace holding the dialog copy. */
  namespace: 'opencode_go_login' | 'devin_cli_login';
  /** `name` attribute of the secret input. */
  secretName: string;
  state: ApiKeyImportState;
  fields: ApiKeyImportField[];
  onApiKeyChange: (value: string) => void;
  onToggleShowKey: () => void;
  onSubmit: () => void;
  onViewAuthFiles: () => void;
  onViewQuota: () => void;
  onClose: () => void;
}

/** API-key credential import (OpenCode Go / Devin CLI): secret + optional fields → upload. */
export function ApiKeyImportDialog({
  open,
  heading,
  namespace,
  secretName,
  state,
  fields,
  onApiKeyChange,
  onToggleShowKey,
  onSubmit,
  onViewAuthFiles,
  onViewQuota,
  onClose,
}: ApiKeyImportDialogProps) {
  const { t } = useTranslation();
  const toggleLabel = state.showKey
    ? t('login.hide_key', { defaultValue: 'Hide key' })
    : t('login.show_key', { defaultValue: 'Show key' });

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={500}
      className={dialogStyles.dialog}
      title={<DialogTitle {...heading} />}
    >
      <div className={dialogStyles.view} key={state.success ? 'result' : 'form'}>
        {state.success ? (
          <div className={dialogStyles.result} role="status">
            <svg className={dialogStyles.successMark} viewBox="0 0 52 52" aria-hidden="true">
              <circle className={dialogStyles.successRing} cx="26" cy="26" r="24" />
              <path className={dialogStyles.successCheck} d="M16 27l7 7 14-15" />
            </svg>
            <div className={dialogStyles.resultTitle}>{t(`${namespace}.success`)}</div>
            <div className={dialogStyles.resultActions}>
              <button type="button" className={dialogStyles.secondary} onClick={onViewAuthFiles}>
                {t('auth_login.view_auth_files')}
              </button>
              <button type="button" className={dialogStyles.primary} onClick={onViewQuota}>
                {t(`${namespace}.view_quota`)}
              </button>
            </div>
          </div>
        ) : (
          <div className={dialogStyles.stack}>
            <p className={dialogStyles.hint}>{t(`${namespace}.description`)}</p>

            <div className={styles.fields}>
              <Input
                label={t(`${namespace}.api_key_label`)}
                hint={t(`${namespace}.api_key_hint`)}
                placeholder={t(`${namespace}.api_key_placeholder`)}
                type={state.showKey ? 'text' : 'password'}
                name={secretName}
                autoComplete="off"
                spellCheck={false}
                className={styles.secretInput}
                value={state.apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSubmit();
                }}
                rightElement={
                  <button
                    type="button"
                    className={styles.secretToggle}
                    onClick={onToggleShowKey}
                    aria-label={toggleLabel}
                    title={toggleLabel}
                  >
                    {state.showKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                  </button>
                }
              />
              {fields.map((field) => (
                <Input
                  key={field.id}
                  label={t(`${namespace}.${field.id}_label`)}
                  hint={t(`${namespace}.${field.id}_hint`)}
                  placeholder={t(`${namespace}.${field.id}_placeholder`)}
                  type={field.type}
                  autoComplete={field.type === 'email' ? 'email' : 'off'}
                  spellCheck={false}
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                />
              ))}
            </div>

            {state.error && (
              <div className={dialogStyles.alert} role="alert">
                {state.error}
              </div>
            )}

            <div>
              <button
                type="button"
                className={dialogStyles.primary}
                onClick={onSubmit}
                disabled={state.loading}
              >
                {state.loading && (
                  <IconLoader2 size={14} className={dialogStyles.spinning} aria-hidden="true" />
                )}
                {t(`${namespace}.add_button`)}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
