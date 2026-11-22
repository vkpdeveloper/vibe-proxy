import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons';
import { Section } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription } from '@/components/ui/empty';
import type { ProviderRecentUsageMap } from '@/components/providers/utils';
import { getKimiAffiliateUrl } from '../kimi';
import { getSponsorProviderDefinition } from '../sponsorDefinitions';
import type { ProviderGroup, ProviderResource, ProviderSortBy, SortDir } from '../types';
import { ProviderLogo } from './ProviderLogo';
import { ProviderResourceList } from './ProviderResourceList';
import { ProviderResourceToolbar } from './ProviderResourceToolbar';

export interface ProviderPanelControls {
  sortBy: ProviderSortBy;
  sortDir: SortDir;
  onSortBy: (value: ProviderSortBy) => void;
  onSortDir: (value: SortDir) => void;
  availableModels: ReadonlyArray<string>;
  selectedModels: ReadonlySet<string>;
  onSelectedModelsChange: (next: Set<string>) => void;
}

interface ProviderResourcePanelProps {
  group: ProviderGroup;
  filter: string;
  onFilterChange: (value: string) => void;
  filteredResources: ProviderResource[];
  selectedId: string | null;
  disableMutations?: boolean;
  usageByProvider?: ProviderRecentUsageMap;
  toolbarControls: ProviderPanelControls;
  onView: (resource: ProviderResource) => void;
  onEdit: (resource: ProviderResource) => void;
  onDelete: (resource: ProviderResource) => void;
  onToggleDisabled?: (resource: ProviderResource, disabled: boolean) => void;
  onCreate: () => void;
}

/** One provider: its logo and sign-up link, the toolbar and its credentials. */
export function ProviderResourcePanel({
  group,
  filter,
  onFilterChange,
  filteredResources,
  selectedId,
  disableMutations,
  usageByProvider,
  toolbarControls,
  onView,
  onEdit,
  onDelete,
  onToggleDisabled,
  onCreate,
}: ProviderResourcePanelProps) {
  const { t, i18n } = useTranslation();
  const registrationUrl =
    group.id === 'kimi'
      ? getKimiAffiliateUrl(i18n.resolvedLanguage ?? i18n.language)
      : group.id === 'fennoAI' || group.id === 'qiniuCloud'
        ? getSponsorProviderDefinition(group.id).affiliateUrl
        : null;
  const activeCount = group.resources.filter((resource) => !resource.disabled).length;

  return (
    <Section
      title={t(`providersPage.providerNames.${group.id}`)}
      icon={<ProviderLogo brand={group.id} className="size-7" />}
      actions={
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
          {t('providersPage.categories.activeCount', {
            active: activeCount,
            total: group.resources.length,
          })}
        </span>
      }
    >
      {registrationUrl ? (
        <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button asChild variant="outline" size="sm">
            <a href={registrationUrl} target="_blank" rel="noreferrer">
              {t(
                group.id === 'kimi'
                  ? 'providersPage.sponsor.registerNow'
                  : 'providersPage.sponsor.registerLink'
              )}
              <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.75} data-icon="inline-end" />
            </a>
          </Button>
          {group.id === 'kimi' ? (
            <p className="text-sm text-muted-foreground">{t('providersPage.sponsor.kimiPromo')}</p>
          ) : null}
        </div>
      ) : null}

      <ProviderResourceToolbar
        key={group.id}
        filter={filter}
        onFilterChange={onFilterChange}
        {...toolbarControls}
      />

      {filteredResources.length === 0 ? (
        <Empty className="rounded-xl border border-dashed py-10">
          <EmptyDescription>{t('providersPage.table.empty')}</EmptyDescription>
          <EmptyContent>
            <Button type="button" variant="outline" onClick={onCreate} disabled={disableMutations}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} data-icon="inline-start" />
              {t('providersPage.actions.new')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ProviderResourceList
          resources={filteredResources}
          selectedId={selectedId}
          disableMutations={disableMutations}
          usageByProvider={usageByProvider}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleDisabled={onToggleDisabled}
        />
      )}
    </Section>
  );
}
