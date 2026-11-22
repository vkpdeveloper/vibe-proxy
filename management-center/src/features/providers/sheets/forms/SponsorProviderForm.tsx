import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  Alert02Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  DollarCircleIcon,
  Download04Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { hasDisableAllModelsRule } from '@/components/providers/utils';
import { maskApiKey } from '@/utils/format';
import { MAX_CREDENTIAL_WEIGHT } from '@/utils/credentialWeight';
import { mergeDiscoveredModels } from '../../modelEntries';
import type { ApiKeyFunUsageSummary } from '../../sponsor';
import { isSponsorPartialMutationError } from '../../sponsorMutationRecovery';
import {
  discoveryBrandForSponsorProtocol,
  getSponsorAggregationConflict,
  getSponsorProviderDefinition,
  sponsorProtocolI18nKey,
  sponsorProtocolModelI18nKey,
  sponsorProtocolUrl,
  type SponsorProviderDefinition,
} from '../../sponsorDefinitions';
import type {
  ModelEntryInput,
  ProviderEntryFormInput,
  ProviderResource,
  SponsorKeyEntryInput,
  SponsorProtocol,
  SponsorProviderBrand,
  SponsorProviderRaw,
} from '../../types';
import { ModelDiscoveryPanel } from './ModelDiscoveryPanel';
import { ModelEntriesEditor } from './ModelEntriesEditor';
import { useModelDiscovery, type UseModelDiscoveryResult } from './useModelDiscovery';
import { useSponsorUsageCheck, type SponsorUsageMessages } from './useSponsorUsageCheck';
import { FormSection } from './FormSection';
import { FormError, FormSelect, SecretInput, SwitchField } from './FormControls';
import { readRuntimePolicy, validateRuntimePolicy } from '../../runtimePolicy';
import { readModelOptions, validateModelOptions } from '../../modelOptions';
import type { ModelAlias } from '@/types';
import { RuntimePolicyEditor } from './RuntimePolicyEditor';
import { ProviderBehaviorEditor } from './ProviderBehaviorEditor';
import { pickProviderBehavior } from '../../providerBehavior';
import { Hint } from '@/components/ui/tooltip';

interface SponsorProviderFormProps {
  brand?: SponsorProviderBrand;
  resource: ProviderResource | null;
  mode: 'create' | 'edit';
  mutating: boolean;
  formId: string;
  onSubmit: (input: ProviderEntryFormInput) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

interface SponsorModelSectionProps {
  label: string;
  description: string;
  protocol: SponsorProtocol;
  models: ModelEntryInput[];
  discovery: UseModelDiscoveryResult;
  mutating: boolean;
  onChange: (next: ModelEntryInput[]) => void;
}

interface SponsorKeyEntryCardProps {
  entry: SponsorKeyEntryInput;
  index: number;
  formId: string;
  mode: 'create' | 'edit';
  definition: SponsorProviderDefinition;
  usedProtocols: Set<SponsorProtocol>;
  canRemove: boolean;
  mutating: boolean;
  onChange: (entry: SponsorKeyEntryInput) => void;
  onRemove: () => void;
}

const emptyModel = (): ModelEntryInput => ({ name: '', alias: '' });

const emptySponsorKeyEntry = (
  definition: SponsorProviderDefinition,
  protocol: SponsorProtocol = definition.defaultProtocol
): SponsorKeyEntryInput => ({
  protocol,
  apiKey: '',
  existingApiKey: '',
  baseUrl: definition.baseUrlOptions[0]?.baseUrl ?? '',
  proxyUrl: '',
  prefix: '',
  disabled: false,
  disableCooling: undefined,
  runtimePolicy: readRuntimePolicy(),
  priority: undefined,
  weight: undefined,
  models: [emptyModel()],
});

const emptySponsorForm = (definition: SponsorProviderDefinition): ProviderEntryFormInput => ({
  apiKey: '',
  name: '',
  baseUrl: '',
  proxyUrl: '',
  prefix: '',
  disabled: false,
  disableCooling: undefined,
  priority: undefined,
  weight: undefined,
  models: [],
  headers: [],
  excludedModelsText: '',
  sponsorKeyEntries: [emptySponsorKeyEntry(definition)],
});

const getSponsorRaw = (
  resource: ProviderResource | null,
  brand: SponsorProviderBrand
): SponsorProviderRaw | null => {
  if (!resource || resource.brand !== brand) return null;
  return resource.raw as SponsorProviderRaw;
};

const protocolUrlForEntry = (
  entry: SponsorKeyEntryInput,
  definition: SponsorProviderDefinition
): string => sponsorProtocolUrl(definition.getProtocolUrls(entry.baseUrl), entry.protocol);

const formatUsageAmount = (value: ApiKeyFunUsageSummary['remaining'], locale: string): string => {
  if (value === null) return '--';
  if (typeof value === 'number') {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 6,
    }).format(value);
  }
  return value;
};

const isHealthyUsageSummary = (summary: ApiKeyFunUsageSummary): boolean => {
  const normalizedStatus = (summary.status ?? '').trim().toLowerCase();
  return summary.isValid && (!normalizedStatus || normalizedStatus === 'active');
};

const modelsFromConfig = (models: ModelAlias[] | undefined): ModelEntryInput[] =>
  models?.length
    ? models.map((model) => ({
        sourceIndex: model.sourceIndex,
        name: model.name ?? '',
        alias: model.alias ?? '',
        priority: model.priority,
        image: model.image === true,
        thinkingJson: model.thinking ? JSON.stringify(model.thinking, null, 2) : '',
        ...readModelOptions(model),
      }))
    : [emptyModel()];

const sponsorEntryFromProviderKey = (
  definition: SponsorProviderDefinition,
  protocol: Exclude<SponsorProtocol, 'openai'>,
  config:
    | SponsorProviderRaw['codex'][number]['config']
    | SponsorProviderRaw['claude'][number]['config']
    | SponsorProviderRaw['gemini'][number]['config']
): SponsorKeyEntryInput => ({
  ...emptySponsorKeyEntry(definition, protocol),
  existingApiKey: config.apiKey ?? '',
  baseUrl: definition.resolveBaseUrl(config.baseUrl),
  proxyUrl: config.proxyUrl ?? '',
  prefix: config.prefix ?? '',
  disabled: hasDisableAllModelsRule(config.excludedModels),
  disableCooling: config.disableCooling,
  runtimePolicy: readRuntimePolicy(config),
  ...pickProviderBehavior(config, protocol),
  priority: config.priority,
  weight: config.weight,
  models: modelsFromConfig(config.models),
});

const sponsorEntryFromOpenAI = (
  definition: SponsorProviderDefinition,
  config: SponsorProviderRaw['openai'][number]['config']
): SponsorKeyEntryInput => {
  const firstEntry = config.apiKeyEntries?.find((entry) => entry.apiKey?.trim());
  return {
    ...emptySponsorKeyEntry(definition, 'openai'),
    existingApiKey: firstEntry?.apiKey ?? '',
    baseUrl: definition.resolveBaseUrl(config.baseUrl),
    proxyUrl: firstEntry?.proxyUrl ?? '',
    prefix: config.prefix ?? '',
    disabled: config.disabled === true,
    disableCooling: config.disableCooling,
    runtimePolicy: readRuntimePolicy(config),
    ...pickProviderBehavior(config, 'openaiCompatibility'),
    priority: config.priority,
    weight: firstEntry?.weight,
    models: modelsFromConfig(config.models),
  };
};

const sponsorKeyEntriesFromRaw = (
  raw: SponsorProviderRaw | null,
  definition: SponsorProviderDefinition
): SponsorKeyEntryInput[] => {
  if (!raw) return [emptySponsorKeyEntry(definition)];
  const entries = definition.protocols.flatMap((protocol): SponsorKeyEntryInput[] => {
    if (protocol === 'openai') {
      const openai = raw.openai[0]?.config;
      return openai ? [sponsorEntryFromOpenAI(definition, openai)] : [];
    }
    const config = raw[protocol][0]?.config;
    return config ? [sponsorEntryFromProviderKey(definition, protocol, config)] : [];
  });
  return entries.length ? entries : [emptySponsorKeyEntry(definition)];
};

function SponsorModelSection({
  label,
  description,
  protocol,
  models,
  discovery,
  mutating,
  onChange,
}: SponsorModelSectionProps) {
  const { t } = useTranslation();
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const modelsList = useMemo(() => (models.length ? models : [emptyModel()]), [models]);
  const existingModelNames = useMemo(() => {
    const set = new Set<string>();
    modelsList.forEach((model) => {
      const name = (model.name ?? '').trim();
      if (name) set.add(name);
    });
    return set;
  }, [modelsList]);

  const openDiscovery = () => {
    setDiscoveryOpen(true);
    if (!discovery.loading && !discovery.hasFetched) {
      void discovery.fetch();
    }
  };

  return (
    <FormSection label={label}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={openDiscovery}
          disabled={mutating}
        >
          <HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} />
          {t('providersPage.discovery.openButton')}
        </Button>
        {discoveryOpen ? (
          <ModelDiscoveryPanel
            loading={discovery.loading}
            error={discovery.error}
            models={discovery.models}
            hasFetched={discovery.hasFetched}
            existingNames={existingModelNames}
            mutating={mutating}
            onApply={(picked) => onChange(mergeDiscoveredModels(modelsList, picked))}
            onReload={() => void discovery.fetch()}
            onClose={() => setDiscoveryOpen(false)}
          />
        ) : null}
        <ModelEntriesEditor
          providerBrand={protocol === 'openai' ? 'openaiCompatibility' : protocol}
          models={modelsList}
          supportsImage={protocol === 'openai'}
          supportsThinking
          mutating={mutating}
          removeDisabled={modelsList.length <= 1}
          onUpdate={(modelIndex, patch) =>
            onChange(
              modelsList.map((item, itemIndex) =>
                itemIndex === modelIndex ? { ...item, ...patch } : item
              )
            )
          }
          onAdd={() => onChange([...modelsList, emptyModel()])}
          onRemove={(modelIndex) => {
            const next = modelsList.filter((_, itemIndex) => itemIndex !== modelIndex);
            onChange(next.length ? next : [emptyModel()]);
          }}
        />
      </div>
    </FormSection>
  );
}

function SponsorKeyEntryCard({
  entry,
  index,
  formId,
  mode,
  definition,
  usedProtocols,
  canRemove,
  mutating,
  onChange,
  onRemove,
}: SponsorKeyEntryCardProps) {
  const { t, i18n } = useTranslation();
  const [showApiKey, setShowApiKey] = useState(false);
  const [expanded, setExpanded] = useState(
    () => mode === 'create' || !entry.existingApiKey?.trim()
  );
  const endpointUrl = protocolUrlForEntry(entry, definition);
  const protocolLabel = t(
    `providersPage.sponsor.protocols.${sponsorProtocolI18nKey(entry.protocol)}`
  );
  const titleLabel = t('providersPage.sponsor.groupedKey', { index: index + 1 });
  const summaryKey = entry.apiKey.trim() || entry.existingApiKey?.trim() || '';
  const summaryKeyLabel = summaryKey
    ? maskApiKey(summaryKey)
    : t('providersPage.status.notConfigured');
  const modelKey = sponsorProtocolModelI18nKey(entry.protocol);
  const usageMessages = useMemo<SponsorUsageMessages>(
    () => ({
      apiKeyRequired: t('providersPage.sponsor.usageApiKeyRequired'),
      emptyResponse: t('providersPage.sponsor.usageEmpty'),
      requestFailed: t('providersPage.connectivity.requestFailed'),
    }),
    [t]
  );
  const usageCheck = useSponsorUsageCheck(
    {
      baseUrl: entry.baseUrl,
      apiKey: entry.apiKey,
      fallbackApiKey: entry.existingApiKey,
    },
    usageMessages
  );
  const usageSummary = usageCheck.status.summary;
  const usageHealthy = usageSummary ? isHealthyUsageSummary(usageSummary) : true;
  const usageRemaining =
    usageSummary !== null ? formatUsageAmount(usageSummary.remaining, i18n.language) : '';
  const usageUsed =
    usageSummary !== null ? formatUsageAmount(usageSummary.used, i18n.language) : '';
  const usageLimit =
    usageSummary !== null ? formatUsageAmount(usageSummary.limit, i18n.language) : '';
  const discoveryHeaders = useMemo<Array<{ key: string; value: string }>>(() => [], []);
  const openaiDiscoveryEntries = useMemo(
    () => [
      {
        apiKey: entry.apiKey,
        existingApiKey: entry.existingApiKey,
        proxyUrl: entry.proxyUrl,
      },
    ],
    [entry.apiKey, entry.existingApiKey, entry.proxyUrl]
  );
  const discovery = useModelDiscovery({
    brand: discoveryBrandForSponsorProtocol(entry.protocol),
    baseUrl: endpointUrl,
    proxyUrl: entry.proxyUrl,
    formHeaders: discoveryHeaders,
    apiKey: entry.apiKey,
    fallbackApiKey: entry.existingApiKey,
    apiKeyEntries: entry.protocol === 'openai' ? openaiDiscoveryEntries : undefined,
  });
  const protocolOptions = definition.protocols
    .filter((protocol) => protocol === entry.protocol || !usedProtocols.has(protocol))
    .map((protocol) => ({
      value: protocol,
      label: t(`providersPage.sponsor.protocols.${sponsorProtocolI18nKey(protocol)}`),
    }));

  const updateEntry = (patch: Partial<SponsorKeyEntryInput>) => {
    onChange({ ...entry, ...patch });
  };

  const fieldId = (name: string) => `${formId}-group-${index}-${name}`;
  const resolvedBaseUrl = definition.resolveBaseUrl(entry.baseUrl);

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-1 py-1.5 pr-1.5 pl-3.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 py-1 text-left outline-none focus-visible:underline"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="flex max-w-full min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
            <span className="whitespace-nowrap text-muted-foreground">{titleLabel}</span>
            <span className="truncate font-medium">{protocolLabel}</span>
          </span>
          <span className="flex max-w-full min-w-0 items-center gap-2 font-mono text-xs">
            <span className="shrink-0 text-muted-foreground">{summaryKeyLabel}</span>
            <span className="truncate text-faint">{endpointUrl}</span>
          </span>
        </button>
        <Hint label={expanded ? t('common.collapse') : t('common.expand')}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? t('common.collapse') : t('common.expand')}
          >
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={1.75}
              className={cn(
                'transition-transform duration-200 ease-out motion-reduce:transition-none',
                expanded && 'rotate-180'
              )}
            />
          </Button>
        </Hint>
        <Hint label={t('providersPage.sponsor.removeGroupedKey')}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            disabled={mutating || !canRemove}
            aria-label={t('providersPage.sponsor.removeGroupedKey')}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} />
          </Button>
        </Hint>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-6 border-t p-3.5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={fieldId('protocol')}>
                {t('providersPage.sponsor.protocol')}
              </FieldLabel>
              <FormSelect
                id={fieldId('protocol')}
                className="data-[size=default]:h-9"
                value={entry.protocol}
                options={protocolOptions}
                onChange={(value) =>
                  updateEntry({ protocol: value as SponsorProtocol, models: [emptyModel()] })
                }
                disabled={mutating}
                ariaLabel={t('providersPage.sponsor.protocol')}
                ariaDescribedBy={fieldId('protocol-hint')}
              />
              <FieldDescription id={fieldId('protocol-hint')}>
                {t('providersPage.sponsor.protocolHint')}
              </FieldDescription>
            </Field>

            {definition.baseUrlOptions.length > 1 ? (
              <FieldSet className="gap-3">
                <FieldLegend variant="label" className="mb-0">
                  {t('providersPage.sponsor.urlMode', { provider: definition.displayName })}
                </FieldLegend>
                <RadioGroup
                  name={fieldId('base-url')}
                  value={resolvedBaseUrl}
                  onValueChange={(baseUrl) => updateEntry({ baseUrl })}
                  disabled={mutating}
                  aria-describedby={fieldId('base-url-hint')}
                >
                  {definition.baseUrlOptions.map((option) => (
                    <FieldLabel key={option.id} htmlFor={fieldId(`base-url-${option.id}`)}>
                      <Field orientation="horizontal">
                        <FieldContent className="min-w-0">
                          <FieldTitle>
                            {t(`providersPage.sponsor.urlOptions.${option.id}`)}
                          </FieldTitle>
                          <FieldDescription className="font-mono text-xs break-all">
                            {option.baseUrl}
                          </FieldDescription>
                          {option.descriptionKey ? (
                            <FieldDescription className="text-xs">
                              {t(
                                `providersPage.sponsor.urlOptionDescriptions.${option.descriptionKey}`
                              )}
                            </FieldDescription>
                          ) : null}
                        </FieldContent>
                        <RadioGroupItem
                          value={option.baseUrl}
                          id={fieldId(`base-url-${option.id}`)}
                        />
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
                <FieldDescription id={fieldId('base-url-hint')}>
                  {t('providersPage.sponsor.urlHint')}
                </FieldDescription>
              </FieldSet>
            ) : null}

            <div className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {t('providersPage.sponsor.protocolEndpoint')}
              </span>
              <span className="font-mono text-xs break-all">{endpointUrl}</span>
            </div>

            <Field>
              <FieldLabel htmlFor={fieldId('api-key')}>{t('providersPage.form.apiKey')}</FieldLabel>
              <SecretInput
                id={fieldId('api-key')}
                className="h-9"
                value={entry.apiKey}
                onValueChange={(apiKey) => updateEntry({ apiKey })}
                visible={showApiKey}
                onVisibleChange={setShowApiKey}
                placeholder={
                  mode === 'edit'
                    ? t('providersPage.form.apiKeyEditPlaceholder')
                    : t('providersPage.form.apiKeyCreatePlaceholder')
                }
                disabled={mutating}
              />
              <FieldDescription>{t('providersPage.sponsor.apiKeyHint')}</FieldDescription>
            </Field>

            {definition.supportsUsageCheck ? (
              <div className="flex flex-col items-start gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void usageCheck.run()}
                  disabled={mutating || usageCheck.isLoading}
                >
                  <HugeiconsIcon icon={DollarCircleIcon} strokeWidth={1.75} />
                  {usageCheck.isLoading
                    ? t('providersPage.sponsor.usageChecking')
                    : t('providersPage.sponsor.usageCheck')}
                </Button>
                {usageCheck.status.state === 'success' && usageSummary ? (
                  <div
                    role="status"
                    className={cn(
                      'flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-sm',
                      !usageHealthy && 'border-warning/40 bg-warning/10'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon
                        icon={usageHealthy ? CheckmarkCircle02Icon : Alert02Icon}
                        strokeWidth={1.75}
                        aria-hidden="true"
                        className={cn(
                          'size-4 shrink-0',
                          usageHealthy ? 'text-success' : 'text-warning'
                        )}
                      />
                      <span className="tabular-nums">
                        {t('providersPage.sponsor.usageRemaining', {
                          amount: usageRemaining,
                          unit: usageSummary.unit,
                        })}
                      </span>
                    </div>
                    {usageSummary.used !== null || usageSummary.limit !== null ? (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {t('providersPage.sponsor.usageBreakdown', {
                          used: usageUsed,
                          limit: usageLimit,
                        })}
                      </span>
                    ) : null}
                    {!usageHealthy ? (
                      <span className="text-xs text-muted-foreground">
                        {t('providersPage.sponsor.usageStatus', {
                          status: usageSummary.status || t('providersPage.sponsor.usageInvalid'),
                        })}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {usageCheck.status.state === 'error' ? (
                  <p role="alert" className="text-sm text-destructive">
                    {usageCheck.status.message}
                  </p>
                ) : null}
              </div>
            ) : null}

            <Field>
              <FieldLabel htmlFor={fieldId('proxy')}>{t('providersPage.form.proxyUrl')}</FieldLabel>
              <Input
                id={fieldId('proxy')}
                className="h-9 font-mono"
                value={entry.proxyUrl}
                onChange={(event) => updateEntry({ proxyUrl: event.target.value })}
                placeholder="http://127.0.0.1:7890"
                disabled={mutating}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
              <Field>
                <FieldLabel htmlFor={fieldId('prefix')}>
                  {t('providersPage.form.prefix')}
                </FieldLabel>
                <Input
                  id={fieldId('prefix')}
                  className="h-9"
                  value={entry.prefix}
                  onChange={(event) => updateEntry({ prefix: event.target.value })}
                  disabled={mutating}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={fieldId('priority')}>
                  {t('providersPage.form.priority')}
                </FieldLabel>
                <Input
                  id={fieldId('priority')}
                  type="number"
                  className="h-9"
                  value={entry.priority ?? ''}
                  onChange={(event) =>
                    updateEntry({
                      priority: event.target.value === '' ? undefined : Number(event.target.value),
                    })
                  }
                  disabled={mutating}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor={fieldId('weight')}>{t('providersPage.form.weight')}</FieldLabel>
              <Input
                id={fieldId('weight')}
                type="number"
                step="1"
                max={MAX_CREDENTIAL_WEIGHT}
                className="h-9"
                value={entry.weight ?? ''}
                placeholder="1"
                aria-describedby={fieldId('weight-hint')}
                onChange={(event) =>
                  updateEntry({
                    weight: event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
                disabled={mutating}
              />
              <FieldDescription id={fieldId('weight-hint')}>
                {t('providersPage.form.weightHint')}
              </FieldDescription>
            </Field>

            <SwitchField
              id={fieldId('disabled')}
              label={t('providersPage.form.disabled')}
              description={t('providersPage.form.disabledHint')}
              checked={entry.disabled}
              disabled={mutating}
              onCheckedChange={(disabled) => updateEntry({ disabled })}
            />
          </FieldGroup>

          <div className="flex flex-col gap-3">
            <ProviderBehaviorEditor
              brand={entry.protocol === 'openai' ? 'openaiCompatibility' : entry.protocol}
              value={entry}
              onChange={updateEntry}
              disabled={mutating}
            />
            <RuntimePolicyEditor
              value={entry.runtimePolicy ?? readRuntimePolicy()}
              onChange={(runtimePolicy) => updateEntry({ runtimePolicy })}
              disabled={mutating}
            />
            <SponsorModelSection
              label={t(`providersPage.sponsor.protocolModels.${modelKey}`)}
              description={t(`providersPage.sponsor.protocolModelHints.${modelKey}`)}
              protocol={entry.protocol}
              models={entry.models}
              discovery={discovery}
              mutating={mutating}
              onChange={(models) => updateEntry({ models })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const buildInitialForm = (
  definition: SponsorProviderDefinition,
  resource: ProviderResource | null,
  mode: 'create' | 'edit'
): ProviderEntryFormInput => {
  if (mode === 'create') return emptySponsorForm(definition);
  const raw = getSponsorRaw(resource, definition.brand);
  return {
    ...emptySponsorForm(definition),
    sponsorKeyEntries: sponsorKeyEntriesFromRaw(raw, definition),
  };
};

export function SponsorProviderForm({
  brand = 'apikeyFun',
  resource,
  mode,
  mutating,
  formId,
  onSubmit,
  onDirtyChange,
}: SponsorProviderFormProps) {
  const { t } = useTranslation();
  const definition = useMemo(() => getSponsorProviderDefinition(brand), [brand]);
  const [form, setForm] = useState<ProviderEntryFormInput>(() =>
    buildInitialForm(definition, resource, mode)
  );
  const [initialFormSignature] = useState<string>(() =>
    JSON.stringify(buildInitialForm(definition, resource, mode))
  );
  const [error, setError] = useState<string | null>(null);
  const entries = useMemo(
    () => form.sponsorKeyEntries ?? [emptySponsorKeyEntry(definition)],
    [definition, form.sponsorKeyEntries]
  );
  const usedProtocols = useMemo(() => new Set(entries.map((entry) => entry.protocol)), [entries]);
  const missingProtocols = useMemo(
    () => definition.protocols.filter((protocol) => !usedProtocols.has(protocol)),
    [definition.protocols, usedProtocols]
  );

  const isDirty = useMemo(
    () => JSON.stringify({ ...form, sponsorKeyEntries: entries }) !== initialFormSignature,
    [entries, form, initialFormSignature]
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const updateEntries = (nextEntries: SponsorKeyEntryInput[]) => {
    setForm((prev) => ({ ...prev, sponsorKeyEntries: nextEntries }));
  };

  const updateEntry = (entryIndex: number, nextEntry: SponsorKeyEntryInput) => {
    updateEntries(entries.map((entry, index) => (index === entryIndex ? nextEntry : entry)));
  };

  const removeEntry = (entryIndex: number) => {
    const nextEntries = entries.filter((_, index) => index !== entryIndex);
    updateEntries(
      nextEntries.length || mode === 'edit' ? nextEntries : [emptySponsorKeyEntry(definition)]
    );
  };

  const addEntry = () => {
    const protocol = missingProtocols[0];
    if (!protocol) return;
    updateEntries([...entries, emptySponsorKeyEntry(definition, protocol)]);
  };

  const validateEntries = (): string | null => {
    for (const entry of entries) {
      const modelError = validateModelOptions(entry.models);
      if (modelError) return t(modelError);
      if (!entry.runtimePolicy) continue;
      const policyError = validateRuntimePolicy(entry.runtimePolicy);
      if (policyError) return t(policyError);
    }
    if (!entries.length) {
      return mode === 'edit' ? null : t('providersPage.sponsor.validation.keyRequired');
    }
    const missingKey = entries.some(
      (entry) => !entry.apiKey.trim() && !entry.existingApiKey?.trim()
    );
    if (missingKey) return t('providersPage.sponsor.validation.keyRequired');
    const protocolSet = new Set(entries.map((entry) => entry.protocol));
    if (protocolSet.size !== entries.length) {
      return t('providersPage.sponsor.validation.protocolDuplicate');
    }
    if (
      entries.some((entry) => entry.weight !== undefined && !Number.isSafeInteger(entry.weight))
    ) {
      return t('providersPage.form.validation.weightInteger');
    }
    if (
      entries.some((entry) => entry.weight !== undefined && entry.weight > MAX_CREDENTIAL_WEIGHT)
    ) {
      return t('providersPage.form.validation.weightMax', { max: MAX_CREDENTIAL_WEIGHT });
    }
    return null;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateEntries();
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      setError(null);
      await onSubmit({ ...form, sponsorKeyEntries: entries });
    } catch (err) {
      setError(
        isSponsorPartialMutationError(err)
          ? t('providersPage.sponsor.partialMutationWarning')
          : err instanceof Error
            ? err.message
            : String(err)
      );
    }
  };

  const aggregationConflict =
    mode === 'edit'
      ? getSponsorAggregationConflict(getSponsorRaw(resource, definition.brand))
      : null;

  if (aggregationConflict) {
    return (
      <form
        id={formId}
        className="flex flex-col gap-6"
        onSubmit={(event) => event.preventDefault()}
      >
        <FormError>{t('providersPage.sponsor.aggregationConflict')}</FormError>
      </form>
    );
  }

  return (
    <form id={formId} className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{t('providersPage.sponsor.groupedKeysTitle')}</h3>
        {entries.map((entry, index) => (
          <SponsorKeyEntryCard
            key={`${entry.protocol}-${index}`}
            entry={entry}
            index={index}
            formId={formId}
            mode={mode}
            definition={definition}
            usedProtocols={usedProtocols}
            canRemove={mode === 'edit' || entries.length > 1}
            mutating={mutating}
            onChange={(nextEntry) => updateEntry(index, nextEntry)}
            onRemove={() => removeEntry(index)}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={mutating || !missingProtocols.length}
          onClick={addEntry}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} />
          {t('providersPage.sponsor.addGroupedKey')}
        </Button>
      </div>

      {error ? <FormError>{error}</FormError> : null}
    </form>
  );
}
