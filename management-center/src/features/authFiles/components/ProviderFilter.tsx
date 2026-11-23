import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { FilterIcon } from '@hugeicons/core-free-icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getTypeLabel } from '../constants';
import { ProviderLogo } from './ProviderLogo';

/** Provider filter shared by the accounts and quota pages: "all" plus each provider, with counts. */
export function ProviderFilter({
  types,
  counts,
  active,
  onChange,
  align = 'start',
  className,
}: {
  types: string[];
  counts: Record<string, number>;
  active: string;
  onChange: (type: string) => void;
  /** Which trigger edge the menu lines up with; 'end' suits a filter at the right of a row. */
  align?: 'start' | 'end';
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Select value={active} onValueChange={onChange}>
      <SelectTrigger
        aria-label={t('auth_files.provider_filter_label')}
        // The trigger names the filter and leaves counts to the menu: beside "All providers" a count
        // reads like a total, but it follows the page's other filters.
        className={cn(
          'data-[size=default]:h-9 max-sm:data-[size=default]:h-10 [&_[data-count]]:hidden',
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align={align} collisionPadding={16}>
        {types.map((type) => (
          <SelectItem key={type} value={type}>
            {type === 'all' ? (
              <span className="grid size-5 place-items-center text-muted-foreground">
                <HugeiconsIcon icon={FilterIcon} strokeWidth={1.75} className="size-4" />
              </span>
            ) : (
              <ProviderLogo type={type} className="size-5 rounded-[5px]" />
            )}
            {type === 'all' ? t('auth_files.provider_filter_all') : getTypeLabel(t, type)}
            <span
              data-count
              className="font-mono text-xs text-muted-foreground tabular-nums max-sm:font-sans max-sm:normal-nums"
            >
              {counts[type] ?? 0}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
