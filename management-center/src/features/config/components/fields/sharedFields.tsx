// The most used fields, kept out of the section files. Each one renders in exactly one tab, so a
// single edit never marks two tabs unsaved.

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { usePhone } from '@/components/layout/pageBar';
import type { VisualConfigValues } from '@/types/visualConfig';
import { configFieldDomId } from '../../searchIndex';
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
      placeholder={t('config_management.visual.common.example_value', {
        value: 'socks5://127.0.0.1:1080',
      })}
      value={values.proxyUrl}
      onChange={(proxyUrl) => onChange({ proxyUrl })}
      disabled={disabled}
    />
  );
}

export function ApiKeysField({ values, disabled, onChange }: SharedFieldProps) {
  const { t } = useTranslation();
  const phone = usePhone();
  // Phones manage keys on the API keys page, which also shows their names; a second full
  // editor here only repeats it. The row keeps the field id so search still lands on it.
  if (phone) {
    const count = values.apiKeysText.split('\n').filter((key) => key.trim()).length;
    return (
      <SettingList>
        <Link
          id={configFieldDomId('apiKeys')}
          to="/api-keys"
          // Lets the API keys page offer a way back here.
          state={{ from: 'config' }}
          className="flex min-h-14 items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="min-w-0 flex-1 text-sm font-medium">
            {t('config_management.visual.api_keys.label')}
          </span>
          <span className="text-sm text-muted-foreground">{count}</span>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={1.75}
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
        </Link>
      </SettingList>
    );
  }
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
      checked={values.loggingToFile}
      disabled={disabled}
      onChange={(loggingToFile) => onChange({ loggingToFile })}
    />
  );
}
