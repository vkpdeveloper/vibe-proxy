import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import type { ProviderBehaviorOptions } from '@/types/provider';
import { getProviderBehaviorCapabilities } from '../../descriptors';
import type { ProviderBrand } from '../../types';
import { FormSection } from './FormSection';
import { FormSelect, SwitchField } from './FormControls';

interface ProviderBehaviorEditorProps {
  brand: ProviderBrand;
  value: ProviderBehaviorOptions;
  onChange: (patch: Partial<ProviderBehaviorOptions>) => void;
  disabled: boolean;
}

export function ProviderBehaviorEditor({
  brand,
  value,
  onChange,
  disabled,
}: ProviderBehaviorEditorProps) {
  const { t } = useTranslation();
  const id = useId();
  const capabilities = getProviderBehaviorCapabilities(brand);
  if (!Object.values(capabilities).some(Boolean)) return null;
  const toggle = (key: 'alphaSearch' | 'rebuildMidSystemMessage' | 'supportPromptCacheKey') => (
    <SwitchField
      id={`${id}-${key}`}
      label={t(`providersPage.behavior.${key}`)}
      description={t(`providersPage.behavior.${key}Hint`)}
      checked={value[key] === true}
      disabled={disabled}
      onCheckedChange={(checked) => onChange({ [key]: checked })}
    />
  );
  return (
    <FormSection label={t('providersPage.behavior.title')}>
      <FieldGroup className="gap-5">
        {capabilities.alphaSearch ? toggle('alphaSearch') : null}
        {capabilities.disableCodexCloaking ? (
          <Field>
            <FieldLabel htmlFor={`${id}-cloak`}>
              {t('providersPage.behavior.codexCloaking')}
            </FieldLabel>
            <FormSelect
              id={`${id}-cloak`}
              ariaLabel={t('providersPage.behavior.codexCloaking')}
              value={
                value.disableCodexCloaking === undefined
                  ? 'default'
                  : value.disableCodexCloaking
                    ? 'disabled'
                    : 'enabled'
              }
              disabled={disabled}
              ariaDescribedBy={`${id}-cloak-hint`}
              options={[
                { value: 'default', label: t('providersPage.behavior.useDefault') },
                { value: 'enabled', label: t('providersPage.behavior.cloakingEnabled') },
                { value: 'disabled', label: t('providersPage.behavior.cloakingDisabled') },
              ]}
              onChange={(mode) =>
                onChange({
                  disableCodexCloaking: mode === 'default' ? undefined : mode === 'disabled',
                })
              }
            />
            <FieldDescription id={`${id}-cloak-hint`}>
              {t('providersPage.behavior.codexCloakingHint')}
            </FieldDescription>
          </Field>
        ) : null}
        {capabilities.rebuildMidSystemMessage ? toggle('rebuildMidSystemMessage') : null}
        {capabilities.supportPromptCacheKey ? toggle('supportPromptCacheKey') : null}
      </FieldGroup>
    </FormSection>
  );
}
