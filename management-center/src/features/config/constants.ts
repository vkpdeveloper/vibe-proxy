import type { IconSvgElement } from '@hugeicons/react';
import {
  CodeIcon,
  GlobalIcon,
  Key01Icon,
  NoteIcon,
  Shield01Icon,
  WaveIcon,
} from '@hugeicons/core-free-icons';
import type { VisualConfigFieldPath } from '@/types/visualConfig';
import type { VisualSectionId } from './searchIndex';

/** 编辑模式：可视化表单 or YAML 源码。 */
export type ConfigEditorMode = 'visual' | 'source';

/** One tab per section. Each field lives in exactly one tab, so one edit marks one tab unsaved. */
export type ConfigTabId = VisualSectionId;

export const CONFIG_SECTION_IDS = [
  'connectivity',
  'network',
  'logging',
  'streaming',
  'advanced',
  'payload',
] as const satisfies readonly VisualSectionId[];

export const CONFIG_TAB_IDS: readonly ConfigTabId[] = CONFIG_SECTION_IDS;

/** 分区序号（01–06）。 */
export const SECTION_INDEX_LABELS: Record<VisualSectionId, string> = {
  connectivity: '01',
  network: '02',
  logging: '03',
  streaming: '04',
  advanced: '05',
  payload: '06',
};

export const CONFIG_TAB_ICONS: Record<ConfigTabId, IconSvgElement> = {
  connectivity: Key01Icon,
  network: GlobalIcon,
  logging: NoteIcon,
  streaming: WaveIcon,
  advanced: Shield01Icon,
  payload: CodeIcon,
};

/**
 * 每个分区承载的校验字段路径（tab 错误徽章的分桶依据）。
 * payload 的校验不走字段路径，由 hasPayloadValidationErrors 旗标补记。
 */
export const SECTION_VALIDATION_FIELDS: Record<VisualSectionId, readonly VisualConfigFieldPath[]> =
  {
    connectivity: ['port', 'serverShutdownTimeout', 'trustedProxies', 'discoveryServiceType'],
    network: [
      'requestRetry',
      'maxRetryCredentials',
      'maxRetryInterval',
      'authAutoRefreshWorkers',
      'transientErrorCooldownSeconds',
      'videoResultAuthCacheTTL',
    ],
    logging: ['errorLogsMaxFiles', 'logsMaxTotalSizeMb', 'redisUsageQueueRetentionSeconds'],
    streaming: [
      'streaming.keepaliveSeconds',
      'streaming.bootstrapRetries',
      'streaming.nonstreamKeepaliveInterval',
    ],
    advanced: [
      'claudeHeaderTimezone',
      'codexStreamBootstrapTimeout',
      'antigravityConnectionPoolIdleTimeout',
      'antigravityConnectionPoolMaxIdleConnsPerHost',
      'codexLiveMediaRelayMaxSessions',
      'codexLiveMediaRelayPublicIP',
      'codexLiveMediaRelayUDPPortMin',
      'codexLiveMediaRelayUDPPortMax',
      'codexLiveMediaRelayICEServers',
    ],
    payload: [],
  };

/**
 * fieldId → useVisualConfig dirtyFields 的键（= VisualConfigValues 叶值键，streaming 用点号叶）。
 * 与搜索索引一一对应；三方对账由 tests/configFieldParity.test.ts 守护 ——
 * 增删字段时漏改任何一边（索引 / 本表 / 分区 JSX）都会红。
 */
/**
 * Values kept in the model so they round-trip through YAML, but only editable in Source mode.
 * The plugin store screens were removed, so its sources and auth rules have no visual field.
 */
export const SOURCE_ONLY_VALUE_KEYS: readonly string[] = ['pluginStoreSources', 'pluginStoreAuth'];

export const FIELD_VALUE_KEYS: Record<string, readonly string[]> = {
  routingSessionAffinitySubagents: ['routingSessionAffinitySubagents'],
  saveCooldownStatus: ['saveCooldownStatus'],
  transientErrorCooldownSeconds: ['transientErrorCooldownSeconds'],
  videoResultAuthCacheTTL: ['videoResultAuthCacheTTL'],
  claudeHeaderTimezone: ['claudeHeaderTimezone'],
  claudeModelLevelCooling: ['claudeModelLevelCooling'],
  claudeDisableCloakMode: ['claudeDisableCloakMode'],
  claudeCodeDisableCloakingModelList: ['claudeCodeDisableCloakingModelList'],
  codexDisableCloaking: ['codexDisableCloaking'],
  codexModelLevelCooling: ['codexModelLevelCooling'],
  codexStreamBootstrapBuffering: ['codexStreamBootstrapBuffering'],
  codexStreamBootstrapTimeout: ['codexStreamBootstrapTimeout'],
  codexOptimizeMultiAgentV2: ['codexOptimizeMultiAgentV2'],
  codexOrphanDelegationCompatibility: ['codexOrphanDelegationCompatibility'],
  codexResponseSteering: ['codexResponseSteering'],
  antigravityConnectionPoolEnabled: ['antigravityConnectionPoolEnabled'],
  antigravityConnectionPoolIdleTimeout: ['antigravityConnectionPoolIdleTimeout'],
  antigravityConnectionPoolMaxIdleConnsPerHost: ['antigravityConnectionPoolMaxIdleConnsPerHost'],
  xaiInjectXSearch: ['xaiInjectXSearch'],
  codexLiveMediaRelayEnabled: ['codexLiveMediaRelayEnabled'],
  codexLiveMediaRelayMaxSessions: ['codexLiveMediaRelayMaxSessions'],
  codexLiveMediaRelayDisablePrivateRemoteIPs: ['codexLiveMediaRelayDisablePrivateRemoteIPs'],
  codexLiveMediaRelayPublicIP: ['codexLiveMediaRelayPublicIP'],
  codexLiveMediaRelayUDPPortMin: ['codexLiveMediaRelayUDPPortMin'],
  codexLiveMediaRelayUDPPortMax: ['codexLiveMediaRelayUDPPortMax'],
  codexLiveMediaRelayICEServers: ['codexLiveMediaRelayICEServers'],

  // ── connectivity ──────────────────────────────────────────────────────────
  githubToken: ['githubToken'],
  trustedProxies: ['trustedProxies'],
  discoveryEnabled: ['discoveryEnabled'],
  discoveryServiceName: ['discoveryServiceName'],
  discoveryServiceType: ['discoveryServiceType'],
  discoverySubtypes: ['discoverySubtypes'],
  discoveryInterfacesInclude: ['discoveryInterfacesInclude'],
  discoveryInterfacesExclude: ['discoveryInterfacesExclude'],
  discoveryAuthRequired: ['discoveryAuthRequired'],
  discoveryAdvertiseManagement: ['discoveryAdvertiseManagement'],
  host: ['host'],
  port: ['port'],
  serverShutdownTimeout: ['serverShutdownTimeout'],
  authDir: ['authDir'],
  apiKeys: ['apiKeysText'],
  tlsEnable: ['tlsEnable'],
  tlsCert: ['tlsCert'],
  tlsKey: ['tlsKey'],
  rmAllowRemote: ['rmAllowRemote'],
  rmDisableControlPanel: ['rmDisableControlPanel'],
  rmDisableAutoUpdatePanel: ['rmDisableAutoUpdatePanel'],
  rmSecretKey: ['rmSecretKey'],
  rmPanelRepo: ['rmPanelRepo'],
  // ── network ───────────────────────────────────────────────────────────────
  proxyUrl: ['proxyUrl'],
  requestRetry: ['requestRetry'],
  maxRetryCredentials: ['maxRetryCredentials'],
  maxRetryInterval: ['maxRetryInterval'],
  authAutoRefreshWorkers: ['authAutoRefreshWorkers'],
  routingStrategy: ['routingStrategy'],
  routingQuotaDrainRefreshInterval: ['routingQuotaDrainRefreshInterval'],
  routingQuotaDrainStaleAfter: ['routingQuotaDrainStaleAfter'],
  disableImageGeneration: ['disableImageGeneration'],
  gptImage2BaseModel: ['gptImage2BaseModel'],
  routingSessionAffinityTTL: ['routingSessionAffinityTTL'],
  forceModelPrefix: ['forceModelPrefix'],
  passthroughHeaders: ['passthroughHeaders'],
  disableCooling: ['disableCooling'],
  routingSessionAffinity: ['routingSessionAffinity'],
  wsAuth: ['wsAuth'],
  // ── logging ───────────────────────────────────────────────────────────────
  debug: ['debug'],
  commercialMode: ['commercialMode'],
  loggingToFile: ['loggingToFile'],
  logsMaxTotalSizeMb: ['logsMaxTotalSizeMb'],
  errorLogsMaxFiles: ['errorLogsMaxFiles'],
  redisUsageQueueRetentionSeconds: ['redisUsageQueueRetentionSeconds'],
  usageStatisticsEnabled: ['usageStatisticsEnabled'],
  // ── streaming ─────────────────────────────────────────────────────────────
  streamingKeepaliveSeconds: ['streaming.keepaliveSeconds'],
  streamingBootstrapRetries: ['streaming.bootstrapRetries'],
  streamingNonstreamKeepalive: ['streaming.nonstreamKeepaliveInterval'],
  // ── advanced ──────────────────────────────────────────────────────────────
  quotaAntigravityCredits: ['quotaAntigravityCredits'],
  pluginsEnabled: ['pluginsEnabled'],
  antigravitySensitiveWords: ['antigravitySensitiveWords'],
  devinSensitiveWords: ['devinSensitiveWords'],
  antigravitySensitiveReplacements: ['antigravitySensitiveReplacements'],
  devinSensitiveReplacements: ['devinSensitiveReplacements'],
  antigravitySignatureCacheEnabled: ['antigravitySignatureCacheEnabled'],
  antigravitySignatureBypassStrict: ['antigravitySignatureBypassStrict'],
  claudeHeaderUserAgent: ['claudeHeaderUserAgent'],
  claudeHeaderPackageVersion: ['claudeHeaderPackageVersion'],
  claudeHeaderRuntimeVersion: ['claudeHeaderRuntimeVersion'],
  claudeHeaderOs: ['claudeHeaderOs'],
  claudeHeaderArch: ['claudeHeaderArch'],
  claudeHeaderTimeout: ['claudeHeaderTimeout'],
  claudeHeaderStabilizeDeviceProfile: ['claudeHeaderStabilizeDeviceProfile'],
  codexHeaderUserAgent: ['codexHeaderUserAgent'],
  codexHeaderBetaFeatures: ['codexHeaderBetaFeatures'],
  // ── payload ───────────────────────────────────────────────────────────────
  payloadDefaultRules: ['payloadDefaultRules'],
  payloadDefaultRawRules: ['payloadDefaultRawRules'],
  payloadOverrideRules: ['payloadOverrideRules'],
  payloadOverrideRawRules: ['payloadOverrideRawRules'],
  payloadFilterRules: ['payloadFilterRules'],
  payloadReplaceRules: ['payloadReplaceRules'],
};

/** localStorage 键：mode 沿用旧键（'visual' | 'source' 值域不变）；section 为新键。 */
export const CONFIG_MODE_STORAGE_KEY = 'config-management:tab';
export const CONFIG_SECTION_STORAGE_KEY = 'config-management:section';
/** 旧「简单/完整」双模式的持久化键，模式轴已删除；挂载时清理。 */
export const LEGACY_EDITOR_MODE_STORAGE_KEY = 'config-management:editor-mode';
