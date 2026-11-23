import type { AriaAttributes } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type SelectOption<T extends string = string> = { value: T; label: string };

// Radix reserves '' for "nothing chosen", but some config options use '' as a real value.
const EMPTY_VALUE = '__config-empty__';
const encode = (value: string) => (value === '' ? EMPTY_VALUE : value);
const decode = (value: string) => (value === EMPTY_VALUE ? '' : value);

/** An options-array select for the config editors, on top of the Radix select. */
export function OptionSelect<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  className,
  disabled,
  id,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaInvalid,
}: {
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: AriaAttributes['aria-invalid'];
}) {
  // A value with no matching option shows the placeholder.
  const known = options.some((option) => option.value === value);
  return (
    <Select
      value={known ? encode(value) : ''}
      disabled={disabled}
      onValueChange={(next) => {
        if (!next) return;
        const option = options.find((entry) => entry.value === decode(next));
        if (option) onChange(option.value);
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className={cn('w-full data-[size=default]:h-9 max-sm:data-[size=default]:h-10', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value || EMPTY_VALUE} value={encode(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
