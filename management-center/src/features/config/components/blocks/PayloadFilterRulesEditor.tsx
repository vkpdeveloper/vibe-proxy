import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PayloadFilterRule } from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import { StringListEditor } from './StringListEditor';
import { AddButton, BlockLabel, EmptyRules, RuleCard } from './parts';
import { PayloadModelsList } from './PayloadModelsList';
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
          <PayloadModelsList
            models={rule.models}
            protocolOptions={protocolOptions}
            disabled={disabled}
            onChange={(models) => updateRule(ruleIndex, { models })}
          />

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
