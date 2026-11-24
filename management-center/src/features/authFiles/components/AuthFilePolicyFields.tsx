import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorRulesEditor } from '@/features/providers/sheets/forms/ErrorRulesEditor';
import { ModelEntriesEditor } from '@/features/providers/sheets/forms/ModelEntriesEditor';
import {
  credentialPolicyError,
  type CredentialPolicyDraft,
  type CredentialPolicyError,
  type CredentialPolicyField,
  type CredentialPolicyValues,
  type PolicyMode,
} from '../credentialPolicy';

const POLICY_MODES: PolicyMode[] = ['inherit', 'custom'];

const FIELD_ERRORS: Record<CredentialPolicyField, CredentialPolicyError> = {
  requestRetry: 'auth_files.policy_retry_invalid',
  modelAliases: 'auth_files.policy_aliases_invalid',
  errorRules: 'auth_files.policy_rules_invalid',
};

/** Policy overrides for one credential. `fields` picks which ones, so the sheet can group them. */
export function AuthFilePolicyFields({
  draft,
  fields,
  disabled,
  onChange,
}: {
  draft: CredentialPolicyDraft;
  fields: CredentialPolicyField[];
  disabled: boolean;
  onChange: <K extends CredentialPolicyField>(field: K, value: CredentialPolicyValues[K]) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const draftError = credentialPolicyError(draft);
  // Each group only reports the errors of the fields it shows.
  const error = fields.some((field) => FIELD_ERRORS[field] === draftError) ? draftError : null;
  // Desktop stacks label and select like the sheet's other fields; phones keep them on one row.
  const modeSelect = (field: CredentialPolicyField, label: string) => (
    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-stretch">
      <FieldLabel id={`${id}-${field}`}>{t(label)}</FieldLabel>
      <Select
        value={draft[field].mode}
        disabled={disabled}
        onValueChange={(mode) => {
          if (mode === 'inherit' || mode === 'custom') onChange(field, { ...draft[field], mode });
        }}
      >
        <SelectTrigger
          aria-labelledby={`${id}-${field}`}
          className="w-32 sm:w-full sm:data-[size=default]:h-9"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {POLICY_MODES.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {t(`auth_files.policy_${mode}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <>
      {fields.includes('requestRetry') && (
        <Field data-invalid={error === 'auth_files.policy_retry_invalid' || undefined}>
          {modeSelect('requestRetry', 'auth_files.policy_retry_label')}
          <FieldDescription>{t('auth_files.policy_retry_hint')}</FieldDescription>
          {draft.requestRetry.mode === 'custom' && (
            <>
              <Input
                aria-label={t('auth_files.policy_retry_count')}
                className="sm:h-9"
                placeholder={t('auth_files.policy_retry_count')}
                type="number"
                min={0}
                step={1}
                value={draft.requestRetry.value}
                disabled={disabled}
                aria-invalid={error === 'auth_files.policy_retry_invalid'}
                onChange={(event) =>
                  onChange('requestRetry', { ...draft.requestRetry, value: event.target.value })
                }
              />
              {error === 'auth_files.policy_retry_invalid' && <FieldError>{t(error)}</FieldError>}
            </>
          )}
        </Field>
      )}
      {(['modelAliases', 'errorRules'] as const)
        .filter((field) => fields.includes(field))
        .map((field) => {
          const key = field === 'modelAliases' ? 'aliases' : 'rules';
          const policy = draft[field];
          return (
            <Field key={field}>
              {modeSelect(field, `auth_files.policy_${key}_label`)}
              <FieldDescription>{t(`auth_files.policy_${key}_hint`)}</FieldDescription>
              {policy.mode === 'custom' &&
                (policy.rows === null ? (
                  <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-3">
                    <p className="text-sm text-muted-foreground">
                      {t('auth_files.policy_unsupported')}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => onChange(field, { mode: 'custom', rows: [] })}
                    >
                      {t('auth_files.policy_replace')}
                    </Button>
                  </div>
                ) : field === 'modelAliases' ? (
                  <ModelEntriesEditor
                    oauthAliasOnly
                    models={draft.modelAliases.rows ?? []}
                    supportsImage={false}
                    supportsThinking={false}
                    mutating={disabled}
                    removeDisabled={false}
                    onUpdate={(index, patch) =>
                      onChange('modelAliases', {
                        mode: 'custom',
                        rows: (draft.modelAliases.rows ?? []).map((row, i) =>
                          i === index ? { ...row, ...patch } : row
                        ),
                      })
                    }
                    onAdd={() =>
                      onChange('modelAliases', {
                        mode: 'custom',
                        rows: [...(draft.modelAliases.rows ?? []), { name: '', alias: '' }],
                      })
                    }
                    onRemove={(index) =>
                      onChange('modelAliases', {
                        mode: 'custom',
                        rows: (draft.modelAliases.rows ?? []).filter((_, i) => i !== index),
                      })
                    }
                  />
                ) : (
                  <ErrorRulesEditor
                    rules={draft.errorRules.rows ?? []}
                    disabled={disabled}
                    onChange={(rows) => onChange('errorRules', { mode: 'custom', rows })}
                  />
                ))}
            </Field>
          );
        })}
      {error && error !== 'auth_files.policy_retry_invalid' && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
    </>
  );
}
