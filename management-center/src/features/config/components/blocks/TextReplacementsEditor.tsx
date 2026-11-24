import { useTranslation } from 'react-i18next';
import type { TextReplacementEntry } from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import { OptionSelect } from '../fields/OptionSelect';
import { ExpandableInput } from './ExpandableInput';
import { AddButton, RemoveButton } from './parts';

const T = 'config_management.visual.replacements';

/**
 * Ordered find-and-replace rows: a literal text or a Go RE2 pattern, and what replaces it.
 * Narrow: kind and remove share a line with the inputs stacked below. Wide: one line.
 */
export function TextReplacementsEditor({
  value,
  disabled,
  onChange,
}: {
  value: TextReplacementEntry[];
  disabled?: boolean;
  onChange: (next: TextReplacementEntry[]) => void;
}) {
  const { t } = useTranslation();
  const kindOptions = [
    { value: 'text', label: t(`${T}.kind_text`) },
    { value: 'regex', label: t(`${T}.kind_regex`) },
  ] as const;

  const update = (index: number, patch: Partial<TextReplacementEntry>) =>
    onChange(value.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));

  return (
    <div className="@container flex flex-col gap-2">
      {value.map((entry, index) => (
        <div
          key={entry.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 @lg:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <OptionSelect
            value={entry.regex ? 'regex' : 'text'}
            options={kindOptions}
            disabled={disabled}
            ariaLabel={t(`${T}.kind`)}
            onChange={(kind) => update(index, { regex: kind === 'regex' })}
          />
          <div className="@max-lg:order-last @max-lg:col-span-2">
            <ExpandableInput
              className="font-mono"
              placeholder={t(entry.regex ? `${T}.pattern` : `${T}.find`)}
              ariaLabel={t(entry.regex ? `${T}.pattern` : `${T}.find`)}
              value={entry.from}
              disabled={disabled}
              onChange={(from) => update(index, { from })}
            />
          </div>
          <div className="@max-lg:order-last @max-lg:col-span-2">
            <ExpandableInput
              className="font-mono"
              placeholder={t(`${T}.replace_with`)}
              ariaLabel={t(`${T}.replace_with`)}
              value={entry.to}
              disabled={disabled}
              onChange={(to) => update(index, { to })}
            />
          </div>
          <RemoveButton
            label={t('config_management.visual.common.delete')}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            disabled={disabled}
          />
        </div>
      ))}
      <AddButton
        onClick={() => onChange([...value, { id: makeClientId(), regex: false, from: '', to: '' }])}
        disabled={disabled}
      >
        {t(`${T}.add`)}
      </AddButton>
    </div>
  );
}
