import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { RuntimePolicyDraft } from '../../runtimePolicy';
import { ErrorRulesEditor } from './ErrorRulesEditor';
import { FormSection } from './FormSection';
import { FormSelect } from './FormControls';

export interface RuntimePolicyEditorProps {
  value: RuntimePolicyDraft;
  onChange: (value: RuntimePolicyDraft) => void;
  disabled: boolean;
  supportsErrors?: boolean;
}

export function RuntimePolicyEditor({
  value,
  onChange,
  disabled,
  supportsErrors = true,
}: RuntimePolicyEditorProps) {
  const { t } = useTranslation();
  const id = useId();
  const key = 'providersPage.runtimePolicy';

  return (
    <FormSection label={t(`${key}.title`)} aria-describedby={`${id}-description`}>
      <FieldGroup className="gap-5">
        <FieldDescription id={`${id}-description`}>{t(`${key}.description`)}</FieldDescription>
        <Field>
          <FieldLabel htmlFor={`${id}-cooling`}>{t(`${key}.cooling`)}</FieldLabel>
          <FormSelect
            id={`${id}-cooling`}
            ariaLabel={t(`${key}.cooling`)}
            value={value.cooling}
            disabled={disabled}
            options={[
              { value: 'inherit', label: t(`${key}.inherit`) },
              { value: 'enabled', label: t(`${key}.coolingEnabled`) },
              { value: 'disabled', label: t(`${key}.coolingDisabled`) },
            ]}
            onChange={(cooling) =>
              onChange({ ...value, cooling: cooling as RuntimePolicyDraft['cooling'] })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-retry`}>{t(`${key}.retry`)}</FieldLabel>
          <Input
            id={`${id}-retry`}
            type="text"
            value={value.retry}
            disabled={disabled}
            placeholder={t(`${key}.inherit`)}
            aria-describedby={`${id}-retry-hint`}
            onChange={(event) => onChange({ ...value, retry: event.target.value })}
          />
          <FieldDescription id={`${id}-retry-hint`}>{t(`${key}.retryHint`)}</FieldDescription>
        </Field>
        {supportsErrors && (
          <>
            <Field>
              <FieldLabel htmlFor={`${id}-errors-mode`}>{t(`${key}.errorsMode`)}</FieldLabel>
              <FormSelect
                id={`${id}-errors-mode`}
                ariaLabel={t(`${key}.errorsMode`)}
                value={value.errorsMode}
                disabled={disabled}
                ariaDescribedBy={`${id}-errors-hint`}
                options={[
                  { value: 'inherit', label: t(`${key}.inherit`) },
                  { value: 'override', label: t(`${key}.override`) },
                ]}
                onChange={(errorsMode) =>
                  onChange({ ...value, errorsMode: errorsMode as RuntimePolicyDraft['errorsMode'] })
                }
              />
              <FieldDescription id={`${id}-errors-hint`}>{t(`${key}.errorsHint`)}</FieldDescription>
            </Field>
            {value.errorsMode === 'override' && (
              <ErrorRulesEditor
                rules={value.errorRules}
                onChange={(errorRules) => onChange({ ...value, errorRules })}
                disabled={disabled}
              />
            )}
          </>
        )}
      </FieldGroup>
    </FormSection>
  );
}
