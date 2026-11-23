import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { getProviderTotalStats, type ProviderRecentUsageMap } from '@/components/providers/utils';
import type { OpenAIProviderConfig } from '@/types';
import { maskApiKey } from '@/utils/format';
import type { ProviderResource } from '../types';
import { FormSection } from './forms/FormSection';

interface ResourceDetailViewProps {
  resource: ProviderResource;
  usageByProvider?: ProviderRecentUsageMap;
}

/** Label and value rows in a bordered group. */
function DetailList({ rows }: { rows: Array<[label: string, value: string | number]> }) {
  return (
    <dl className="flex flex-col divide-y rounded-xl border">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
          <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
          <dd className="min-w-0 truncate text-right font-mono text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ResourceDetailView({ resource, usageByProvider }: ResourceDetailViewProps) {
  const { t } = useTranslation();

  const primary: Array<[string, string]> = [
    ['identifier', resource.identifier],
    ['baseUrl', resource.baseUrl ?? t('providersPage.status.notSet')],
    ['proxyUrl', resource.proxyUrl ?? t('providersPage.status.notSet')],
    ['prefix', resource.prefix ?? t('providersPage.status.none')],
    ['models', String(resource.modelCount)],
    ['headers', String(resource.headerCount)],
  ];

  const metadata: Array<[string, string]> = [
    ['authIndex', resource.authIndex ?? t('providersPage.status.notSet')],
    ['excludedModels', String(resource.excludedModelCount)],
    ['apiKeyEntries', String(resource.apiKeyEntryCount)],
  ];

  const openaiConfig =
    resource.brand === 'openaiCompatibility' ? (resource.raw as OpenAIProviderConfig) : null;
  const apiKeyEntries = openaiConfig?.apiKeyEntries ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-base font-medium">{resource.name ?? resource.identifier}</h3>

      <DetailList
        rows={primary.map(([key, value]) => [t(`providersPage.detail.fields.${key}`), value])}
      />

      {openaiConfig && apiKeyEntries.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-medium">
            {t('providersPage.form.apiKeyEntriesSection')}: {apiKeyEntries.length}
          </h4>
          <div className="flex flex-col divide-y rounded-xl border">
            {apiKeyEntries.map((entry, entryIndex) => {
              const entryStats = usageByProvider
                ? getProviderTotalStats(
                    usageByProvider,
                    openaiConfig.name,
                    entry.apiKey,
                    openaiConfig.baseUrl
                  )
                : { success: 0, failure: 0 };
              return (
                <div
                  key={`${entry.apiKey}-${entryIndex}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
                >
                  <span className="w-5 font-mono text-xs text-faint tabular-nums">
                    {entryIndex + 1}
                  </span>
                  <span className="font-mono text-sm">{maskApiKey(entry.apiKey)}</span>
                  {entry.proxyUrl ? (
                    <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                      {entry.proxyUrl}
                    </span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-success">
                      <HugeiconsIcon icon={Tick02Icon} strokeWidth={1.75} className="size-3.5" />
                      {entryStats.success}
                    </span>
                    <span className="flex items-center gap-1 text-destructive">
                      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} className="size-3.5" />
                      {entryStats.failure}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <FormSection label={t('providersPage.detail.metadataTitle')} flush>
        <dl className="flex flex-col divide-y">
          {metadata.map(([key, value]) => (
            <div key={key} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
              <dt className="shrink-0 text-sm text-muted-foreground">
                {t(`providersPage.detail.fields.${key}`)}
              </dt>
              <dd className="min-w-0 truncate text-right font-mono text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </FormSection>
    </div>
  );
}
