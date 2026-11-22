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
  className,
}: {
  types: string[];
  counts: Record<string, number>;
  active: string;
  onChange: (type: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Select value={active} onValueChange={onChange}>
      <SelectTrigger
        aria-label={t('auth_files.filter_all')}
        className={cn('data-[size=default]:h-9', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {types.map((type) => (
          <SelectItem key={type} value={type}>
            {type === 'all' ? (
              <span className="grid size-5 place-items-center text-muted-foreground">
                <HugeiconsIcon icon={FilterIcon} strokeWidth={1.75} className="size-4" />
              </span>
            ) : (
              <ProviderLogo type={type} className="size-5 rounded-[5px]" />
            )}
            {type === 'all' ? t('auth_files.filter_all') : getTypeLabel(t, type)}
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {counts[type] ?? 0}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
