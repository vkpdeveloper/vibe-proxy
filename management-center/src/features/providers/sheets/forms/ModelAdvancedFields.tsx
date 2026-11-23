import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getProviderModelCapabilities } from '../../descriptors';
import { THINKING_LEVELS } from '../../thinkingLevels';
import type { ModelEntryInput, ProviderBrand } from '../../types';
import { FormSelect, SwitchField } from './FormControls';

interface ModelAdvancedFieldsProps {
  entry: ModelEntryInput;
  providerBrand: ProviderBrand;
  disabled: boolean;
  supportsThinking: boolean;
  onUpdate: (patch: Partial<ModelEntryInput>) => void;
}

export function ModelAdvancedFields({
  entry,
  providerBrand,
  disabled,
  supportsThinking,
  onUpdate,
}: ModelAdvancedFieldsProps) {
  const { t } = useTranslation();
  const id = useId();
  const capabilities = getProviderModelCapabilities(providerBrand);
  const enabled = entry.thinkingEnabled ?? Boolean(entry.thinkingJson?.trim());
  const levels = entry.thinkingLevels ?? [];
  const textField = (
    key:
      | 'displayName'
      | 'maxContextLength'
      | 'inputModalitiesText'
      | 'outputModalitiesText'
      | 'thinkingMin'
      | 'thinkingMax',
    numeric = false,
    budget = false
  ) => (
    <Field>
      <FieldLabel htmlFor={`${id}-${key}`}>{t(`providersPage.modelOptions.${key}`)}</FieldLabel>
      <Input
        id={`${id}-${key}`}
        className={numeric ? 'font-mono placeholder:font-sans' : undefined}
        value={entry[key] ?? ''}
        inputMode={numeric ? 'numeric' : undefined}
        disabled={disabled || (budget && !enabled)}
        onChange={(event) =>
          onUpdate({
            [key]: event.target.value,
            ...(key === 'inputModalitiesText' ? { inputModalitiesTouched: true } : {}),
            ...(key === 'outputModalitiesText' ? { outputModalitiesTouched: true } : {}),
            ...(budget ? { thinkingBudgetTouched: true } : {}),
          })
        }
      />
      {key === 'maxContextLength' ? (
        <FieldDescription className="text-xs">
          {t('providersPage.modelOptions.contextHint')}
        </FieldDescription>
      ) : null}
    </Field>
  );
  const toggle = (
    key:
      | 'forceMapping'
      | 'isCompat'
      | 'supportConfigurationUpdate'
      | 'useMaxCompletionTokens'
      | 'thinkingZeroAllowed'
      | 'thinkingDynamicAllowed',
    budget = false
  ) => (
    <SwitchField
      id={`${id}-${key}`}
      label={t(`providersPage.modelOptions.${key}`)}
      checked={entry[key] === true}
      disabled={disabled || (budget && !enabled)}
      onCheckedChange={(checked) =>
        onUpdate({
          [key]: checked,
          ...(budget ? { thinkingBudgetTouched: true } : {}),
        })
      }
    />
  );
  return (
    <>
      {textField('displayName')}
      {capabilities.maxContextLength ? textField('maxContextLength', true) : null}
      {toggle('forceMapping')}
      {capabilities.isCompat ? toggle('isCompat') : null}
      {capabilities.configurationUpdate ? toggle('supportConfigurationUpdate') : null}
      {capabilities.modalities ? (
        <>
          {textField('inputModalitiesText')}
          {textField('outputModalitiesText')}
          <p className="-mt-2 text-xs text-muted-foreground">
            {t('providersPage.modelOptions.modalitiesHint')}
          </p>
          {toggle('useMaxCompletionTokens')}
        </>
      ) : null}
      {supportsThinking ? (
        <FieldSet className="gap-4 rounded-lg border p-3">
          <FieldLegend variant="label" className="float-left mb-0">
            {t('providersPage.form.thinkingConfig')}
          </FieldLegend>
          <Field>
            <FieldLabel htmlFor={`${id}-thinking-mode`}>
              {t('providersPage.modelOptions.thinkingMode')}
            </FieldLabel>
            <FormSelect
              id={`${id}-thinking-mode`}
              ariaLabel={t('providersPage.modelOptions.thinkingMode')}
              value={enabled ? 'custom' : 'default'}
              disabled={disabled}
              options={[
                { value: 'default', label: t('providersPage.modelOptions.useDefault') },
                { value: 'custom', label: t('providersPage.modelOptions.custom') },
              ]}
              onChange={(mode) => onUpdate({ thinkingEnabled: mode === 'custom' })}
            />
            <FieldDescription className="text-xs">
              {t('providersPage.modelOptions.thinkingHint')}
            </FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {textField('thinkingMin', true, true)}
            {textField('thinkingMax', true, true)}
          </div>
          {toggle('thinkingZeroAllowed', true)}
          {toggle('thinkingDynamicAllowed', true)}
          <div className="grid grid-cols-2 gap-2">
            {THINKING_LEVELS.map((level) => {
              const checked = levels.includes(level);
              const levelId = `${id}-level-${level}`;
              return (
                <label
                  key={level}
                  htmlFor={levelId}
                  className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors hover:bg-muted/50 has-data-checked:border-primary/30 has-data-checked:bg-primary/10 has-disabled:cursor-not-allowed has-disabled:opacity-50"
                >
                  <Checkbox
                    id={levelId}
                    checked={checked}
                    disabled={disabled || !enabled}
                    onCheckedChange={() =>
                      onUpdate({
                        thinkingEnabled: true,
                        thinkingLevelsTouched: true,
                        thinkingLevels: checked
                          ? levels.filter((item) => item !== level)
                          : THINKING_LEVELS.filter(
                              (item) => item === level || levels.includes(item)
                            ),
                      })
                    }
                  />
                  <span className="min-w-0 truncate">
                    {t(`providersPage.form.thinkingLevels.${level}`)}
                  </span>
                  <code className="ml-auto hidden font-mono text-xs text-muted-foreground sm:inline">
                    {level}
                  </code>
                </label>
              );
            })}
          </div>
          {entry.thinkingJson?.trim() ? (
            <p className="text-xs text-muted-foreground">
              {t('providersPage.form.thinkingExistingHint')}
            </p>
          ) : null}
        </FieldSet>
      ) : null}
    </>
  );
}
