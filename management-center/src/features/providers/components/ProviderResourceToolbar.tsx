import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowDown01Icon,
  FilterHorizontalIcon,
  Search01Icon,
  SortingAZ02Icon,
  SortingZA01Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProviderSortBy, SortDir } from '../types';
import { Hint } from '@/components/ui/tooltip';

const SORT_OPTIONS: ReadonlyArray<{ value: ProviderSortBy; labelKey: string }> = [
  { value: 'name', labelKey: 'providersPage.toolbar.sort.name' },
  { value: 'priority', labelKey: 'providersPage.toolbar.sort.priority' },
  { value: 'recent-success', labelKey: 'providersPage.toolbar.sort.recentSuccess' },
];

interface ProviderResourceToolbarProps {
  filter: string;
  onFilterChange: (value: string) => void;
  sortBy: ProviderSortBy;
  sortDir: SortDir;
  onSortBy: (value: ProviderSortBy) => void;
  onSortDir: (value: SortDir) => void;
  availableModels: ReadonlyArray<string>;
  selectedModels: ReadonlySet<string>;
  onSelectedModelsChange: (next: Set<string>) => void;
}

/** Search, sort and model filter for the resource list of one provider. */
export function ProviderResourceToolbar({
  filter,
  onFilterChange,
  sortBy,
  sortDir,
  onSortBy,
  onSortDir,
  availableModels,
  selectedModels,
  onSelectedModelsChange,
}: ProviderResourceToolbarProps) {
  const { t } = useTranslation();
  const idPrefix = useId();
  const directionLabel =
    sortDir === 'asc'
      ? t('providersPage.toolbar.sort.directionAsc')
      : t('providersPage.toolbar.sort.directionDesc');

  const toggleModel = (name: string) => {
    const next = new Set(selectedModels);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onSelectedModelsChange(next);
  };

  const filterLabel =
    selectedModels.size === 0
      ? t('providersPage.toolbar.filter.allModels')
      : t('providersPage.toolbar.filter.selectedModels', {
          selected: selectedModels.size,
          total: availableModels.length,
        });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputGroup className="h-9 min-w-0 basis-full max-sm:h-10 sm:basis-0 sm:flex-1">
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder={t('providersPage.table.filterPlaceholder')}
          aria-label={t('providersPage.table.filterPlaceholder')}
        />
      </InputGroup>

      <div className="flex min-w-0 items-center gap-1">
        <Select value={sortBy} onValueChange={(value) => onSortBy(value as ProviderSortBy)}>
          <SelectTrigger
            className="h-9 min-w-0 max-sm:h-10"
            aria-label={t('providersPage.toolbar.sortBy')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Hint label={directionLabel}>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="max-sm:size-10"
            onClick={() => onSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            aria-label={directionLabel}
          >
            <HugeiconsIcon
              icon={sortDir === 'asc' ? SortingAZ02Icon : SortingZA01Icon}
              strokeWidth={1.75}
            />
          </Button>
        </Hint>
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-w-0 max-sm:h-10"
            disabled={availableModels.length === 0}
          >
            <HugeiconsIcon
              icon={FilterHorizontalIcon}
              strokeWidth={1.75}
              data-icon="inline-start"
            />
            <span className="truncate">{filterLabel}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.75} data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 gap-1 p-1">
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onSelectedModelsChange(new Set(availableModels))}
            >
              {t('providersPage.toolbar.filter.selectAll')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onSelectedModelsChange(new Set())}
              disabled={selectedModels.size === 0}
            >
              {t('providersPage.toolbar.filter.clear')}
            </Button>
          </div>
          <ul className="flex max-h-72 flex-col overflow-y-auto border-t pt-1">
            {availableModels.map((name, index) => {
              const id = `${idPrefix}-model-${index}`;
              return (
                <li key={name}>
                  <Label
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 font-normal hover:bg-accent"
                  >
                    <Checkbox
                      id={id}
                      checked={selectedModels.has(name)}
                      onCheckedChange={() => toggleModel(name)}
                    />
                    <span className="min-w-0 truncate font-mono text-xs">{name}</span>
                  </Label>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
