import { useCallback, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Private } from '@/components/ui/private';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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

export type AuthFileDetailsSheetProps = {
  disableControls: boolean;
  editor: PrefixProxyEditorState | null;
  dirty: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: (field: PrefixProxyEditorField, value: PrefixProxyEditorFieldValue) => void;
};

type ToggleField = 'disableCooling' | 'websockets' | 'useSiwc' | 'usingApi';

/**
 * Credential details and settings. Closing with unsaved changes (Escape, overlay, close button,
 * cancel) asks first.
 */
export function AuthFileDetailsSheet(props: AuthFileDetailsSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { disableControls, editor, dirty, onClose, onSave, onChange } = props;
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const saving = editor?.saving === true;

  const confirmClose = useCallback((): Promise<boolean> => {
    if (!dirty || saving) return Promise.resolve(true);
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
  }, [dirty, saving, showConfirmation, t]);

  const requestClose = useCallback(() => {
    if (saving) return;
    void confirmClose().then((ok) => {
      if (ok) onClose();
    });
  }, [confirmClose, onClose, saving]);

  const handleSettingsLinkClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (saving) return;
      void confirmClose().then((ok) => {
        if (ok) void navigate('/config?field=routingStrategy');
      });
    },
    [confirmClose, navigate, saving]
  );

  const fieldDisabled = disableControls || saving || !editor?.json;

  const toggle = (field: ToggleField, label: string, hint: string): ReactNode =>
    editor && (
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={`auth-file-${field}`}>{label}</FieldLabel>
          <FieldDescription>{hint}</FieldDescription>
        </FieldContent>
        <Switch
          id={`auth-file-${field}`}
          checked={editor[field]}
          onCheckedChange={(value) => onChange(field, value)}
          disabled={fieldDisabled}
        />
      </Field>
    );

  return (
    <Sheet open={Boolean(editor)} onOpenChange={(open) => !open && requestClose()}>
      <SheetContent
        side="right"
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader className="border-b pr-12">
          <SheetDescription>{t('auth_files.prefix_proxy_button')}</SheetDescription>
          <SheetTitle className="truncate">
            {editor?.fileName ? (
              <Private>{editor.fileName}</Private>
            ) : (
              t('auth_files.prefix_proxy_button')
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {editor &&
            (editor.loading ? (
              <p className="text-muted-foreground">{t('auth_files.prefix_proxy_loading')}</p>
            ) : (
              <FieldGroup className="gap-5">
                {editor.error && (
                  <p role="alert" className="text-destructive">
                    {editor.error}
                  </p>
                )}
                {!editor.json ? (
                  <p role="alert" className="text-destructive">
                    {t('auth_files.prefix_proxy_invalid_content_label')}
                  </p>
                ) : (
                  <>
                    <Field>
                      <FieldLabel htmlFor="auth-file-prefix">
                        {t('auth_files.prefix_label')}
                      </FieldLabel>
                      <Input
                        id="auth-file-prefix"
                        value={editor.prefix}
                        disabled={fieldDisabled}
                        onChange={(e) => onChange('prefix', e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="auth-file-proxy">
                        {t('auth_files.proxy_url_label')}
                      </FieldLabel>
                      <Input
                        id="auth-file-proxy"
                        value={editor.proxyUrl}
                        placeholder={t('auth_files.proxy_url_placeholder')}
                        disabled={fieldDisabled}
                        onChange={(e) => onChange('proxyUrl', e.target.value)}
                      />
                    </Field>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="auth-file-priority">
                          {t('auth_files.priority_label')}
                        </FieldLabel>
                        <Input
                          id="auth-file-priority"
                          value={editor.priority}
                          placeholder={t('auth_files.priority_placeholder')}
                          disabled={fieldDisabled}
                          onChange={(e) => onChange('priority', e.target.value)}
                        />
                        <FieldDescription>{t('auth_files.priority_hint')}</FieldDescription>
                      </Field>
                      <Field data-invalid={Boolean(editor.weightError) || undefined}>
                        <FieldLabel htmlFor="auth-file-weight">
                          {t('auth_files.weight_label')}
                        </FieldLabel>
                        <Input
                          id="auth-file-weight"
                          type="number"
                          step="1"
                          max={MAX_CREDENTIAL_WEIGHT}
                          value={editor.weight}
                          placeholder="1"
                          aria-invalid={Boolean(editor.weightError)}
                          disabled={fieldDisabled}
                          onChange={(e) => onChange('weight', e.target.value)}
                        />
                        {editor.weightError ? (
                          <FieldError>{editor.weightError}</FieldError>
                        ) : (
                          <FieldDescription>
                            <Trans
                              i18nKey="auth_files.weight_hint"
                              components={{
                                settingsLink: (
                                  <Link
                                    to="/config?field=routingStrategy"
                                    onClick={handleSettingsLinkClick}
                                  />
                                ),
                              }}
                            />
                          </FieldDescription>
                        )}
                      </Field>
                    </div>

                    <FieldSeparator />
                    {toggle(
                      'disableCooling',
                      t('auth_files.disable_cooling_label'),
                      t('auth_files.disable_cooling_hint')
                    )}
                    {supportsAuthFileWebsockets(editor.providerKey) &&
                      toggle(
                        'websockets',
                        t('auth_files.websockets_label'),
                        t('auth_files.websockets_hint')
                      )}
                    {supportsAuthFileSiwc(editor.providerKey) &&
                      toggle(
                        'useSiwc',
                        t('auth_files.use_siwc_label'),
                        t('auth_files.use_siwc_hint')
                      )}
                    {supportsAuthFileUsingApi(editor.providerKey) &&
                      toggle(
                        'usingApi',
                        t('auth_files.using_api_label'),
                        t('auth_files.using_api_hint')
                      )}
                    <FieldSeparator />

                    <AuthFileExcludedModelsField
                      fileName={editor.fileName}
                      value={editor.excludedModelsText}
                      disabled={fieldDisabled}
                      onChange={(value) => onChange('excludedModelsText', value)}
                    />
                    <Field data-invalid={Boolean(editor.headersError) || undefined}>
                      <FieldLabel htmlFor="auth-file-headers">
                        {t('auth_files.headers_label')}
                      </FieldLabel>
                      <Textarea
                        id="auth-file-headers"
                        className="min-h-24 font-mono text-xs"
                        value={editor.headersText}
                        placeholder={t('auth_files.headers_placeholder')}
                        rows={4}
                        aria-invalid={Boolean(editor.headersError)}
                        disabled={fieldDisabled}
                        onChange={(e) => onChange('headersText', e.target.value)}
                      />
                      {editor.headersError && <FieldError>{editor.headersError}</FieldError>}
                      <FieldDescription>{t('auth_files.headers_hint')}</FieldDescription>
                    </Field>
                    <AuthFilePolicyFields
                      draft={editor.policy ?? readCredentialPolicy(editor.json)}
                      disabled={disableControls || saving}
                      onChange={onChange}
                    />
                    <Field>
                      <FieldLabel htmlFor="auth-file-note">{t('auth_files.note_label')}</FieldLabel>
                      <Input
                        id="auth-file-note"
                        value={editor.note}
                        placeholder={t('auth_files.note_placeholder')}
                        disabled={fieldDisabled}
                        onChange={(e) => onChange('note', e.target.value)}
                      />
                      <FieldDescription>{t('auth_files.note_hint')}</FieldDescription>
                    </Field>
                  </>
                )}
              </FieldGroup>
            ))}
        </div>

        <SheetFooter className="flex-row justify-end border-t">
          <Button variant="outline" onClick={requestClose} disabled={saving}>
            {dirty ? t('common.cancel') : t('common.close')}
          </Button>
          <Button
            onClick={onSave}
            disabled={
              disableControls ||
              saving ||
              !dirty ||
              !editor?.json ||
              Boolean(editor?.headersTouched && editor.headersError) ||
              Boolean(editor?.weightError) ||
              Boolean(credentialPolicyError(editor?.policy))
            }
          >
            {t('common.save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
