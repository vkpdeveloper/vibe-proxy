import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight02Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { OAuthModelAliasEntry } from '@/types';

interface OAuthAliasMappingRowProps {
  entry: OAuthModelAliasEntry;
  index: number;
  options: { value: string; label?: string }[];
  disabled: boolean;
  canRemove: boolean;
  onChange: (field: keyof OAuthModelAliasEntry, value: string | boolean) => void;
  onRemove: () => void;
}

export function OAuthAliasMappingRow({
  entry,
  index,
  options,
  disabled,
  canRemove,
  onChange,
  onRemove,
}: OAuthAliasMappingRowProps) {
  const { t } = useTranslation();
  const id = useId();
  const rowLabel = t('oauth_model_alias.mapping_row', { number: index + 1 });
  const removeLabel = t('oauth_model_alias.remove_mapping', { number: index + 1 });

  return (
    <div className="flex flex-col gap-3 p-3" role="group" aria-label={rowLabel}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id={`${id}-source`}
          aria-label={t('oauth_model_alias.alias_name_placeholder')}
          className="h-9 font-mono text-sm sm:flex-1"
          list={`${id}-models`}
          placeholder={t('oauth_model_alias.alias_name_placeholder')}
          value={entry.name}
          onChange={(event) => onChange('name', event.target.value)}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
        <datalist id={`${id}-models`}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </datalist>
        <HugeiconsIcon
          icon={ArrowRight02Icon}
          strokeWidth={1.75}
          aria-hidden="true"
          className="size-4 shrink-0 self-center text-muted-foreground max-sm:rotate-90"
        />
        <Input
          id={`${id}-alias`}
          aria-label={t('oauth_model_alias.alias_placeholder')}
          className="h-9 font-mono text-sm sm:flex-1"
          placeholder={t('oauth_model_alias.alias_placeholder')}
          value={entry.alias}
          onChange={(event) => onChange('alias', event.target.value)}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id={`${id}-fork`}
            size="sm"
            checked={Boolean(entry.fork)}
            onCheckedChange={(value) => onChange('fork', value)}
            disabled={disabled}
          />
          <Label htmlFor={`${id}-fork`} className="font-normal text-muted-foreground">
            {t('oauth_model_alias.alias_fork_label')}
          </Label>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          disabled={disabled || !canRemove}
          title={removeLabel}
          aria-label={removeLabel}
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
}
