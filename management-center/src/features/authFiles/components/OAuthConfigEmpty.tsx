import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import type { OAuthConfigLoadError } from '@/features/authFiles/constants';

/** The non-list states of an OAuth config panel: loading, failed, unsupported or empty. */
export function OAuthConfigEmpty({
  error,
  upgradeTitle,
  upgradeDescription,
  emptyTitle,
  onRetry,
}: {
  error: OAuthConfigLoadError;
  upgradeTitle: string;
  upgradeDescription: string;
  emptyTitle: string;
  onRetry: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const title =
    error === 'unsupported'
      ? upgradeTitle
      : error === 'load'
        ? t('notification.refresh_failed')
        : error === 'loading'
          ? t('common.loading')
          : emptyTitle;

  // Plain muted text, centred on desktop; phones put it as a line under the heading.
  return (
    <Empty className="p-6 max-sm:items-start max-sm:p-0 max-sm:text-left md:p-6">
      <EmptyHeader className="max-sm:items-start">
        <EmptyTitle className="font-normal text-muted-foreground">{title}</EmptyTitle>
        {error === 'unsupported' && <EmptyDescription>{upgradeDescription}</EmptyDescription>}
      </EmptyHeader>
      {error === 'load' && (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={() => void onRetry()}>
            {t('common.refresh')}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
