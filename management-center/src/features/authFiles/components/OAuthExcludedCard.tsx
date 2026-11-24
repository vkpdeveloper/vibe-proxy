import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Delete02Icon, PencilEdit02Icon } from '@hugeicons/core-free-icons';
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
import { Section } from '@/components/layout/Page';
import type { OAuthConfigLoadError } from '@/features/authFiles/constants';
import { getTypeLabel } from '@/features/authFiles/constants';
import { OAuthConfigEmpty } from './OAuthConfigEmpty';
import { ProviderLogo } from './ProviderLogo';
import { Hint } from '@/components/ui/tooltip';

export type OAuthExcludedCardProps = {
  disableControls: boolean;
  excludedError: OAuthConfigLoadError;
  excluded: Record<string, string[]>;
  onRetry: () => void | Promise<void>;
  onAdd: () => void;
  onEdit: (provider: string) => void;
  onDelete: (provider: string) => void;
};

export function OAuthExcludedCard(props: OAuthExcludedCardProps) {
  const { t } = useTranslation();
  const { disableControls, excludedError, excluded, onRetry, onAdd, onEdit, onDelete } = props;
  const entries = Object.entries(excluded);

  return (
    <Section
      title={t('oauth_excluded.title')}
      actions={
        <>
          <Button
            variant="outline"
            size="icon"
            className="size-10 sm:hidden"
            onClick={onAdd}
            disabled={disableControls || excludedError !== null}
            aria-label={t('oauth_excluded.add_title')}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="max-sm:hidden"
            onClick={onAdd}
            disabled={disableControls || excludedError !== null}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} data-icon="inline-start" />
            {t('oauth_excluded.add')}
          </Button>
        </>
      }
    >
      {excludedError !== null || entries.length === 0 ? (
        <OAuthConfigEmpty
          error={excludedError}
          upgradeTitle={t('oauth_excluded.upgrade_required_title')}
          upgradeDescription={t('oauth_excluded.upgrade_required_desc')}
          emptyTitle={t('oauth_excluded.list_empty_all')}
          onRetry={onRetry}
        />
      ) : (
        <ItemGroup className="gap-0 overflow-hidden rounded-xl border">
          {entries.map(([provider, models]) => (
            <Item key={provider} className="rounded-none border-0 not-last:border-b max-sm:p-4">
              <ItemMedia>
                <ProviderLogo type={provider} className="size-8 rounded-lg" />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle>{getTypeLabel(t, provider)}</ItemTitle>
                <ItemDescription>
                  {models?.length
                    ? t('oauth_excluded.model_count', { count: models.length })
                    : t('oauth_excluded.no_models')}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="gap-0 max-sm:-mr-3">
                <Hint label={t('common.edit')}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('common.edit')}
                    className="text-muted-foreground hover:text-foreground max-sm:size-10 sm:size-8"
                    onClick={() => onEdit(provider)}
                  >
                    <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.75} />
                  </Button>
                </Hint>
                <Hint label={t('oauth_excluded.delete')}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('oauth_excluded.delete')}
                    className="text-muted-foreground hover:text-destructive max-sm:size-10 sm:size-8"
                    onClick={() => onDelete(provider)}
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
