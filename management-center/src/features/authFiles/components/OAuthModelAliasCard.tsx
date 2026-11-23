import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowShrink02Icon,
  Delete02Icon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Section } from '@/components/layout/Page';
import { ModelMappingDiagram, type ModelMappingDiagramRef } from '@/components/modelAlias';
import type { OAuthModelAliasEntry } from '@/types';
import type { AuthFileModelItem, OAuthConfigLoadError } from '@/features/authFiles/constants';
import { getTypeLabel } from '@/features/authFiles/constants';
import { OAuthConfigEmpty } from './OAuthConfigEmpty';
import { ProviderLogo } from './ProviderLogo';
import { Hint } from '@/components/ui/tooltip';

type ViewMode = 'diagram' | 'list';

export type OAuthModelAliasCardProps = {
  disableControls: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onRetry: () => void | Promise<void>;
  onAdd: () => void;
  onEditProvider: (provider?: string) => void;
  onDeleteProvider: (provider: string) => void;
  modelAliasError: OAuthConfigLoadError;
  modelAlias: Record<string, OAuthModelAliasEntry[]>;
  allProviderModels: Record<string, AuthFileModelItem[]>;
  onUpdate: (provider: string, sourceModel: string, newAlias: string) => Promise<void>;
  onDeleteLink: (provider: string, sourceModel: string, alias: string) => void;
  onToggleFork: (
    provider: string,
    sourceModel: string,
    alias: string,
    fork: boolean
  ) => Promise<void>;
  onRenameAlias: (oldAlias: string, newAlias: string) => Promise<void>;
  onDeleteAlias: (aliasName: string) => void;
};

export function OAuthModelAliasCard(props: OAuthModelAliasCardProps) {
  const { t } = useTranslation();
  const diagramRef = useRef<ModelMappingDiagramRef | null>(null);
  const {
    disableControls,
    viewMode,
    onViewModeChange,
    onRetry,
    onAdd,
    onEditProvider,
    onDeleteProvider,
    modelAliasError,
    modelAlias,
    allProviderModels,
    onUpdate,
    onDeleteLink,
    onToggleFork,
    onRenameAlias,
    onDeleteAlias,
  } = props;
  const entries = Object.entries(modelAlias);
  const unavailable = disableControls || modelAliasError !== null;

  return (
    <Section
      title={t('oauth_model_alias.title')}
      actions={
        <div className="flex items-center gap-2">
          {/* The diagram needs more width than a phone has, so phones stay on the list. */}
          <ToggleGroup
            type="single"
            className="max-sm:hidden"
            variant="outline"
            spacing={0}
            value={viewMode}
            onValueChange={(value) => {
              if (value === 'list' || value === 'diagram') onViewModeChange(value);
            }}
            disabled={unavailable}
          >
            <ToggleGroupItem value="list">{t('oauth_model_alias.view_mode_list')}</ToggleGroupItem>
            <ToggleGroupItem value="diagram">
              {t('oauth_model_alias.view_mode_diagram')}
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="outline"
            size="icon"
            className="size-10 sm:hidden"
            onClick={onAdd}
            disabled={unavailable}
            aria-label={t('oauth_model_alias.add_title')}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} />
          </Button>
          <Button
            variant="outline"
            className="max-sm:hidden"
            onClick={onAdd}
            disabled={unavailable}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} data-icon="inline-start" />
            {t('oauth_model_alias.add')}
          </Button>
        </div>
      }
    >
      {modelAliasError !== null || entries.length === 0 ? (
        <OAuthConfigEmpty
          error={modelAliasError}
          upgradeTitle={t('oauth_model_alias.upgrade_required_title')}
          upgradeDescription={t('oauth_model_alias.upgrade_required_desc')}
          emptyTitle={t('oauth_model_alias.list_empty_all')}
          onRetry={onRetry}
        />
      ) : viewMode === 'diagram' ? (
        <div className="flex flex-col gap-3 rounded-xl border p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">{t('oauth_model_alias.chart_title')}</h3>
            <Hint label={t('oauth_model_alias.diagram_collapse')}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => diagramRef.current?.collapseAll()}
                disabled={unavailable}
                aria-label={t('oauth_model_alias.diagram_collapse')}
              >
                <HugeiconsIcon icon={ArrowShrink02Icon} strokeWidth={1.75} />
              </Button>
            </Hint>
          </div>
          <ModelMappingDiagram
            ref={diagramRef}
            modelAlias={modelAlias}
            allProviderModels={allProviderModels}
            onUpdate={onUpdate}
            onDeleteLink={onDeleteLink}
            onToggleFork={onToggleFork}
            onRenameAlias={onRenameAlias}
            onDeleteAlias={onDeleteAlias}
            onEditProvider={onEditProvider}
            onDeleteProvider={onDeleteProvider}
            className="min-h-80 overflow-x-auto"
          />
        </div>
      ) : (
        <ItemGroup className="gap-0 overflow-hidden rounded-xl border">
          {entries.map(([provider, mappings]) => (
            <Item key={provider} className="rounded-none border-0 not-last:border-b max-sm:p-4">
              <ItemMedia>
                <ProviderLogo type={provider} className="size-8 rounded-lg" />
              </ItemMedia>
              <ItemContent className="min-w-0">
                {/* Phones show the provider's display name; desktop keeps the config key. */}
                <ItemTitle className="font-mono max-sm:font-sans">
                  <span className="max-sm:hidden">{provider}</span>
                  <span className="sm:hidden">{getTypeLabel(t, provider)}</span>
                </ItemTitle>
                <ItemDescription>
                  {mappings?.length
                    ? t('oauth_model_alias.model_count', { count: mappings.length })
                    : t('oauth_model_alias.no_models')}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="gap-0 max-sm:-mr-3">
                <Hint label={t('common.edit')}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('common.edit')}
                    className="text-muted-foreground hover:text-foreground max-sm:size-10"
                    onClick={() => onEditProvider(provider)}
                  >
                    <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.75} />
                  </Button>
                </Hint>
                <Hint label={t('oauth_model_alias.delete')}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('oauth_model_alias.delete')}
                    className="text-muted-foreground hover:text-destructive max-sm:size-10"
                    onClick={() => onDeleteProvider(provider)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
                  </Button>
                </Hint>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </Section>
  );
}
