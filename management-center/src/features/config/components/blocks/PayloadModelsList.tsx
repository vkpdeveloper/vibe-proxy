import { useTranslation } from 'react-i18next';
import type { PayloadModelEntry } from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import type { SelectOption } from '../fields/OptionSelect';
import { OptionSelect } from '../fields/OptionSelect';
import { ExpandableInput } from './ExpandableInput';
import { AddButton, BlockLabel, RemoveButton } from './parts';

/** The model name and protocol rows a rule applies to (filter and replace rules). */
export function PayloadModelsList({
  models,
  protocolOptions,
  disabled,
  onChange,
}: {
  models: PayloadModelEntry[];
  protocolOptions: ReadonlyArray<SelectOption>;
  disabled?: boolean;
  onChange: (next: PayloadModelEntry[]) => void;
}) {
  const { t } = useTranslation();
  // Patches spread over the entry, so fields this list does not edit (from-protocol,
  // headers, conditions) survive.
  const update = (index: number, patch: Partial<PayloadModelEntry>) =>
    onChange(models.map((model, i) => (i === index ? { ...model, ...patch } : model)));

  return (
    <div className="flex flex-col gap-2">
      <BlockLabel>{t('config_management.visual.payload_rules.models')}</BlockLabel>
      {models.map((model, index) => (
        <div
          key={model.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 @lg:grid-cols-[minmax(0,1fr)_10rem_auto]"
        >
          <ExpandableInput
            placeholder={t('config_management.visual.payload_rules.model_name')}
            ariaLabel={t('config_management.visual.payload_rules.model_name')}
            value={model.name}
            onChange={(name) => update(index, { name })}
            disabled={disabled}
          />
          <div className="@max-lg:order-last @max-lg:col-span-2">
            <OptionSelect
              value={model.protocol ?? ''}
              options={protocolOptions}
              disabled={disabled}
              ariaLabel={t('config_management.visual.payload_rules.provider_type')}
              onChange={(protocol) => update(index, { protocol: protocol || undefined })}
            />
          </div>
          <RemoveButton
            label={t('config_management.visual.common.delete')}
            onClick={() => onChange(models.filter((_, i) => i !== index))}
            disabled={disabled}
          />
        </div>
      ))}
      <AddButton
        onClick={() => onChange([...models, { id: makeClientId(), name: '', protocol: undefined }])}
        disabled={disabled}
      >
        {t('config_management.visual.payload_rules.add_model')}
      </AddButton>
    </div>
  );
}
