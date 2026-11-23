import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Cancel01Icon, Download04Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  DISABLE_ALL_RULE,
  ExcludedModelsPicker,
  formatExcludedRulesText,
  parseExcludedRulesText,
  type ExcludedModelsCatalogState,
} from '@/components/excludedModels';
import { hasDisableAllModelsRule } from '@/components/providers/utils';
import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import type { ModelInfo } from '@/utils/models';
import { PROVIDER_DESCRIPTORS } from '../../descriptors';
import { mergeDiscoveredModels } from '../../modelEntries';
import type {
  ApiKeyEntryInput,
  ModelEntryInput,
  ProviderBrand,
  ProviderEntryFormInput,
  ProviderResource,
} from '../../types';
import { useConnectivityTest, type ConnectivityErrorMessages } from './useConnectivityTest';
import { useModelDiscovery } from './useModelDiscovery';
import { ModelDiscoveryPanel } from './ModelDiscoveryPanel';
import { ConnectivityStatusIcon } from './ConnectivityStatusIcon';
import { ApiKeyEntriesEditor } from './ApiKeyEntriesEditor';
import { ModelEntriesEditor } from './ModelEntriesEditor';
import { FormSection } from './FormSection';
import { FormError, FormSelect, NO_SPINNER, SecretInput, SwitchField } from './FormControls';
import { MAX_CREDENTIAL_WEIGHT } from '@/utils/credentialWeight';
import { readRuntimePolicy, validateRuntimePolicy } from '../../runtimePolicy';
import { readModelOptions, validateModelOptions } from '../../modelOptions';
import { RuntimePolicyEditor } from './RuntimePolicyEditor';
import { ProviderBehaviorEditor } from './ProviderBehaviorEditor';
import { pickProviderBehavior } from '../../providerBehavior';
import { Hint } from '@/components/ui/tooltip';

/** 模块级常量，免得每次渲染都给 picker 一个新数组引用。 */
const DISABLE_ALL_RULES = [DISABLE_ALL_RULE];

interface BaseProviderFormProps {
  brand: ProviderBrand;
  resource: ProviderResource | null;
  mode: 'create' | 'edit';
  mutating: boolean;
  formId: string;
  onSubmit: (input: ProviderEntryFormInput) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  /** Reports whether every required field is filled, so the submit button can wait for them. */
  onReadyChange?: (ready: boolean) => void;
}

const emptyHeader = () => ({ key: '', value: '' });
const emptyModel = (): ModelEntryInput => ({ name: '', alias: '' });
const emptyApiKeyEntry = (): ApiKeyEntryInput => ({
  apiKey: '',
  proxyUrl: '',
  weight: undefined,
});
const META_API_BASE_URL = 'https://api.meta.ai/v1';
const XAI_API_BASE_URL = 'https://api.x.ai/v1';

const stripDisableAllRule = (list?: string[]): string[] =>
  (list ?? []).filter((s) => s.trim() !== '*');

const formatJsonObject = (value?: Record<string, unknown>): string => {
  if (!value || Object.keys(value).length === 0) return '';
  return JSON.stringify(value, null, 2);
};

const isClaudeLikeBrand = (brand: ProviderBrand): boolean => brand === 'claude';

function buildInitialForm(
  brand: ProviderBrand,
  resource: ProviderResource | null,
  mode: 'create' | 'edit'
): ProviderEntryFormInput {
  if (mode === 'create' || !resource) {
    return {
      apiKey: '',
      name: '',
      baseUrl: brand === 'meta' ? META_API_BASE_URL : brand === 'xai' ? XAI_API_BASE_URL : '',
      proxyUrl: '',
      prefix: '',
      disabled: false,
      disableCooling: undefined,
      runtimePolicy: readRuntimePolicy(),
      priority: undefined,
      weight: undefined,
      models: [emptyModel()],
      headers: [emptyHeader()],
      excludedModelsText: '',
      websockets: brand === 'codex' || brand === 'xai' ? false : undefined,
      cloak: isClaudeLikeBrand(brand)
        ? { mode: '', strictMode: false, sensitiveWordsText: '', cacheUserId: false }
        : undefined,
      fingerprintProfile: isClaudeLikeBrand(brand) ? '' : undefined,
      testModel:
        brand === 'openaiCompatibility' ||
        brand === 'codex' ||
        brand === 'meta' ||
        brand === 'xai' ||
        isClaudeLikeBrand(brand) ||
        brand === 'gemini' ||
        brand === 'interactions'
          ? ''
          : undefined,
      apiKeyEntries: brand === 'openaiCompatibility' ? [emptyApiKeyEntry()] : undefined,
    };
  }

  const raw = resource.raw;
  if (brand === 'openaiCompatibility') {
    const cfg = raw as OpenAIProviderConfig;
    return {
      apiKey: '',
      name: cfg.name ?? '',
      baseUrl: cfg.baseUrl ?? '',
      proxyUrl: '',
      prefix: cfg.prefix ?? '',
      disabled: cfg.disabled === true,
      disableCooling: cfg.disableCooling,
      runtimePolicy: readRuntimePolicy(cfg),
      ...pickProviderBehavior(cfg, brand),
      priority: cfg.priority,
      models: cfg.models?.length
        ? cfg.models.map((m) => ({
            sourceIndex: m.sourceIndex,
            name: m.name,
            alias: m.alias ?? '',
            priority: m.priority,
            image: m.image === true,
            thinkingJson: formatJsonObject(m.thinking),
            ...readModelOptions(m),
          }))
        : [emptyModel()],
      headers: cfg.headers
        ? Object.entries(cfg.headers).map(([k, v]) => ({ key: k, value: String(v) }))
        : [emptyHeader()],
      excludedModelsText: '',
      testModel: '',
      apiKeyEntries: cfg.apiKeyEntries?.length
        ? cfg.apiKeyEntries.map((entry) => ({
            apiKey: '',
            existingApiKey: entry.apiKey,
            sourceIndex: entry.sourceIndex,
            proxyUrl: entry.proxyUrl ?? '',
            weight: entry.weight,
            authIndex: entry.authIndex,
          }))
        : [emptyApiKeyEntry()],
    };
  }

  const cfg = raw as GeminiKeyConfig & ProviderKeyConfig;
  const disabled = hasDisableAllModelsRule(cfg.excludedModels);
  const excludedList = stripDisableAllRule(cfg.excludedModels);
  return {
    // Keep the API key blank in edit mode. Pre-filling the real key makes this
    // password field a browser-autofill target (the saved management key can
    // overwrite it) and defeats the "leave empty = keep unchanged" contract; an
    // empty field is preserved on save via buildProviderKeyConfig's existing fallback.
    apiKey: '',
    name: '',
    baseUrl: cfg.baseUrl ?? '',
    proxyUrl: cfg.proxyUrl ?? '',
    prefix: cfg.prefix ?? '',
    disabled,
    disableCooling: cfg.disableCooling,
    runtimePolicy: readRuntimePolicy(cfg),
    ...pickProviderBehavior(cfg, brand),
    priority: cfg.priority,
    weight: cfg.weight,
    models: cfg.models?.length
      ? cfg.models.map((m) => ({
          sourceIndex: m.sourceIndex,
          name: m.name,
          alias: m.alias ?? '',
          priority: m.priority,
          thinkingJson: formatJsonObject(m.thinking),
          ...readModelOptions(m),
        }))
      : [emptyModel()],
    headers: cfg.headers
      ? Object.entries(cfg.headers).map(([k, v]) => ({ key: k, value: String(v) }))
      : [emptyHeader()],
    excludedModelsText: excludedList.join('\n'),
    websockets:
      brand === 'codex' || brand === 'xai'
        ? (cfg as ProviderKeyConfig).websockets === true
        : undefined,
    cloak: isClaudeLikeBrand(brand)
      ? {
          mode: (cfg as ProviderKeyConfig).cloak?.mode ?? '',
          strictMode: (cfg as ProviderKeyConfig).cloak?.strictMode === true,
          sensitiveWordsText: (cfg as ProviderKeyConfig).cloak?.sensitiveWords?.join('\n') ?? '',
          cacheUserId: (cfg as ProviderKeyConfig).cloak?.cacheUserId === true,
        }
      : undefined,
    fingerprintProfile: isClaudeLikeBrand(brand)
      ? ((cfg as ProviderKeyConfig).fingerprintProfile ?? '')
      : undefined,
    testModel:
      brand === 'codex' ||
      brand === 'meta' ||
      brand === 'xai' ||
      isClaudeLikeBrand(brand) ||
      brand === 'gemini' ||
      brand === 'interactions'
        ? ''
        : undefined,
  };
}

export function BaseProviderForm({
  brand,
  resource,
  mode,
  mutating,
  formId,
  onSubmit,
  onDirtyChange,
  onReadyChange,
}: BaseProviderFormProps) {
  const { t } = useTranslation();
  const descriptor = PROVIDER_DESCRIPTORS[brand];
  const fid = useId();
  const [form, setForm] = useState<ProviderEntryFormInput>(() =>
    buildInitialForm(brand, resource, mode)
  );
  const [initialFormSignature] = useState<string>(() =>
    JSON.stringify(buildInitialForm(brand, resource, mode))
  );
  const [error, setError] = useState<string | null>(null);
  const [showSingleApiKey, setShowSingleApiKey] = useState(false);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== initialFormSignature,
    [form, initialFormSignature]
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // validate() still checks these on submit and names the missing one.
  const missingRequired =
    (descriptor.supportsName && !form.name.trim()) ||
    (descriptor.supportsApiKey && mode === 'create' && !form.apiKey.trim()) ||
    (descriptor.baseUrlRequired && !form.baseUrl.trim());
  useEffect(() => {
    onReadyChange?.(!missingRequired);
  }, [missingRequired, onReadyChange]);

  const fallbackApiKey = useMemo(() => {
    if (mode !== 'edit' || !resource) return '';
    if (brand === 'openaiCompatibility') return '';
    return (resource.raw as { apiKey?: string } | undefined)?.apiKey ?? '';
  }, [brand, mode, resource]);

  const fallbackAuthIndex = useMemo(() => {
    if (mode !== 'edit' || !resource) return '';
    return (resource.raw as { authIndex?: string } | undefined)?.authIndex ?? '';
  }, [mode, resource]);

  const connectivityMessages = useMemo<ConnectivityErrorMessages>(
    () => ({
      baseUrlRequired: t('providersPage.connectivity.baseUrlRequired'),
      endpointInvalid: t('providersPage.connectivity.endpointInvalid'),
      apiKeyRequired: t('providersPage.connectivity.apiKeyRequired'),
      modelRequired: t('providersPage.connectivity.modelRequired'),
      timeout: (seconds: number) => t('providersPage.connectivity.timeout', { seconds }),
      requestFailed: t('providersPage.connectivity.requestFailed'),
    }),
    [t]
  );

  const connectivity = useConnectivityTest(
    {
      brand,
      baseUrl: form.baseUrl,
      proxyUrl: form.proxyUrl,
      testModel: form.testModel,
      models: form.models,
      formHeaders: form.headers,
      apiKeyEntries: form.apiKeyEntries,
      apiKey: form.apiKey,
      fallbackApiKey,
      authIndex: fallbackAuthIndex,
    },
    connectivityMessages
  );

  const discovery = useModelDiscovery({
    brand,
    baseUrl: form.baseUrl,
    proxyUrl: form.proxyUrl,
    formHeaders: form.headers,
    apiKeyEntries: form.apiKeyEntries,
    apiKey: form.apiKey,
    fallbackApiKey,
    authIndex: fallbackAuthIndex,
  });
  const [discoveryOpen, setDiscoveryOpen] = useState(false);

  const existingModelNames = useMemo(() => {
    const set = new Set<string>();
    form.models.forEach((m) => {
      const name = (m.name ?? '').trim();
      if (name) set.add(name);
    });
    return set;
  }, [form.models]);

  const testModelOptions = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    form.models.forEach((m) => {
      const name = (m.name ?? '').trim();
      if (!name || seen.has(name)) return;
      seen.add(name);
      names.push(name);
    });
    const firstName = names[0];
    const autoLabel = firstName
      ? t('providersPage.form.testModelAutoWith', { name: firstName })
      : t('providersPage.form.testModelAutoEmpty');
    const opts: Array<{ value: string; label: string }> = [{ value: '', label: autoLabel }];
    names.forEach((n) => opts.push({ value: n, label: n }));
    const tm = (form.testModel ?? '').trim();
    if (tm && !seen.has(tm)) {
      opts.push({
        value: tm,
        label: t('providersPage.form.testModelCustom', { name: tm }),
      });
    }
    return opts;
  }, [form.models, form.testModel, t]);

  const openDiscovery = () => {
    setDiscoveryOpen(true);
    if (!discovery.loading && !discovery.hasFetched) {
      void discovery.fetch();
    }
  };

  const closeDiscovery = () => {
    setDiscoveryOpen(false);
  };

  const applyDiscoveredModels = (incoming: ModelInfo[]) => {
    if (!incoming.length) return;
    setForm((prev) => ({ ...prev, models: mergeDiscoveredModels(prev.models, incoming) }));
  };

  const updateField = <K extends keyof ProviderEntryFormInput>(
    key: K,
    value: ProviderEntryFormInput[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateCloak = <K extends keyof NonNullable<ProviderEntryFormInput['cloak']>>(
    key: K,
    value: NonNullable<ProviderEntryFormInput['cloak']>[K]
  ) => {
    setForm((prev) => ({
      ...prev,
      cloak: {
        ...(prev.cloak ?? {
          mode: '',
          strictMode: false,
          sensitiveWordsText: '',
          cacheUserId: false,
        }),
        [key]: value,
      },
    }));
  };

  const validate = (): string | null => {
    const modelError = validateModelOptions(form.models);
    if (modelError) return t(modelError);
    if (form.runtimePolicy) {
      const policyError = validateRuntimePolicy(
        form.runtimePolicy,
        descriptor.supportsRequestScopedErrors
      );
      if (policyError) return t(policyError);
    }
    if (descriptor.supportsName && !form.name.trim()) {
      return t('providersPage.form.validation.nameRequired');
    }
    if (descriptor.supportsApiKey && mode === 'create' && !form.apiKey.trim()) {
      return t('providersPage.form.validation.apiKeyRequired');
    }
    if (descriptor.baseUrlRequired && !form.baseUrl.trim()) {
      return t('providersPage.form.validation.baseUrlRequired');
    }
    const weights = [
      ...(brand === 'openaiCompatibility'
        ? (form.apiKeyEntries ?? []).map((entry) => entry.weight)
        : []),
      ...(brand !== 'openaiCompatibility' ? [form.weight] : []),
    ];
    if (weights.some((weight) => weight !== undefined && !Number.isSafeInteger(weight))) {
      return t('providersPage.form.validation.weightInteger');
    }
    if (weights.some((weight) => weight !== undefined && weight > MAX_CREDENTIAL_WEIGHT)) {
      return t('providersPage.form.validation.weightMax', { max: MAX_CREDENTIAL_WEIGHT });
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    try {
      setError(null);
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  /* ------------------ entries helpers ------------------ */

  const headersList = useMemo(
    () => (form.headers.length ? form.headers : [emptyHeader()]),
    [form.headers]
  );
  const modelsList = useMemo(
    () => (form.models.length ? form.models : [emptyModel()]),
    [form.models]
  );
  const apiKeyEntries = useMemo(
    () =>
      form.apiKeyEntries && form.apiKeyEntries.length ? form.apiKeyEntries : [emptyApiKeyEntry()],
    [form.apiKeyEntries]
  );

  const excludedRules = useMemo(
    () => parseExcludedRulesText(form.excludedModelsText),
    [form.excludedModelsText]
  );
  /**
   * 候选目录 = discovery 发现的模型 ∪ 表单里已配置的模型名。
   *
   * 两者都可能为空——`vertex` 支持排除模型却不在 MODEL_DISCOVERY_BRANDS 里，永远没有
   * discovery；其余 brand 在用户手动跑一次发现之前也没有。因此**无目录是常态**，
   * picker 必须能在没有目录时退化成纯规则编辑器。
   */
  const excludedCandidates = useMemo(() => {
    const byKey = new Map<string, { id: string; displayName?: string }>();
    discovery.models.forEach((model) => {
      const id = model.name?.trim();
      if (id) byKey.set(id.toLowerCase(), { id, displayName: model.alias || undefined });
    });
    form.models.forEach((model) => {
      const id = model.name?.trim();
      if (id && !byKey.has(id.toLowerCase())) byKey.set(id.toLowerCase(), { id });
    });
    return [...byKey.values()].sort((left, right) =>
      left.id.localeCompare(right.id, undefined, { sensitivity: 'base' })
    );
  }, [discovery.models, form.models]);
  const excludedCatalogState: ExcludedModelsCatalogState = discovery.loading
    ? 'loading'
    : discovery.error
      ? 'error'
      : excludedCandidates.length === 0
        ? 'unavailable'
        : 'ready';
  const actualApiKeyEntries = form.apiKeyEntries ?? [];
  const supportsModelImage = brand === 'openaiCompatibility';
  const singleConnectivity =
    brand === 'codex' || brand === 'meta' || brand === 'xai'
      ? { status: connectivity.codexStatus, run: connectivity.runCodex }
      : brand === 'gemini' || brand === 'interactions'
        ? { status: connectivity.geminiStatus, run: connectivity.runGemini }
        : isClaudeLikeBrand(brand)
          ? { status: connectivity.claudeStatus, run: connectivity.runClaude }
          : null;

  const updateModelEntry = (idx: number, patch: Partial<ModelEntryInput>) => {
    updateField(
      'models',
      modelsList.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );
  };

  const removeModelEntry = (idx: number) => {
    updateField(
      'models',
      modelsList.filter((_, i) => i !== idx)
    );
  };

  const connectivityState = singleConnectivity?.status.state ?? 'idle';

  return (
    <form id={formId} className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
      <FieldGroup>
        {descriptor.supportsName ? (
          <Field>
            <FieldLabel htmlFor={`${fid}-name`}>{t('providersPage.form.name')}</FieldLabel>
            <Input
              id={`${fid}-name`}
              className="h-9"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              disabled={mutating}
            />
          </Field>
        ) : null}

        {descriptor.supportsApiKey ? (
          <Field>
            <FieldLabel htmlFor={`${fid}-apiKey`}>{t('providersPage.form.apiKey')}</FieldLabel>
            <SecretInput
              id={`${fid}-apiKey`}
              className="h-9"
              value={form.apiKey}
              onValueChange={(value) => updateField('apiKey', value)}
              visible={showSingleApiKey}
              onVisibleChange={setShowSingleApiKey}
              placeholder={
                mode === 'edit'
                  ? t('providersPage.form.apiKeyEditPlaceholder')
                  : t('providersPage.form.apiKeyCreatePlaceholder')
              }
              disabled={mutating}
            />
          </Field>
        ) : null}

        {descriptor.supportsBaseUrl ? (
          <Field>
            <FieldLabel htmlFor={`${fid}-baseUrl`}>{t('providersPage.form.baseUrl')}</FieldLabel>
            <Input
              id={`${fid}-baseUrl`}
              className="h-9 font-mono placeholder:font-sans"
              value={form.baseUrl}
              onChange={(e) => updateField('baseUrl', e.target.value)}
              placeholder="https://api.example.com"
              aria-describedby={descriptor.baseUrlRequired ? `${fid}-baseUrl-hint` : undefined}
              disabled={mutating}
            />
            {descriptor.baseUrlRequired ? (
              <FieldDescription id={`${fid}-baseUrl-hint`}>
                {t('providersPage.form.baseUrlRequiredHint')}
              </FieldDescription>
            ) : null}
          </Field>
        ) : null}

        {descriptor.supportsProxyUrl ? (
          <Field>
            <FieldLabel htmlFor={`${fid}-proxy`}>{t('providersPage.form.proxyUrl')}</FieldLabel>
            <Input
              id={`${fid}-proxy`}
              className="h-9 font-mono placeholder:font-sans"
              value={form.proxyUrl}
              onChange={(e) => updateField('proxyUrl', e.target.value)}
              placeholder="http://127.0.0.1:7890"
              disabled={mutating}
            />
          </Field>
        ) : null}

        {descriptor.supportsPrefix ? (
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
            <Field>
              <FieldLabel htmlFor={`${fid}-prefix`}>{t('providersPage.form.prefix')}</FieldLabel>
              <Input
                id={`${fid}-prefix`}
                className="h-9"
                value={form.prefix}
                onChange={(e) => updateField('prefix', e.target.value)}
                disabled={mutating}
              />
            </Field>
            {descriptor.supportsPriority ? (
              <Field>
                <FieldLabel htmlFor={`${fid}-prio`}>{t('providersPage.form.priority')}</FieldLabel>
                <Input
                  id={`${fid}-prio`}
                  type="number"
                  className={cn('h-9', NO_SPINNER)}
                  value={form.priority ?? ''}
                  onChange={(e) =>
                    updateField(
                      'priority',
                      e.target.value === '' ? undefined : Number(e.target.value)
                    )
                  }
                  disabled={mutating}
                />
              </Field>
            ) : null}
          </div>
        ) : null}

        {brand !== 'openaiCompatibility' ? (
          <Field>
            <FieldLabel htmlFor={`${fid}-weight`}>{t('providersPage.form.weight')}</FieldLabel>
            <Input
              id={`${fid}-weight`}
              type="number"
              step="1"
              max={MAX_CREDENTIAL_WEIGHT}
              className={cn('h-9', NO_SPINNER)}
              value={form.weight ?? ''}
              placeholder="1"
              aria-describedby={`${fid}-weight-hint`}
              onChange={(e) =>
                updateField('weight', e.target.value === '' ? undefined : Number(e.target.value))
              }
              disabled={mutating}
            />
            <FieldDescription id={`${fid}-weight-hint`}>
              {t('providersPage.form.weightHint')}
            </FieldDescription>
          </Field>
        ) : null}

        {descriptor.supportsTestModel ? (
          <Field>
            <FieldLabel htmlFor={`${fid}-testModel`}>
              {t('providersPage.form.testModel')}
            </FieldLabel>
            <div className="flex gap-2">
              <FormSelect
                id={`${fid}-testModel`}
                className="flex-1 data-[size=default]:h-9 max-sm:data-[size=default]:h-10"
                value={form.testModel ?? ''}
                options={testModelOptions}
                onChange={(value) => updateField('testModel', value)}
                disabled={mutating}
                ariaLabel={t('providersPage.form.testModel')}
                ariaDescribedBy={`${fid}-testModel-hint`}
              />
              {singleConnectivity ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-9 px-4"
                  disabled={mutating || connectivity.isTestingAny}
                  onClick={() => void singleConnectivity.run()}
                >
                  {t('providersPage.connectivity.test')}
                </Button>
              ) : null}
            </div>
            <FieldDescription id={`${fid}-testModel-hint`}>
              {t('providersPage.form.testModelHint')}
            </FieldDescription>
            {singleConnectivity && connectivityState !== 'idle' ? (
              <div
                role={connectivityState === 'error' ? 'alert' : 'status'}
                className="flex items-start gap-2 text-sm"
              >
                <span className="flex h-5 items-center">
                  <ConnectivityStatusIcon state={connectivityState} />
                </span>
                {connectivityState === 'success' ? (
                  <span className="text-success">{t('providersPage.connectivity.success')}</span>
                ) : null}
                {connectivityState === 'error' ? (
                  <span className="min-w-0 break-words text-destructive">
                    {singleConnectivity.status.message}
                  </span>
                ) : null}
              </div>
            ) : null}
          </Field>
        ) : null}

        {isClaudeLikeBrand(brand) ? (
          <Field>
            <FieldLabel htmlFor={`${fid}-fingerprint-profile`}>
              {t('providersPage.form.fingerprintProfile')}
            </FieldLabel>
            <FormSelect
              id={`${fid}-fingerprint-profile`}
              className="data-[size=default]:h-9 max-sm:data-[size=default]:h-10"
              value={form.fingerprintProfile ?? ''}
              options={[
                {
                  value: '',
                  label: t('providersPage.form.fingerprintProfileDefault'),
                },
                {
                  value: 'claude-code-cli',
                  label: t('providersPage.form.fingerprintProfileClaudeCodeCli'),
                },
              ]}
              onChange={(value) => updateField('fingerprintProfile', value)}
              disabled={mutating}
              ariaDescribedBy={`${fid}-fingerprint-profile-hint`}
            />
            <FieldDescription id={`${fid}-fingerprint-profile-hint`}>
              {t('providersPage.form.fingerprintProfileHint')}
            </FieldDescription>
          </Field>
        ) : null}

        {descriptor.supportsWebsockets ? (
          <SwitchField
            id={`${fid}-websockets`}
            label={t('providersPage.form.websockets')}
            checked={form.websockets ?? false}
            disabled={mutating}
            onCheckedChange={(checked) => updateField('websockets', checked)}
          />
        ) : null}

        {descriptor.supportsDisabled ? (
          <SwitchField
            id={`${fid}-disabled`}
            label={t('providersPage.form.disabled')}
            description={t('providersPage.form.disabledHint')}
            checked={form.disabled}
            disabled={mutating}
            onCheckedChange={(checked) => updateField('disabled', checked)}
          />
        ) : null}
      </FieldGroup>

      <div className="flex flex-col gap-3">
        <ProviderBehaviorEditor
          brand={brand}
          value={form}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          disabled={mutating}
        />
        <RuntimePolicyEditor
          value={form.runtimePolicy ?? readRuntimePolicy()}
          onChange={(value) => updateField('runtimePolicy', value)}
          disabled={mutating}
          supportsErrors={descriptor.supportsRequestScopedErrors}
        />

        {descriptor.supportsApiKeyEntries && form.apiKeyEntries ? (
          <FormSection
            label={t('providersPage.form.apiKeyEntriesSection')}
            hint={`${
              apiKeyEntries.filter((e) => e.apiKey.trim() || e.existingApiKey?.trim()).length
            }`}
            defaultOpen
          >
            <ApiKeyEntriesEditor
              entries={apiKeyEntries}
              removeDisabled={actualApiKeyEntries.length === 0}
              mutating={mutating}
              statuses={connectivity.openaiStatuses}
              isTestingAny={connectivity.isTestingAny}
              onUpdate={(idx, patch) =>
                updateField(
                  'apiKeyEntries',
                  apiKeyEntries.map((it, i) => (i === idx ? { ...it, ...patch } : it))
                )
              }
              onAdd={() => {
                const next = [...actualApiKeyEntries, emptyApiKeyEntry()];
                updateField('apiKeyEntries', next);
                return next.length - 1;
              }}
              onRemove={(idx) =>
                updateField(
                  'apiKeyEntries',
                  actualApiKeyEntries.filter((_, i) => i !== idx)
                )
              }
              onTest={(idx) => void connectivity.runOpenAIKey(idx)}
              onTestAll={() => void connectivity.runOpenAIAllKeys()}
            />
          </FormSection>
        ) : null}

        {descriptor.supportsHeaders ? (
          <FormSection label={t('providersPage.form.headersSection')}>
            <div className="flex flex-col gap-2">
              {headersList.map((entry, idx) => (
                <div key={idx} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                  <Input
                    className="font-mono placeholder:font-sans"
                    placeholder="X-Custom-Header"
                    aria-label={t('common.custom_headers_key_placeholder')}
                    value={entry.key}
                    onChange={(e) =>
                      updateField(
                        'headers',
                        headersList.map((it, i) =>
                          i === idx ? { ...it, key: e.target.value } : it
                        )
                      )
                    }
                    disabled={mutating}
                  />
                  <Input
                    className="font-mono placeholder:font-sans"
                    placeholder="value"
                    aria-label={t('common.custom_headers_value_placeholder')}
                    value={entry.value}
                    onChange={(e) =>
                      updateField(
                        'headers',
                        headersList.map((it, i) =>
                          i === idx ? { ...it, value: e.target.value } : it
                        )
                      )
                    }
                    disabled={mutating}
                  />
                  <Hint label={t('common.delete')}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={t('common.delete')}
                      disabled={mutating || headersList.length <= 1}
                      onClick={() =>
                        updateField(
                          'headers',
                          headersList.filter((_, i) => i !== idx)
                        )
                      }
                    >
                      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} />
                    </Button>
                  </Hint>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start max-sm:h-10"
                disabled={mutating}
                onClick={() => updateField('headers', [...headersList, emptyHeader()])}
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} />
                {t('providersPage.form.addHeader')}
              </Button>
            </div>
          </FormSection>
        ) : null}

        {descriptor.supportsModels ? (
          <FormSection
            label={t('providersPage.form.modelsSection')}
            hint={`${existingModelNames.size}`}
          >
            <div className="flex flex-col gap-3">
              {discovery.available ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start max-sm:h-10"
                  onClick={openDiscovery}
                  disabled={mutating}
                >
                  <HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} />
                  {t('providersPage.discovery.openButton')}
                </Button>
              ) : null}
              {discovery.available && discoveryOpen ? (
                <ModelDiscoveryPanel
                  loading={discovery.loading}
                  error={discovery.error}
                  models={discovery.models}
                  hasFetched={discovery.hasFetched}
                  existingNames={existingModelNames}
                  mutating={mutating}
                  onApply={(names) => {
                    applyDiscoveredModels(names);
                  }}
                  onReload={() => void discovery.fetch()}
                  onClose={closeDiscovery}
                />
              ) : null}
              <ModelEntriesEditor
                providerBrand={brand}
                models={modelsList}
                supportsImage={supportsModelImage}
                supportsThinking
                mutating={mutating}
                removeDisabled={modelsList.length <= 1}
                onUpdate={updateModelEntry}
                onAdd={() => updateField('models', [...modelsList, emptyModel()])}
                onRemove={removeModelEntry}
              />
            </div>
          </FormSection>
        ) : null}

        {descriptor.supportsExcludedModels ? (
          <FormSection label={t('providersPage.form.excludedSection')}>
            <ExcludedModelsPicker
              value={excludedRules}
              onChange={(next) => updateField('excludedModelsText', formatExcludedRulesText(next))}
              candidates={excludedCandidates}
              catalogState={excludedCatalogState}
              onRetryCatalog={discovery.available ? () => void discovery.fetch() : undefined}
              disabled={mutating}
              // `'*'` = 该 provider 已停用，唯一所有者是上面的 Disabled 开关。
              // 传进来后 picker 双向过滤它，用户手打 `*` 也会被拦下并解释原因。
              reservedRules={DISABLE_ALL_RULES}
              reservedRuleMessage={t('providersPage.form.excludedDisabledNote')}
            />
          </FormSection>
        ) : null}

        {descriptor.supportsCloak && form.cloak ? (
          <FormSection label={t('providersPage.form.cloakSection')}>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor={`${fid}-cloak-mode`}>
                  {t('providersPage.form.cloakMode')}
                </FieldLabel>
                <Input
                  id={`${fid}-cloak-mode`}
                  value={form.cloak.mode}
                  onChange={(e) => updateCloak('mode', e.target.value)}
                  placeholder="auto / always / never"
                  disabled={mutating}
                />
              </Field>
              <SwitchField
                id={`${fid}-cloak-strict`}
                label={t('providersPage.form.cloakStrict')}
                checked={form.cloak.strictMode}
                disabled={mutating}
                onCheckedChange={(checked) => updateCloak('strictMode', checked)}
              />
              <SwitchField
                id={`${fid}-cloak-cache-user-id`}
                label={t('providersPage.form.cloakCacheUserId')}
                description={t('providersPage.form.cloakCacheUserIdHint')}
                checked={form.cloak.cacheUserId}
                disabled={mutating}
                onCheckedChange={(checked) => updateCloak('cacheUserId', checked)}
              />
              <Field>
                <FieldLabel htmlFor={`${fid}-cloak-words`}>
                  {t('providersPage.form.cloakSensitiveWords')}
                </FieldLabel>
                <Textarea
                  id={`${fid}-cloak-words`}
                  className="font-mono placeholder:font-sans"
                  rows={3}
                  value={form.cloak.sensitiveWordsText}
                  onChange={(e) => updateCloak('sensitiveWordsText', e.target.value)}
                  disabled={mutating}
                />
              </Field>
            </FieldGroup>
          </FormSection>
        ) : null}
      </div>

      {error ? <FormError>{error}</FormError> : null}
    </form>
  );
}
