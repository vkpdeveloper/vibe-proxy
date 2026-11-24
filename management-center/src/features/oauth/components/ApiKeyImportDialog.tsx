import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import type { ApiKeyImportState } from '../apiKeyImport';
import { FlowAlert, FlowDialog, FlowView, ResultView, type DialogHeading } from './FlowDialogParts';

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

/** API key credential import (OpenCode Go / Devin CLI): secret + optional fields, then upload. */
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
  const idPrefix = useId();
  const keyId = `${idPrefix}-key`;
  const formId = `${idPrefix}-form`;
  const toggleLabel = state.showKey
    ? t('login.hide_key', { defaultValue: 'Hide key' })
    : t('login.show_key', { defaultValue: 'Show key' });

  return (
    <FlowDialog
      open={open}
      heading={heading}
      onClose={onClose}
      footer={
        !state.success && (
          <DialogFooter>
            <Button variant="outline" size="lg" className="h-9 px-4" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            {/* Outside the form, so it submits through the form attribute. */}
            <Button
              type="submit"
              form={formId}
              size="lg"
              className="h-9 px-4"
              disabled={state.loading || !state.apiKey.trim()}
            >
              {t(`${namespace}.add_button`)}
            </Button>
          </DialogFooter>
        )
      }
    >
      <FlowView key={state.success ? 'result' : 'form'}>
        {state.success ? (
          <ResultView
            title={t(`${namespace}.success`)}
            actions={
              <>
                <Button variant="outline" size="lg" className="h-9 px-4" onClick={onViewAuthFiles}>
                  {t('auth_login.view_auth_files')}
                </Button>
                <Button size="lg" className="h-9 px-4" onClick={onViewQuota}>
                  {t(`${namespace}.view_quota`)}
                </Button>
              </>
            }
          />
        ) : (
          <form
            id={formId}
            className="flex flex-col gap-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <p className="text-sm text-muted-foreground">{t(`${namespace}.description`)}</p>

            <FieldGroup>
              <Field data-invalid={Boolean(state.error) || undefined}>
                <FieldLabel htmlFor={keyId}>{t(`${namespace}.api_key_label`)}</FieldLabel>
                <InputGroup className="h-9">
                  <InputGroupInput
                    id={keyId}
                    type={state.showKey ? 'text' : 'password'}
                    name={secretName}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t(`${namespace}.api_key_placeholder`)}
                    value={state.apiKey}
                    onChange={(event) => onApiKeyChange(event.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    {/* 32px inside the 36px field on desktop, 40px on phones; there it overlaps the
                        field's 1px border, which is invisible. */}
                    <InputGroupButton
                      size="icon-sm"
                      className="max-sm:-mr-1.5 max-sm:size-10"
                      onClick={onToggleShowKey}
                      aria-label={toggleLabel}
                      title={toggleLabel}
                    >
                      <HugeiconsIcon
                        icon={state.showKey ? ViewOffSlashIcon : ViewIcon}
                        strokeWidth={1.75}
                      />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription>{t(`${namespace}.api_key_hint`)}</FieldDescription>
              </Field>
              {fields.map((field) => (
                <Field key={field.id}>
                  <FieldLabel htmlFor={`${idPrefix}-${field.id}`}>
                    {t(`${namespace}.${field.id}_label`)}
                  </FieldLabel>
                  <Input
                    id={`${idPrefix}-${field.id}`}
                    className="h-9"
                    type={field.type}
                    autoComplete={field.type === 'email' ? 'email' : 'off'}
                    spellCheck={false}
                    placeholder={t(`${namespace}.${field.id}_placeholder`)}
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                  <FieldDescription>{t(`${namespace}.${field.id}_hint`)}</FieldDescription>
                </Field>
              ))}
            </FieldGroup>

            {state.error && <FlowAlert>{state.error}</FlowAlert>}
          </form>
        )}
      </FlowView>
    </FlowDialog>
  );
}
