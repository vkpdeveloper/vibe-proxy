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
import { OAuthConfigEmpty } from './OAuthConfigEmpty';
import { ProviderLogo } from './ProviderLogo';

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
        <Button
          variant="outline"
          onClick={onAdd}
          disabled={disableControls || excludedError !== null}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} data-icon="inline-start" />
          {t('oauth_excluded.add')}
        </Button>
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
            <Item key={provider} className="rounded-none border-0 not-last:border-b">
              <ItemMedia>
                <ProviderLogo type={provider} className="size-8 rounded-lg" />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="font-mono">{provider}</ItemTitle>
                <ItemDescription>
                  {models?.length
                    ? t('oauth_excluded.model_count', { count: models.length })
                    : t('oauth_excluded.no_models')}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="gap-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('common.edit')}
                  title={t('common.edit')}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => onEdit(provider)}
                >
                  <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('oauth_excluded.delete')}
                  title={t('oauth_excluded.delete')}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(provider)}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </Section>
  );
}
