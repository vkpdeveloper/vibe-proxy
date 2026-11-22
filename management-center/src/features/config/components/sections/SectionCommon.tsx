import { useTranslation } from 'react-i18next';
import type { ConfigSectionProps } from '../../types';
import { getValidationMessage } from '../blocks/shared';
import { Section } from '@/components/layout/Page';
import { SettingList } from '../fields/FieldPrimitives';
import {
  ApiKeysField,
  DebugToggle,
  HostField,
  LoggingToFileToggle,
  PortField,
  ProxyUrlField,
} from '../fields/sharedFields';

/**
 * 「常用」tab：原简单模式的 6 个高频字段，别名视图（不占分区序号）。
 * 渲染源与正典分区共享（sharedFields），数据同为 useVisualConfig 一份状态。
 */
export function SectionCommon({
  values,
  validationErrors,
  disabled,
  onChange,
}: ConfigSectionProps) {
  const { t } = useTranslation();
  const portError = getValidationMessage(t, validationErrors?.port);
  const fieldProps = { values, disabled, onChange };

  return (
    <Section title={t('config_management.visual.sections.common.title')}>
      <SettingList>
        <HostField {...fieldProps} />
        <PortField {...fieldProps} error={portError} />
        <ProxyUrlField {...fieldProps} />
      </SettingList>

      <ApiKeysField {...fieldProps} />

      <SettingList>
        <DebugToggle {...fieldProps} />
        <LoggingToFileToggle {...fieldProps} />
      </SettingList>
    </Section>
  );
}
