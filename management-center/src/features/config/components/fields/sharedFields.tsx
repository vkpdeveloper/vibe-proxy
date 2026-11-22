// 6 个高频字段的唯一渲染源：SectionCommon（常用 tab）与各正典分区共用这些组件，
// 两处渲染结构性不可能漂移（旧简单模式靠共享 JSX 常量达成同一目的）。
// 注意：只挂载激活 tab，所以设置行的 DOM id 不会重复。

import { useTranslation } from 'react-i18next';
import type { VisualConfigValues } from '@/types/visualConfig';
import { ApiKeysCardEditor } from '../blocks/ApiKeysCardEditor';
import { SettingCell, SettingList, TextSetting, ToggleSetting } from './FieldPrimitives';

export type SharedFieldProps = {
  values: VisualConfigValues;
  disabled: boolean;
  onChange: (patch: Partial<VisualConfigValues>) => void;
};

export function HostField({ values, disabled, onChange }: SharedFieldProps) {
  const { t } = useTranslation();
  return (
    <TextSetting
      fieldId="host"
      label={t('config_management.visual.sections.server.host')}
      placeholder="0.0.0.0"
      value={values.host}
      onChange={(host) => onChange({ host })}
      disabled={disabled}
    />
  );
}

export function PortField({
  values,
  disabled,
  onChange,
  error,
}: SharedFieldProps & { error?: string }) {
  const { t } = useTranslation();
  return (
    <TextSetting
      fieldId="port"
      label={t('config_management.visual.sections.server.port')}
      type="number"
      size="sm"
      placeholder="8317"
      value={values.port}
      onChange={(port) => onChange({ port })}
      disabled={disabled}
      error={error}
    />
  );
}

export function ProxyUrlField({ values, disabled, onChange }: SharedFieldProps) {
  const { t } = useTranslation();
  return (
    <TextSetting
      fieldId="proxyUrl"
      size="lg"
      label={t('config_management.visual.sections.network.proxy_url')}
      placeholder="socks5://user:pass@127.0.0.1:1080/"
      value={values.proxyUrl}
      onChange={(proxyUrl) => onChange({ proxyUrl })}
      disabled={disabled}
    />
  );
}

export function ApiKeysField({ values, disabled, onChange }: SharedFieldProps) {
  return (
    <SettingList>
      <SettingCell fieldId="apiKeys">
        <ApiKeysCardEditor
          value={values.apiKeysText}
          disabled={disabled}
          onChange={(apiKeysText) => onChange({ apiKeysText })}
        />
      </SettingCell>
    </SettingList>
  );
}

export function DebugToggle({ values, disabled, onChange }: SharedFieldProps) {
  const { t } = useTranslation();
  return (
    <ToggleSetting
      fieldId="debug"
      label={t('config_management.visual.sections.system.debug')}
      description={t('config_management.visual.sections.system.debug_desc')}
      checked={values.debug}
      disabled={disabled}
      onChange={(debug) => onChange({ debug })}
    />
  );
}

export function LoggingToFileToggle({ values, disabled, onChange }: SharedFieldProps) {
  const { t } = useTranslation();
  return (
    <ToggleSetting
      fieldId="loggingToFile"
      label={t('config_management.visual.sections.system.logging_to_file')}
      description={t('config_management.visual.sections.system.logging_to_file_desc')}
      checked={values.loggingToFile}
      disabled={disabled}
      onChange={(loggingToFile) => onChange({ loggingToFile })}
    />
  );
}
