import { memo, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getPayloadReplaceRuleError } from '@/hooks/useVisualConfig';
import type { PayloadReplaceRule } from '@/types/visualConfig';
import { PAYLOAD_REPLACE_ROLES, makeClientId } from '@/types/visualConfig';
import { OptionSelect } from '../fields/OptionSelect';
import { StringListEditor } from './StringListEditor';
import { TextReplacementsEditor } from './TextReplacementsEditor';
import { AddButton, BlockLabel, EmptyRules, RuleCard } from './parts';
import { PayloadModelsList } from './PayloadModelsList';
import { buildProtocolOptions, getValidationMessage } from './shared';

const T = 'config_management.visual.payload_rules';

/**
 * Which part of the request a rule edits. Wide: one line (target, role, all, positions).
 * Narrow: target and role share a line, with all and positions below.
 */
function ReplaceTarget({
  rule,
  disabled,
  onChange,
}: {
  rule: PayloadReplaceRule;
  disabled?: boolean;
  onChange: (patch: Partial<PayloadReplaceRule>) => void;
}) {
  const { t } = useTranslation();
  const allId = useId();
  const targetOptions = [
    { value: 'role', label: t(`${T}.target_role`) },
    { value: 'paths', label: t(`${T}.target_paths`) },
  ] as const;
  const roleOptions = PAYLOAD_REPLACE_ROLES.map((role) => ({
    value: role,
    label: t(`${T}.role_${role}`),
  }));

  return (
    <div className="flex flex-col gap-2">
      <BlockLabel>{t(`${T}.target`)}</BlockLabel>
      <div className="grid grid-cols-2 items-center gap-2 @lg:grid-cols-[10rem_10rem_auto_minmax(0,1fr)] @lg:gap-x-3">
        <OptionSelect
          value={rule.targetKind}
          options={targetOptions}
          disabled={disabled}
          ariaLabel={t(`${T}.target`)}
          onChange={(targetKind) => onChange({ targetKind })}
        />
        {rule.targetKind === 'role' && (
          <>
            <OptionSelect
              value={rule.role}
              options={roleOptions}
              disabled={disabled}
              ariaLabel={t(`${T}.role`)}
              onChange={(role) => onChange({ role })}
            />
            <Field orientation="horizontal" className="min-h-10 w-auto items-center">
              <Checkbox
                id={allId}
                checked={rule.all}
                disabled={disabled}
                onCheckedChange={(checked) => onChange({ all: checked === true })}
              />
              <FieldLabel htmlFor={allId} className="font-normal whitespace-nowrap">
                {t(`${T}.all_messages`)}
              </FieldLabel>
            </Field>
            {!rule.all && (
              <Input
                className="font-mono"
                inputMode="numeric"
                placeholder={t(`${T}.positions_placeholder`)}
                aria-label={t(`${T}.positions`)}
                value={rule.positions}
                disabled={disabled}
                onChange={(event) => onChange({ positions: event.target.value })}
              />
            )}
          </>
        )}
      </div>
      {rule.targetKind === 'paths' && (
        <StringListEditor
          value={rule.paths}
          disabled={disabled}
          placeholder={t(`${T}.json_path_replace`)}
          inputAriaLabel={t(`${T}.json_path_replace`)}
          onChange={(paths) => onChange({ paths })}
        />
      )}
    </div>
  );
}

/** `requests.payload.replace`: find and replace text in chosen messages or JSON paths. */
export const PayloadReplaceRulesEditor = memo(function PayloadReplaceRulesEditor({
  value,
  disabled,
  onChange,
}: {
  value: PayloadReplaceRule[];
  disabled?: boolean;
  onChange: (next: PayloadReplaceRule[]) => void;
}) {
  const { t } = useTranslation();
  const rules = value;
  const protocolOptions = useMemo(() => buildProtocolOptions(t, rules), [rules, t]);

  const addRule = () =>
    onChange([
      ...rules,
      {
        id: makeClientId(),
        models: [],
        targetKind: 'role',
        role: 'user',
        all: false,
        positions: '',
        paths: [],
        replacements: [],
      },
    ]);
  const removeRule = (ruleIndex: number) => onChange(rules.filter((_, i) => i !== ruleIndex));
  const updateRule = (ruleIndex: number, patch: Partial<PayloadReplaceRule>) =>
    onChange(rules.map((rule, i) => (i === ruleIndex ? { ...rule, ...patch } : rule)));

  return (
    <div className="flex flex-col gap-3">
      {rules.map((rule, ruleIndex) => {
        // A rule without a model is never written, so its gaps are not errors yet.
        const error = rule.models.some((model) => model.name.trim())
          ? getValidationMessage(t, getPayloadReplaceRuleError(rule))
          : undefined;
        return (
          <RuleCard
            key={rule.id}
            title={`${t(`${T}.rule`)} ${ruleIndex + 1}`}
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

            <ReplaceTarget
              rule={rule}
              disabled={disabled}
              onChange={(patch) => updateRule(ruleIndex, patch)}
            />

            <div className="flex flex-col gap-2">
              <BlockLabel>{t(`${T}.replacements`)}</BlockLabel>
              <TextReplacementsEditor
                value={rule.replacements}
                disabled={disabled}
                onChange={(replacements) => updateRule(ruleIndex, { replacements })}
              />
            </div>

            {error && <div className="text-[13px] text-destructive">{error}</div>}
          </RuleCard>
        );
      })}

      {rules.length === 0 && <EmptyRules>{t(`${T}.no_rules`)}</EmptyRules>}

      <AddButton onClick={addRule} disabled={disabled}>
        {t(`${T}.add_rule`)}
      </AddButton>
    </div>
  );
});
