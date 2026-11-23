import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingGroup, SettingGroups } from '../fields/SettingGroup';
import type { PayloadFilterRule, PayloadRule } from '@/types/visualConfig';
import type { ConfigSectionProps } from '../../types';
import { Section } from '@/components/layout/Page';
import { FieldAnchor } from '../fields/FieldPrimitives';
import { PayloadFilterRulesEditor } from '../blocks/PayloadFilterRulesEditor';
import { PayloadRulesEditor } from '../blocks/PayloadRulesEditor';

export type SectionPayloadProps = ConfigSectionProps & {
  /** 有载荷校验错误时折叠组带 key 重挂载并强制展开，把错误带到眼前。 */
  hasPayloadValidationErrors: boolean;
};

/** 06 Payload 配置：默认值 / 原始 JSON / 覆盖 / 过滤 五个规则组。 */
export function SectionPayload({
  values,
  disabled,
  hasPayloadValidationErrors,
  onChange,
}: SectionPayloadProps) {
  const { t } = useTranslation();
  const payloadValidationKey = hasPayloadValidationErrors ? 'payload-errors' : 'payload-ok';

  const handlePayloadDefaultRulesChange = useCallback(
    (payloadDefaultRules: PayloadRule[]) => onChange({ payloadDefaultRules }),
    [onChange]
  );
  const handlePayloadDefaultRawRulesChange = useCallback(
    (payloadDefaultRawRules: PayloadRule[]) => onChange({ payloadDefaultRawRules }),
    [onChange]
  );
  const handlePayloadOverrideRulesChange = useCallback(
    (payloadOverrideRules: PayloadRule[]) => onChange({ payloadOverrideRules }),
    [onChange]
  );
  const handlePayloadOverrideRawRulesChange = useCallback(
    (payloadOverrideRawRules: PayloadRule[]) => onChange({ payloadOverrideRawRules }),
    [onChange]
  );
  const handlePayloadFilterRulesChange = useCallback(
    (payloadFilterRules: PayloadFilterRule[]) => onChange({ payloadFilterRules }),
    [onChange]
  );

  return (
    <Section title={t('config_management.visual.sections.payload.title')}>
      <SettingGroups>
        <FieldAnchor fieldId="payloadDefaultRules">
          <SettingGroup
            key={`payloadDefaultRules-${payloadValidationKey}`}
            label={t('config_management.visual.sections.payload.default_rules')}
            hint={t('config_management.visual.sections.payload.default_rules_desc')}
            defaultOpen={hasPayloadValidationErrors}
          >
            <PayloadRulesEditor
              value={values.payloadDefaultRules}
              disabled={disabled}
              onChange={handlePayloadDefaultRulesChange}
            />
          </SettingGroup>
        </FieldAnchor>

        <FieldAnchor fieldId="payloadDefaultRawRules">
          <SettingGroup
            key={`payloadDefaultRawRules-${payloadValidationKey}`}
            label={t('config_management.visual.sections.payload.default_raw_rules')}
            hint={t('config_management.visual.sections.payload.default_raw_rules_desc')}
            defaultOpen={hasPayloadValidationErrors}
          >
            <PayloadRulesEditor
              value={values.payloadDefaultRawRules}
              disabled={disabled}
              rawJsonValues
              onChange={handlePayloadDefaultRawRulesChange}
            />
          </SettingGroup>
        </FieldAnchor>

        <FieldAnchor fieldId="payloadOverrideRules">
          <SettingGroup
            key={`payloadOverrideRules-${payloadValidationKey}`}
            label={t('config_management.visual.sections.payload.override_rules')}
            hint={t('config_management.visual.sections.payload.override_rules_desc')}
            defaultOpen={hasPayloadValidationErrors}
          >
            <PayloadRulesEditor
              value={values.payloadOverrideRules}
              disabled={disabled}
              protocolFirst
              onChange={handlePayloadOverrideRulesChange}
            />
          </SettingGroup>
        </FieldAnchor>

        <FieldAnchor fieldId="payloadOverrideRawRules">
          <SettingGroup
            key={`payloadOverrideRawRules-${payloadValidationKey}`}
            label={t('config_management.visual.sections.payload.override_raw_rules')}
            hint={t('config_management.visual.sections.payload.override_raw_rules_desc')}
            defaultOpen={hasPayloadValidationErrors}
          >
            <PayloadRulesEditor
              value={values.payloadOverrideRawRules}
              disabled={disabled}
              protocolFirst
              rawJsonValues
              onChange={handlePayloadOverrideRawRulesChange}
            />
          </SettingGroup>
        </FieldAnchor>

        <FieldAnchor fieldId="payloadFilterRules">
          <SettingGroup
            key={`payloadFilterRules-${payloadValidationKey}`}
            label={t('config_management.visual.sections.payload.filter_rules')}
            hint={t('config_management.visual.sections.payload.filter_rules_desc')}
            defaultOpen={hasPayloadValidationErrors}
          >
            <PayloadFilterRulesEditor
              value={values.payloadFilterRules}
              disabled={disabled}
              onChange={handlePayloadFilterRulesChange}
            />
          </SettingGroup>
        </FieldAnchor>
      </SettingGroups>
    </Section>
  );
}
