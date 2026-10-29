import { useCallback, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { EmailPrivacyText } from '@/components/common/EmailPrivacyText';
import { useNotificationStore } from '@/stores';
import type {
  PrefixProxyEditorField,
  PrefixProxyEditorFieldValue,
  PrefixProxyEditorState,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import {
  supportsAuthFileSiwc,
  supportsAuthFileUsingApi,
  supportsAuthFileWebsockets,
} from '@/features/authFiles/constants';
import { MAX_CREDENTIAL_WEIGHT } from '@/utils/credentialWeight';
import { AuthFileExcludedModelsField } from './AuthFileExcludedModelsField';
import { AuthFilePolicyFields } from './AuthFilePolicyFields';
import { credentialPolicyError, readCredentialPolicy } from '../credentialPolicy';
import styles from './AuthFileDetailsSheet.module.scss';

export type AuthFileDetailsSheetProps = {
  disableControls: boolean;
  editor: PrefixProxyEditorState | null;
  dirty: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: (field: PrefixProxyEditorField, value: PrefixProxyEditorFieldValue) => void;
};

/**
 * 凭证详情/编辑抽屉：替代旧的居中 Modal，与提供商工作台的 Sheet 模式一致。
 * 脏状态下关闭（Escape/遮罩/×/取消）先走确认对话框。
 */
export function AuthFileDetailsSheet(props: AuthFileDetailsSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { disableControls, editor, dirty, onClose, onSave, onChange } = props;
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);

  const confirmClose = useCallback((): boolean | Promise<boolean> => {
    if (!dirty || editor?.saving === true) return true;
    return new Promise<boolean>((resolve) => {
      showConfirmation({
        title: t('providersPage.unsavedChanges.title'),
        message: t('providersPage.unsavedChanges.message'),
        variant: 'danger',
        confirmText: t('providersPage.unsavedChanges.discard'),
        cancelText: t('providersPage.unsavedChanges.keepEditing'),
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }, [dirty, editor?.saving, showConfirmation, t]);

  const handleCancelClick = useCallback(() => {
    void Promise.resolve(confirmClose()).then((ok) => {
      if (ok) onClose();
    });
  }, [confirmClose, onClose]);

  const handleSettingsLinkClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (editor?.saving) return;

      void Promise.resolve(confirmClose()).then((ok) => {
        if (ok) void navigate('/config?field=routingStrategy');
      });
    },
    [confirmClose, editor?.saving, navigate]
  );

  return (
    <Sheet
      open={Boolean(editor)}
      onClose={onClose}
      confirmClose={confirmClose}
      size="md"
      closeDisabled={editor?.saving === true}
      eyebrow={t('auth_files.prefix_proxy_button')}
      title={
        <EmailPrivacyText text={editor?.fileName ?? ''} fallback={t('auth_files.prefix_proxy_button')} />
      }
      footer={
        <>
          <Button
            variant="secondary"
            onClick={handleCancelClick}
            disabled={editor?.saving === true}
          >
            {dirty ? t('common.cancel') : t('common.close')}
          </Button>
          <Button
            onClick={onSave}
            loading={editor?.saving === true}
            disabled={
              disableControls ||
              editor?.saving === true ||
              !dirty ||
              !editor?.json ||
              Boolean(editor?.headersTouched && editor.headersError) ||
              Boolean(editor?.weightError) ||
              Boolean(credentialPolicyError(editor?.policy))
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {editor && (
        <div className={styles.editor}>
          {editor.loading ? (
            <div className={styles.loading}>
              <LoadingSpinner size={14} />
              <span>{t('auth_files.prefix_proxy_loading')}</span>
            </div>
          ) : (
            <>
              {editor.error && <div className={styles.error}>{editor.error}</div>}
              {!editor.json && (
                <div className={styles.error}>
                  {t('auth_files.prefix_proxy_invalid_content_label')}
                </div>
              )}
              {editor.json && (
                <div className={styles.fields}>
                  <Input
                    label={t('auth_files.prefix_label')}
                    value={editor.prefix}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('prefix', e.target.value)}
                  />
                  <Input
                    label={t('auth_files.proxy_url_label')}
                    value={editor.proxyUrl}
                    placeholder={t('auth_files.proxy_url_placeholder')}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('proxyUrl', e.target.value)}
                  />
                  <Input
                    label={t('auth_files.priority_label')}
                    value={editor.priority}
                    placeholder={t('auth_files.priority_placeholder')}
                    hint={t('auth_files.priority_hint')}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('priority', e.target.value)}
                  />
                  <Input
                    label={t('auth_files.weight_label')}
                    type="number"
                    step="1"
                    max={MAX_CREDENTIAL_WEIGHT}
                    value={editor.weight}
                    placeholder="1"
                    hint={
                      <Trans
                        i18nKey="auth_files.weight_hint"
                        components={{
                          settingsLink: (
                            <Link
                              className={styles.settingsLink}
                              to="/config?field=routingStrategy"
                              onClick={handleSettingsLinkClick}
                            />
                          ),
                        }}
                      />
                    }
                    error={editor.weightError ?? undefined}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('weight', e.target.value)}
                  />
                  <div className="form-group">
                    <label>{t('auth_files.disable_cooling_label')}</label>
                    <ToggleSwitch
                      checked={editor.disableCooling}
                      onChange={(value) => onChange('disableCooling', value)}
                      disabled={disableControls || editor.saving || !editor.json}
                      ariaLabel={t('auth_files.disable_cooling_label')}
                    />
                    <div className="hint">{t('auth_files.disable_cooling_hint')}</div>
                  </div>
                  {supportsAuthFileWebsockets(editor.providerKey) && (
                    <div className="form-group">
                      <label>{t('auth_files.websockets_label')}</label>
                      <ToggleSwitch
                        checked={editor.websockets}
                        onChange={(value) => onChange('websockets', value)}
                        disabled={disableControls || editor.saving || !editor.json}
                        ariaLabel={t('auth_files.websockets_label')}
                      />
                      <div className="hint">{t('auth_files.websockets_hint')}</div>
                    </div>
                  )}
                  {supportsAuthFileSiwc(editor.providerKey) && (
                    <div className="form-group">
                      <label>{t('auth_files.use_siwc_label')}</label>
                      <ToggleSwitch
                        checked={editor.useSiwc}
                        onChange={(value) => onChange('useSiwc', value)}
                        disabled={disableControls || editor.saving || !editor.json}
                        ariaLabel={t('auth_files.use_siwc_label')}
                      />
                      <div className="hint">{t('auth_files.use_siwc_hint')}</div>
                    </div>
                  )}
                  {supportsAuthFileUsingApi(editor.providerKey) && (
                    <div className="form-group">
                      <label>{t('auth_files.using_api_label')}</label>
                      <ToggleSwitch
                        checked={editor.usingApi}
                        onChange={(value) => onChange('usingApi', value)}
                        disabled={disableControls || editor.saving || !editor.json}
                        ariaLabel={t('auth_files.using_api_label')}
                      />
                      <div className="hint">{t('auth_files.using_api_hint')}</div>
                    </div>
                  )}
                  <AuthFileExcludedModelsField
                    fileName={editor.fileName}
                    value={editor.excludedModelsText}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(value) => onChange('excludedModelsText', value)}
                  />
                  <div className="form-group">
                    <label>{t('auth_files.headers_label')}</label>
                    <textarea
                      className={`input ${editor.headersError ? styles.textareaInvalid : ''}`}
                      value={editor.headersText}
                      placeholder={t('auth_files.headers_placeholder')}
                      rows={4}
                      aria-invalid={Boolean(editor.headersError)}
                      disabled={disableControls || editor.saving || !editor.json}
                      onChange={(e) => onChange('headersText', e.target.value)}
                    />
                    {editor.headersError && <div className="error-box">{editor.headersError}</div>}
                    <div className="hint">{t('auth_files.headers_hint')}</div>
                  </div>
                  <AuthFilePolicyFields
                    draft={editor.policy ?? readCredentialPolicy(editor.json)}
                    disabled={disableControls || editor.saving}
                    onChange={onChange}
                  />
                  <Input
                    label={t('auth_files.note_label')}
                    value={editor.note}
                    placeholder={t('auth_files.note_placeholder')}
                    hint={t('auth_files.note_hint')}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('note', e.target.value)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
