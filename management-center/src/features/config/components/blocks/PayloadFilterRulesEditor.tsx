import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PayloadFilterRule, PayloadModelEntry } from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import { ExpandableInput } from './ExpandableInput';
import { StringListEditor } from './StringListEditor';
import { OptionSelect } from '../fields/OptionSelect';
import { AddButton, BlockLabel, EmptyRules, RemoveButton, RuleCard } from './parts';
import { buildProtocolOptions } from './shared';

export const PayloadFilterRulesEditor = memo(function PayloadFilterRulesEditor({
  value,
  disabled,
  onChange,
}: {
  value: PayloadFilterRule[];
  disabled?: boolean;
  onChange: (next: PayloadFilterRule[]) => void;
}) {
  const { t } = useTranslation();
  const rules = value;
  const protocolOptions = useMemo(() => buildProtocolOptions(t, rules), [rules, t]);

  const addRule = () => onChange([...rules, { id: makeClientId(), models: [], params: [] }]);
  const removeRule = (ruleIndex: number) => onChange(rules.filter((_, i) => i !== ruleIndex));

  const updateRule = (ruleIndex: number, patch: Partial<PayloadFilterRule>) =>
    onChange(rules.map((rule, i) => (i === ruleIndex ? { ...rule, ...patch } : rule)));

  const addModel = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextModel: PayloadModelEntry = { id: makeClientId(), name: '', protocol: undefined };
    updateRule(ruleIndex, { models: [...rule.models, nextModel] });
  };

  const removeModel = (ruleIndex: number, modelIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { models: rule.models.filter((_, i) => i !== modelIndex) });
  };

  const updateModel = (
    ruleIndex: number,
    modelIndex: number,
    patch: Partial<PayloadModelEntry>
  ) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      models: rule.models.map((m, i) => (i === modelIndex ? { ...m, ...patch } : m)),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {rules.map((rule, ruleIndex) => (
        <RuleCard
          key={rule.id}
          title={`${t('config_management.visual.payload_rules.rule')} ${ruleIndex + 1}`}
          removeLabel={t('config_management.visual.common.delete')}
          onRemove={() => removeRule(ruleIndex)}
          disabled={disabled}
        >
          <div className="flex flex-col gap-2">
            <BlockLabel>{t('config_management.visual.payload_rules.models')}</BlockLabel>
            {rule.models.map((model, modelIndex) => (
              <div
                key={model.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 @lg:grid-cols-[minmax(0,1fr)_10rem_auto]"
              >
                <ExpandableInput
                  placeholder={t('config_management.visual.payload_rules.model_name')}
                  ariaLabel={t('config_management.visual.payload_rules.model_name')}
                  value={model.name}
                  onChange={(nextValue) => updateModel(ruleIndex, modelIndex, { name: nextValue })}
                  disabled={disabled}
                />
                <div className="max-@lg:order-last max-@lg:col-span-2">
                  <OptionSelect
                    value={model.protocol ?? ''}
                    options={protocolOptions}
                    disabled={disabled}
                    ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                    onChange={(nextValue) =>
                      updateModel(ruleIndex, modelIndex, {
                        protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                      })
                    }
                  />
                </div>
                <RemoveButton
                  label={t('config_management.visual.common.delete')}
                  onClick={() => removeModel(ruleIndex, modelIndex)}
                  disabled={disabled}
                />
              </div>
            ))}
            <AddButton onClick={() => addModel(ruleIndex)} disabled={disabled}>
              {t('config_management.visual.payload_rules.add_model')}
            </AddButton>
          </div>

          <div className="flex flex-col gap-2">
            <BlockLabel>{t('config_management.visual.payload_rules.remove_params')}</BlockLabel>
            <StringListEditor
              value={rule.params}
              disabled={disabled}
              placeholder={t('config_management.visual.payload_rules.json_path_filter')}
              inputAriaLabel={t('config_management.visual.payload_rules.json_path_filter')}
              onChange={(params) => updateRule(ruleIndex, { params })}
            />
          </div>
        </RuleCard>
      ))}

      {rules.length === 0 && (
        <EmptyRules>{t('config_management.visual.payload_rules.no_rules')}</EmptyRules>
      )}

      <AddButton onClick={addRule} disabled={disabled}>
        {t('config_management.visual.payload_rules.add_rule')}
      </AddButton>
    </div>
  );
});
