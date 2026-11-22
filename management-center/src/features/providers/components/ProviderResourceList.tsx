import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Delete02Icon, PencilEdit02Icon, ViewIcon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
} from '@/components/ui/item';
import { Switch } from '@/components/ui/switch';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import {
  getOpenAIProviderRecentStatusData,
  getOpenAIProviderTotalStats,
  getProviderRecentStatusData,
  getProviderTotalStats,
  getProviderUsageKey,
  type ProviderRecentUsageMap,
} from '@/components/providers/utils';
import { cn } from '@/lib/utils';
import type { OpenAIProviderConfig } from '@/types';
import type { ProviderResource } from '../types';
import { Hint } from '@/components/ui/tooltip';

interface ProviderResourceListProps {
  resources: ProviderResource[];
  selectedId?: string | null;
  disableMutations?: boolean;
  usageByProvider?: ProviderRecentUsageMap;
  onView: (resource: ProviderResource) => void;
  onEdit: (resource: ProviderResource) => void;
  onDelete: (resource: ProviderResource) => void;
  onToggleDisabled?: (resource: ProviderResource, disabled: boolean) => void;
}

const usageFor = (resource: ProviderResource, usageByProvider: ProviderRecentUsageMap) => {
  if (resource.brand === 'openaiCompatibility') {
    const config = resource.raw as OpenAIProviderConfig;
    return {
      totals: getOpenAIProviderTotalStats(config, usageByProvider),
      statusData: getOpenAIProviderRecentStatusData(config, usageByProvider),
    };
  }
  const key = getProviderUsageKey(resource.brand);
  const apiKey = resource.apiKey ?? undefined;
  const baseUrl = resource.baseUrl ?? undefined;
  return {
    totals: getProviderTotalStats(usageByProvider, key, apiKey, baseUrl),
    statusData: getProviderRecentStatusData(usageByProvider, key, apiKey, baseUrl),
  };
};

/** The credentials of one provider as rows in a bordered group. */
export function ProviderResourceList({
  resources,
  selectedId,
  disableMutations,
  usageByProvider,
  onView,
  onEdit,
  onDelete,
  onToggleDisabled,
}: ProviderResourceListProps) {
  const { t } = useTranslation();

  const describe = (r: ProviderResource) => {
    let title: string;
    let subtitle: string | null;
    if (r.brand === 'openaiCompatibility') {
      const extra = r.apiKeyEntryCount > 1 ? ` +${r.apiKeyEntryCount - 1}` : '';
      title = r.name ?? r.identifier;
      subtitle = (r.apiKeyPreview ?? '-') + extra;
    } else {
      title = r.apiKeyPreview ?? '-';
      subtitle = r.authIndex ? `auth: ${r.authIndex}` : null;
    }

    let baseUrl: string;
    if (r.brand === 'claude' && !r.baseUrl)
      baseUrl = `https://api.anthropic.com ${t('providersPage.status.defaultSuffix')}`;
    else baseUrl = r.baseUrl ?? t('providersPage.status.notSet');

    const tags: string[] = [];
    const metrics: Array<[string, number]> = [];
    metrics.push([t('providersPage.table.metrics.models'), r.modelCount]);
    if (r.brand === 'openaiCompatibility') {
      metrics.push([t('providersPage.table.metrics.keys'), r.apiKeyEntryCount]);
    }
    metrics.push([t('providersPage.table.metrics.headers'), r.headerCount]);
    if ((r.brand === 'codex' || r.brand === 'xai') && r.flags.websockets) {
      tags.push(t('providersPage.table.websocketsTag'));
    }
    if (r.brand === 'claude' && r.flags.cloakEnabled) tags.push(t('providersPage.table.cloakTag'));
    if (r.brand === 'claude' && r.flags.claudeCodeCliProfile) {
      tags.push(t('providersPage.table.cliProfileTag'));
    }

    return { title, subtitle, baseUrl, tags, metrics };
  };

  const iconButton = (
    label: string,
    icon: IconSvgElement,
    onClick: () => void,
    options: { disabled?: boolean; destructive?: boolean } = {}
  ): ReactNode => (
    <Hint label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        disabled={options.disabled}
        onClick={onClick}
        className={cn(options.destructive && 'hover:text-destructive')}
      >
        <HugeiconsIcon icon={icon} strokeWidth={1.75} />
      </Button>
    </Hint>
  );

  return (
    <div role="list" className="flex flex-col divide-y overflow-hidden rounded-xl border">
      {resources.map((resource) => {
        const row = describe(resource);
        const usage = usageByProvider ? usageFor(resource, usageByProvider) : null;
        const statusLabel = resource.disabled
          ? t('providersPage.status.disabled')
          : t('providersPage.status.active');

        return (
          <Item
            key={resource.id}
            role="listitem"
            className={cn(
              'rounded-none border-0 px-4 py-3',
              resource.id === selectedId && 'bg-accent/60'
            )}
          >
            <ItemHeader className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    resource.disabled ? 'bg-faint' : 'bg-success'
                  )}
                  title={statusLabel}
                />
                <span className="sr-only">{statusLabel}</span>
                <span className="min-w-0 truncate font-mono text-sm font-medium">{row.title}</span>
                {row.subtitle ? (
                  <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                    {row.subtitle}
                  </span>
                ) : null}
              </div>
              <ItemActions className="shrink-0 gap-1">
                {onToggleDisabled ? (
                  <Switch
                    checked={!resource.disabled}
                    disabled={disableMutations}
                    onCheckedChange={(value) => onToggleDisabled(resource, !value)}
                    aria-label={
                      resource.disabled
                        ? t('providersPage.actions.enable')
                        : t('providersPage.actions.disable')
                    }
                    className="mr-1.5"
                  />
                ) : null}
                {iconButton(t('providersPage.actions.view'), ViewIcon, () => onView(resource))}
                {iconButton(
                  t('providersPage.actions.edit'),
                  PencilEdit02Icon,
                  () => onEdit(resource),
                  { disabled: disableMutations }
                )}
                {iconButton(
                  t('providersPage.actions.delete'),
                  Delete02Icon,
                  () => onDelete(resource),
                  { disabled: disableMutations, destructive: true }
                )}
              </ItemActions>
            </ItemHeader>

            <ItemContent className="min-w-0 basis-full gap-1.5">
              <ItemDescription className="truncate font-mono text-xs">
                {row.baseUrl}
              </ItemDescription>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
                {resource.prefix ? (
                  <Badge variant="outline" className="font-mono">
                    {resource.prefix}
                  </Badge>
                ) : null}
                {row.metrics.map(([label, value]) => (
                  <span key={label} className="whitespace-nowrap">
                    {label} <span className="font-mono text-foreground tabular-nums">{value}</span>
                  </span>
                ))}
                {row.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </ItemContent>

            {usage ? (
              <ItemFooter className="flex-wrap gap-x-4 gap-y-2">
                <span className="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
                  <span className="text-success">
                    {t('stats.success')} {usage.totals.success}
                  </span>
                  <span className="text-destructive">
                    {t('stats.failure')} {usage.totals.failure}
                  </span>
                </span>
                <div className="min-w-0 flex-1 basis-full sm:basis-0">
                  <ProviderStatusBar statusData={usage.statusData} />
                </div>
              </ItemFooter>
            ) : null}
          </Item>
        );
      })}
    </div>
  );
}
