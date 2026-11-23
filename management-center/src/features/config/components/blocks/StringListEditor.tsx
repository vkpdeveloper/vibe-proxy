import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { makeClientId } from '@/types/visualConfig';
import { ExpandableInput } from './ExpandableInput';
import { AddButton, RemoveButton } from './parts';

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
          <RemoveButton
            label={t('config_management.visual.common.delete')}
            onClick={() => removeItem(index)}
            disabled={disabled}
          />
        </div>
      ))}
      <AddButton onClick={addItem} disabled={disabled}>
        {t('config_management.visual.common.add')}
      </AddButton>
    </div>
  );
});
