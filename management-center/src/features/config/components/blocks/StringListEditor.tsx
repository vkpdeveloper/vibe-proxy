import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { makeClientId } from '@/types/visualConfig';
import { ExpandableInput } from './ExpandableInput';

export const StringListEditor = memo(function StringListEditor({
  value,
  disabled,
  placeholder,
  inputAriaLabel,
  onChange,
}: {
  value: string[];
  disabled?: boolean;
  placeholder?: string;
  inputAriaLabel?: string;
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const items = value.length ? value : [];
  const [itemIds, setItemIds] = useState(() => items.map(() => makeClientId()));
  const renderItemIds = useMemo(() => {
    if (itemIds.length === items.length) return itemIds;
    if (itemIds.length > items.length) return itemIds.slice(0, items.length);
    return [
      ...itemIds,
      ...Array.from({ length: items.length - itemIds.length }, () => makeClientId()),
    ];
  }, [itemIds, items.length]);

  const updateItem = (index: number, nextValue: string) =>
    onChange(items.map((item, i) => (i === index ? nextValue : item)));
  const addItem = () => {
    setItemIds([...renderItemIds, makeClientId()]);
    onChange([...items, '']);
  };
  const removeItem = (index: number) => {
    setItemIds(renderItemIds.filter((_, i) => i !== index));
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div key={renderItemIds[index] ?? `item-${index}`} className="flex items-start gap-2">
          <ExpandableInput
            placeholder={placeholder}
            ariaLabel={inputAriaLabel ?? placeholder}
            value={item}
            onChange={(nextValue) => updateItem(index, nextValue)}
            disabled={disabled}
          />
          <Button
            variant="ghost"
            size="icon-lg"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => removeItem(index)}
            disabled={disabled}
            aria-label={t('config_management.visual.common.delete')}
            title={t('config_management.visual.common.delete')}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
          </Button>
        </div>
      ))}
      <div>
        <Button variant="outline" onClick={addItem} disabled={disabled}>
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" strokeWidth={2} />
          {t('config_management.visual.common.add')}
        </Button>
      </div>
    </div>
  );
});
