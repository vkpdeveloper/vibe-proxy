import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type {
  PluginStoreAuthApplyTo,
  PluginStoreAuthRule,
  PluginStoreAuthType,
} from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import { OptionSelect } from '../fields/OptionSelect';
import { ExpandableInput } from './ExpandableInput';
import { AddButton, RuleCard } from './parts';

const fieldClass = 'flex min-w-0 flex-col gap-1.5';
const fieldLabelClass = 'text-xs font-medium text-muted-foreground';
const checkboxLabelClass = 'inline-flex items-center gap-2 text-[13px]';

const PLUGIN_STORE_AUTH_TYPE_OPTIONS: Array<{ value: PluginStoreAuthType; labelKey: string }> = [
  { value: 'bearer', labelKey: 'config_management.visual.sections.system.store_auth_type_bearer' },
  {
    value: 'github-token',
    labelKey: 'config_management.visual.sections.system.store_auth_type_github_token',
  },
  { value: 'basic', labelKey: 'config_management.visual.sections.system.store_auth_type_basic' },
  { value: 'header', labelKey: 'config_management.visual.sections.system.store_auth_type_header' },
  { value: 'none', labelKey: 'config_management.visual.sections.system.store_auth_type_none' },
];

const PLUGIN_STORE_AUTH_APPLY_TO_OPTIONS: Array<{
  value: PluginStoreAuthApplyTo;
  labelKey: string;
}> = [
  {
    value: 'registry',
    labelKey: 'config_management.visual.sections.system.store_auth_apply_registry',
  },
  {
    value: 'metadata',
    labelKey: 'config_management.visual.sections.system.store_auth_apply_metadata',
  },
  {
    value: 'artifact',
    labelKey: 'config_management.visual.sections.system.store_auth_apply_artifact',
  },
];

const createPluginStoreAuthRule = (): PluginStoreAuthRule => ({
  id: makeClientId(),
  match: '',
  applyTo: [],
  type: 'bearer',
  tokenEnv: '',
  usernameEnv: '',
  passwordEnv: '',
  headerName: '',
  headerValueEnv: '',
  allowInsecure: false,
});

export const PluginStoreAuthEditor = memo(function PluginStoreAuthEditor({
  value,
  disabled,
  onChange,
}: {
  value: PluginStoreAuthRule[];
  disabled?: boolean;
  onChange: (next: PluginStoreAuthRule[]) => void;
}) {
  const { t } = useTranslation();

  const updateRule = (id: string, patch: Partial<PluginStoreAuthRule>) => {
    onChange(value.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };
  const addRule = () => onChange([...value, createPluginStoreAuthRule()]);
  const removeRule = (id: string) => onChange(value.filter((rule) => rule.id !== id));
  const toggleApplyTo = (rule: PluginStoreAuthRule, kind: PluginStoreAuthApplyTo) => {
    const nextApplyTo = rule.applyTo.includes(kind)
      ? rule.applyTo.filter((item) => item !== kind)
      : [...rule.applyTo, kind];
    updateRule(rule.id, { applyTo: nextApplyTo });
  };

  const envInput = (value: string, onValue: (next: string) => void, placeholder?: string) => (
    <Input
      className="h-9 font-mono text-[13px] md:text-[13px]"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      onChange={(event) => onValue(event.target.value)}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {t('config_management.visual.sections.system.store_auth_empty')}
        </p>
      ) : null}
      {value.map((rule) => {
        const usesToken = rule.type === 'bearer' || rule.type === 'github-token';
        const usesBasic = rule.type === 'basic';
        const usesHeader = rule.type === 'header';
        return (
          <RuleCard
            key={rule.id}
            title={rule.match || t('config_management.visual.sections.system.store_auth_rule')}
            removeLabel={t('config_management.visual.common.delete')}
            onRemove={() => removeRule(rule.id)}
            disabled={disabled}
          >
            <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
              <label className={fieldClass}>
                <span className={fieldLabelClass}>
                  {t('config_management.visual.sections.system.store_auth_match')}
                </span>
                <ExpandableInput
                  value={rule.match}
                  placeholder="https://api.github.com/repos/owner/repo/releases/"
                  disabled={disabled}
                  onChange={(match) => updateRule(rule.id, { match })}
                />
              </label>
              <label className={fieldClass}>
                <span className={fieldLabelClass}>
                  {t('config_management.visual.sections.system.store_auth_type')}
                </span>
                <OptionSelect
                  value={rule.type}
                  options={PLUGIN_STORE_AUTH_TYPE_OPTIONS.map((option) => ({
                    value: option.value,
                    label: t(option.labelKey),
                  }))}
                  disabled={disabled}
                  onChange={(type) => updateRule(rule.id, { type })}
                />
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <span className={fieldLabelClass}>
                {t('config_management.visual.sections.system.store_auth_apply_to')}
              </span>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {PLUGIN_STORE_AUTH_APPLY_TO_OPTIONS.map((option) => (
                  <label key={option.value} className={checkboxLabelClass}>
                    <Checkbox
                      checked={rule.applyTo.includes(option.value)}
                      disabled={disabled}
                      onCheckedChange={() => toggleApplyTo(rule, option.value)}
                    />
                    {t(option.labelKey)}
                  </label>
                ))}
              </div>
              <small className="text-xs leading-normal text-muted-foreground">
                {t('config_management.visual.sections.system.store_auth_apply_to_hint')}
              </small>
            </div>

            {usesToken ? (
              <label className={fieldClass}>
                <span className={fieldLabelClass}>
                  {t('config_management.visual.sections.system.store_auth_token_env')}
                </span>
                {envInput(
                  rule.tokenEnv,
                  (tokenEnv) => updateRule(rule.id, { tokenEnv }),
                  'CLIPROXY_PLUGIN_STORE_TOKEN'
                )}
              </label>
            ) : null}

            {usesBasic ? (
              <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
                <label className={fieldClass}>
                  <span className={fieldLabelClass}>
                    {t('config_management.visual.sections.system.store_auth_username_env')}
                  </span>
                  {envInput(rule.usernameEnv, (usernameEnv) =>
                    updateRule(rule.id, { usernameEnv })
                  )}
                </label>
                <label className={fieldClass}>
                  <span className={fieldLabelClass}>
                    {t('config_management.visual.sections.system.store_auth_password_env')}
                  </span>
                  {envInput(rule.passwordEnv, (passwordEnv) =>
                    updateRule(rule.id, { passwordEnv })
                  )}
                </label>
              </div>
            ) : null}

            {usesHeader ? (
              <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
                <label className={fieldClass}>
                  <span className={fieldLabelClass}>
                    {t('config_management.visual.sections.system.store_auth_header_name')}
                  </span>
                  {envInput(
                    rule.headerName,
                    (headerName) => updateRule(rule.id, { headerName }),
                    'X-Plugin-Token'
                  )}
                </label>
                <label className={fieldClass}>
                  <span className={fieldLabelClass}>
                    {t('config_management.visual.sections.system.store_auth_header_value_env')}
                  </span>
                  {envInput(rule.headerValueEnv, (headerValueEnv) =>
                    updateRule(rule.id, { headerValueEnv })
                  )}
                </label>
              </div>
            ) : null}

            <label className={checkboxLabelClass}>
              <Checkbox
                checked={rule.allowInsecure}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  updateRule(rule.id, { allowInsecure: checked === true })
                }
              />
              {t('config_management.visual.sections.system.store_auth_allow_insecure')}
            </label>
          </RuleCard>
        );
      })}
      <AddButton onClick={addRule} disabled={disabled}>
        {t('config_management.visual.sections.system.store_auth_add')}
      </AddButton>
    </div>
  );
});
