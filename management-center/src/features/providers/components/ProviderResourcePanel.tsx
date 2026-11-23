import { useTranslation } from 'react-i18next';
import { Section } from '@/components/layout/Page';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import type { ProviderRecentUsageMap } from '@/components/providers/utils';
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
}

/** One provider: its logo, the toolbar and its credentials. */
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
}: ProviderResourcePanelProps) {
  const { t } = useTranslation();
  const activeCount = group.resources.filter((resource) => !resource.disabled).length;

  // The tab row right above already names the provider, so phones skip the heading.
  return (
    <div className="contents max-sm:[&>section>div:first-child]:hidden">
      <Section
        title={t(`providersPage.providerNames.${group.id}`)}
        icon={<ProviderLogo brand={group.id} className="size-7" />}
        actions={
          <span className="shrink-0 text-sm text-muted-foreground">
            {t('providersPage.categories.activeCount', {
              active: activeCount,
              total: group.resources.length,
            })}
          </span>
        }
      >
        <ProviderResourceToolbar
          key={group.id}
          filter={filter}
          onFilterChange={onFilterChange}
          {...toolbarControls}
        />

        {filteredResources.length === 0 ? (
          <Empty className="rounded-xl border border-dashed py-10">
            <EmptyDescription>{t('providersPage.table.noMatches')}</EmptyDescription>
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
    </div>
  );
}
