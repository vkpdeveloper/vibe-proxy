import { useTranslation } from 'react-i18next';
import { SettingGroup } from '../fields/SettingGroup';
import type { ConfigSectionProps } from '../../types';
import { Section } from '@/components/layout/Page';
import {
  BlockSetting,
  FieldStack,
  SettingList,
  TextSetting,
  ToggleSetting,
} from '../fields/FieldPrimitives';
import { ApiKeysField, HostField, PortField } from '../fields/sharedFields';
import { getValidationMessage } from '../blocks/shared';
import { StringListEditor } from '../blocks/StringListEditor';
import { SectionDiscovery } from './SectionDiscovery';

/** 01 接入与认证：服务地址、端口、认证目录、API 密钥 + TLS / 远程管理折叠组。 */
export function SectionConnectivity({
  values,
  validationErrors,
  disabled,
  onChange,
}: ConfigSectionProps) {
  const { t } = useTranslation();
  const fieldProps = { values, disabled, onChange };

  return (
    <Section title={t('config_management.visual.sections.connectivity.title')}>
      <SettingList>
        <HostField {...fieldProps} />
        <PortField {...fieldProps} error={getValidationMessage(t, validationErrors?.port)} />
        <TextSetting
          fieldId="authDir"
          size="lg"
          label={t('config_management.visual.sections.auth.auth_dir')}
          description={t('config_management.visual.sections.auth.auth_dir_hint')}
          placeholder="~/.cli-proxy-api"
          value={values.authDir}
          onChange={(authDir) => onChange({ authDir })}
          disabled={disabled}
        />
      </SettingList>

      <ApiKeysField {...fieldProps} />

      <SettingList>
        <TextSetting
          fieldId="githubToken"
          label={t('config_management.visual.sections.server.github_token')}
          description={t('config_management.visual.sections.server.github_token_hint')}
          type="password"
          autoComplete="new-password"
          value={values.githubToken}
          onChange={(githubToken) => onChange({ githubToken })}
          disabled={disabled}
        />
        <BlockSetting
          fieldId="trustedProxies"
          label={t('config_management.visual.serverExtras.trustedProxies.label')}
          description={t('config_management.visual.serverExtras.trustedProxies.hint')}
          error={getValidationMessage(t, validationErrors?.trustedProxies)}
        >
          <StringListEditor
            value={values.trustedProxies}
            disabled={disabled}
            placeholder="192.168.0.0/24"
            inputAriaLabel={t('config_management.visual.serverExtras.trustedProxies.label')}
            onChange={(trustedProxies) => onChange({ trustedProxies })}
          />
        </BlockSetting>
      </SettingList>

      <SettingGroup
        label={t('config_management.visual.sections.tls.title')}
        hint={t('config_management.visual.sections.tls.description')}
      >
        <SettingList>
          <ToggleSetting
            fieldId="tlsEnable"
            label={t('config_management.visual.sections.tls.enable')}
            description={t('config_management.visual.sections.tls.enable_desc')}
            checked={values.tlsEnable}
            disabled={disabled}
            onChange={(tlsEnable) => onChange({ tlsEnable })}
          />
          {values.tlsEnable ? (
            <>
              <TextSetting
                fieldId="tlsCert"
                size="lg"
                label={t('config_management.visual.sections.tls.cert')}
                placeholder="/path/to/cert.pem"
                value={values.tlsCert}
                onChange={(tlsCert) => onChange({ tlsCert })}
                disabled={disabled}
              />
              <TextSetting
                fieldId="tlsKey"
                size="lg"
                label={t('config_management.visual.sections.tls.key')}
                placeholder="/path/to/key.pem"
                value={values.tlsKey}
                onChange={(tlsKey) => onChange({ tlsKey })}
                disabled={disabled}
              />
            </>
          ) : null}
        </SettingList>
      </SettingGroup>

      <SettingGroup
        label={t('config_management.visual.sections.remote.title')}
        hint={t('config_management.visual.sections.remote.description')}
      >
        <FieldStack>
          <SettingList>
            <ToggleSetting
              fieldId="rmAllowRemote"
              label={t('config_management.visual.sections.remote.allow_remote')}
              description={t('config_management.visual.sections.remote.allow_remote_desc')}
              checked={values.rmAllowRemote}
              disabled={disabled}
              onChange={(rmAllowRemote) => onChange({ rmAllowRemote })}
            />
            <ToggleSetting
              fieldId="rmDisableControlPanel"
              label={t('config_management.visual.sections.remote.disable_panel')}
              description={t('config_management.visual.sections.remote.disable_panel_desc')}
              checked={values.rmDisableControlPanel}
              disabled={disabled}
              onChange={(rmDisableControlPanel) => onChange({ rmDisableControlPanel })}
            />
            <ToggleSetting
              fieldId="rmDisableAutoUpdatePanel"
              label={t('config_management.visual.sections.remote.disable_auto_update_panel')}
              description={t(
                'config_management.visual.sections.remote.disable_auto_update_panel_desc'
              )}
              checked={values.rmDisableAutoUpdatePanel}
              disabled={disabled}
              onChange={(rmDisableAutoUpdatePanel) => onChange({ rmDisableAutoUpdatePanel })}
            />
          </SettingList>
          <SettingList>
            <TextSetting
              fieldId="rmSecretKey"
              label={t('config_management.visual.sections.remote.secret_key')}
              type="password"
              placeholder={t('config_management.visual.sections.remote.secret_key_placeholder')}
              value={values.rmSecretKey}
              onChange={(rmSecretKey) => onChange({ rmSecretKey })}
              disabled={disabled}
            />
            <TextSetting
              fieldId="rmPanelRepo"
              size="lg"
              label={t('config_management.visual.sections.remote.panel_repo')}
              placeholder="https://github.com/router-for-me/Cli-Proxy-API-Management-Center"
              value={values.rmPanelRepo}
              onChange={(rmPanelRepo) => onChange({ rmPanelRepo })}
              disabled={disabled}
            />
          </SettingList>
        </FieldStack>
      </SettingGroup>

      <SectionDiscovery
        values={values}
        validationErrors={validationErrors}
        disabled={disabled}
        onChange={onChange}
      />
    </Section>
  );
}
