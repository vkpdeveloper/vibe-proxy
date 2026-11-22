import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

/** Search box shared by the accounts and quota lists. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  clearLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  clearLabel: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <InputGroup className={cn('h-9', className)}>
      <InputGroupAddon>
        <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="[&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={clearLabel}
            title={clearLabel}
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

/** Previous / page info / next, shown only when a list spans several pages. */
export function ListPagination({
  page,
  totalPages,
  count,
  onPage,
}: {
  page: number;
  totalPages: number;
  count: number;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3">
      <Button variant="outline" onClick={() => onPage(page - 1)} disabled={page <= 1}>
        {t('auth_files.pagination_prev')}
      </Button>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {t('auth_files.pagination_info', { current: page, total: totalPages, count })}
      </span>
      <Button variant="outline" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
        {t('auth_files.pagination_next')}
      </Button>
    </div>
  );
}
