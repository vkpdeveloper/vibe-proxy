import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingGroup, SettingGroups } from '../fields/SettingGroup';
import type { ConfigSectionProps } from '../../types';
import { Section } from '@/components/layout/Page';
import {
  BlockSetting,
  FieldStack,
  SettingList,
  TextSetting,
  ToggleSetting,
} from '../fields/FieldPrimitives';
import type { TextReplacementEntry } from '@/types/visualConfig';
import { StringListEditor } from '../blocks/StringListEditor';
import { TextReplacementsEditor } from '../blocks/TextReplacementsEditor';
import { getValidationMessage } from '../blocks/shared';
import { SectionOAuthBehavior } from './SectionOAuthBehavior';

/** 05 高级与实验：插件源、供应商敏感词、签名缓存与请求头默认值。 */
export function SectionAdvanced({
  values,
  validationErrors,
  disabled,
  onChange,
}: ConfigSectionProps) {
  const { t } = useTranslation();

  const handleAntigravitySensitiveWordsChange = useCallback(
    (antigravitySensitiveWords: string[]) => onChange({ antigravitySensitiveWords }),
    [onChange]
  );
  const handleDevinSensitiveWordsChange = useCallback(
    (devinSensitiveWords: string[]) => onChange({ devinSensitiveWords }),
    [onChange]
  );
  const handleAntigravitySensitiveReplacementsChange = useCallback(
    (antigravitySensitiveReplacements: TextReplacementEntry[]) =>
      onChange({ antigravitySensitiveReplacements }),
    [onChange]
  );
  const handleDevinSensitiveReplacementsChange = useCallback(
    (devinSensitiveReplacements: TextReplacementEntry[]) =>
      onChange({ devinSensitiveReplacements }),
    [onChange]
  );

  return (
    <Section title={t('config_management.visual.sections.advanced.title')}>
      <SettingGroups>
        <SectionOAuthBehavior
          values={values}
          validationErrors={validationErrors}
          disabled={disabled}
          onChange={onChange}
        />

        <SettingGroup label={t('config_management.visual.sections.advanced.plugins_title')}>
          <SettingList>
            <ToggleSetting
              fieldId="pluginsEnabled"
              label={t('config_management.visual.sections.system.plugins_enabled')}
              checked={values.pluginsEnabled}
              disabled={disabled}
              onChange={(pluginsEnabled) => onChange({ pluginsEnabled })}
            />
          </SettingList>
        </SettingGroup>

        <SettingGroup label={t('config_management.visual.sections.advanced.antigravity_title')}>
          <FieldStack>
            <SettingList>
              <ToggleSetting
                fieldId="quotaAntigravityCredits"
                label={t('config_management.visual.sections.advanced.antigravity_credits')}
                checked={values.quotaAntigravityCredits}
                disabled={disabled}
                onChange={(quotaAntigravityCredits) => onChange({ quotaAntigravityCredits })}
              />
            </SettingList>
            <SettingList
              title={t('config_management.visual.sections.system.antigravity_sensitive_words')}
              description={t(
                'config_management.visual.sections.system.antigravity_sensitive_words_desc'
              )}
            >
              <BlockSetting
                fieldId="antigravitySensitiveWords"
                label={t(
                  'config_management.visual.sections.system.antigravity_sensitive_words_label'
                )}
              >
                <StringListEditor
                  value={values.antigravitySensitiveWords}
                  disabled={disabled}
                  placeholder={t(
                    'config_management.visual.sections.system.antigravity_sensitive_words_placeholder'
                  )}
                  inputAriaLabel={t(
                    'config_management.visual.sections.system.antigravity_sensitive_words_label'
                  )}
                  onChange={handleAntigravitySensitiveWordsChange}
                />
              </BlockSetting>
              <BlockSetting
                fieldId="antigravitySensitiveReplacements"
                label={t('config_management.visual.sections.system.sensitive_replacements_label')}
              >
                <TextReplacementsEditor
                  value={values.antigravitySensitiveReplacements}
                  disabled={disabled}
                  onChange={handleAntigravitySensitiveReplacementsChange}
                />
              </BlockSetting>
            </SettingList>

            <SettingList title={t('config_management.visual.sections.advanced.signature_title')}>
              <ToggleSetting
                fieldId="antigravitySignatureCacheEnabled"
                label={t('config_management.visual.sections.system.antigravity_signature_cache')}
                checked={values.antigravitySignatureCacheEnabled}
                disabled={disabled}
                onChange={(antigravitySignatureCacheEnabled) =>
                  onChange({ antigravitySignatureCacheEnabled })
                }
              />
              <ToggleSetting
                fieldId="antigravitySignatureBypassStrict"
                label={t('config_management.visual.sections.system.antigravity_signature_strict')}
                description={t(
                  'config_management.visual.sections.system.antigravity_signature_strict_desc'
                )}
                checked={values.antigravitySignatureBypassStrict}
                disabled={disabled}
                onChange={(antigravitySignatureBypassStrict) =>
                  onChange({ antigravitySignatureBypassStrict })
                }
              />
            </SettingList>
          </FieldStack>
        </SettingGroup>

        <SettingGroup label={t('config_management.visual.sections.advanced.devin_title')}>
          <SettingList
            title={t('config_management.visual.sections.system.devin_sensitive_words')}
            description={t('config_management.visual.sections.system.devin_sensitive_words_desc')}
          >
            <BlockSetting
              fieldId="devinSensitiveWords"
              label={t('config_management.visual.sections.system.devin_sensitive_words_label')}
            >
              <StringListEditor
                value={values.devinSensitiveWords}
                disabled={disabled}
                placeholder={t(
                  'config_management.visual.sections.system.devin_sensitive_words_placeholder'
                )}
                inputAriaLabel={t(
                  'config_management.visual.sections.system.devin_sensitive_words_label'
                )}
                onChange={handleDevinSensitiveWordsChange}
              />
            </BlockSetting>
            <BlockSetting
              fieldId="devinSensitiveReplacements"
              label={t('config_management.visual.sections.system.sensitive_replacements_label')}
            >
              <TextReplacementsEditor
                value={values.devinSensitiveReplacements}
                disabled={disabled}
                onChange={handleDevinSensitiveReplacementsChange}
              />
            </BlockSetting>
          </SettingList>
        </SettingGroup>

        <SettingGroup
          label={t('config_management.visual.sections.headers.title')}
          hint={t('config_management.visual.sections.headers.description')}
        >
          <FieldStack>
            <SettingList title={t('config_management.visual.sections.headers.claude_title')}>
              <TextSetting
                fieldId="claudeHeaderUserAgent"
                size="lg"
                label={t('config_management.visual.sections.headers.user_agent')}
                placeholder="claude-cli/2.1.44 (external, sdk-cli)"
                value={values.claudeHeaderUserAgent}
                onChange={(claudeHeaderUserAgent) => onChange({ claudeHeaderUserAgent })}
                disabled={disabled}
              />
              <TextSetting
                fieldId="claudeHeaderPackageVersion"
                size="sm"
                label={t('config_management.visual.sections.headers.package_version')}
                placeholder="0.74.0"
                value={values.claudeHeaderPackageVersion}
                onChange={(claudeHeaderPackageVersion) => onChange({ claudeHeaderPackageVersion })}
                disabled={disabled}
              />
              <TextSetting
                fieldId="claudeHeaderRuntimeVersion"
                size="sm"
                label={t('config_management.visual.sections.headers.runtime_version')}
                placeholder="v24.3.0"
                value={values.claudeHeaderRuntimeVersion}
                onChange={(claudeHeaderRuntimeVersion) => onChange({ claudeHeaderRuntimeVersion })}
                disabled={disabled}
              />
              <TextSetting
                fieldId="claudeHeaderOs"
                size="sm"
                label={t('config_management.visual.sections.headers.os')}
                placeholder="MacOS"
                value={values.claudeHeaderOs}
                onChange={(claudeHeaderOs) => onChange({ claudeHeaderOs })}
                disabled={disabled}
              />
              <TextSetting
                fieldId="claudeHeaderArch"
                size="sm"
                label={t('config_management.visual.sections.headers.arch')}
                placeholder="arm64"
                value={values.claudeHeaderArch}
                onChange={(claudeHeaderArch) => onChange({ claudeHeaderArch })}
                disabled={disabled}
              />
              <TextSetting
                fieldId="claudeHeaderTimezone"
                label={t('config_management.visual.additions.claudeHeaderTimezone.label')}
                description={t('config_management.visual.additions.claudeHeaderTimezone.hint')}
                value={values.claudeHeaderTimezone}
                onChange={(claudeHeaderTimezone) => onChange({ claudeHeaderTimezone })}
                disabled={disabled}
                error={getValidationMessage(t, validationErrors?.claudeHeaderTimezone)}
              />
              <TextSetting
                fieldId="claudeHeaderTimeout"
                size="sm"
                label={t('config_management.visual.sections.headers.timeout')}
                placeholder="600"
                value={values.claudeHeaderTimeout}
                onChange={(claudeHeaderTimeout) => onChange({ claudeHeaderTimeout })}
                disabled={disabled}
              />
              <ToggleSetting
                fieldId="claudeHeaderStabilizeDeviceProfile"
                label={t('config_management.visual.sections.headers.stabilize_device')}
                description={t('config_management.visual.sections.headers.stabilize_device_desc')}
                checked={values.claudeHeaderStabilizeDeviceProfile}
                disabled={disabled}
                onChange={(claudeHeaderStabilizeDeviceProfile) =>
                  onChange({ claudeHeaderStabilizeDeviceProfile })
                }
              />
            </SettingList>

            <SettingList title={t('config_management.visual.sections.headers.codex_title')}>
              <TextSetting
                fieldId="codexHeaderUserAgent"
                size="lg"
                label={t('config_management.visual.sections.headers.user_agent')}
                placeholder="codex_cli_rs/0.114.0 (Mac OS 14.2.0; x86_64) vscode/1.111.0"
                value={values.codexHeaderUserAgent}
                onChange={(codexHeaderUserAgent) => onChange({ codexHeaderUserAgent })}
                disabled={disabled}
              />
              <TextSetting
                fieldId="codexHeaderBetaFeatures"
                label={t('config_management.visual.sections.headers.beta_features')}
                placeholder="multi_agent"
                value={values.codexHeaderBetaFeatures}
                onChange={(codexHeaderBetaFeatures) => onChange({ codexHeaderBetaFeatures })}
                disabled={disabled}
              />
            </SettingList>
          </FieldStack>
        </SettingGroup>
      </SettingGroups>
    </Section>
  );
}
