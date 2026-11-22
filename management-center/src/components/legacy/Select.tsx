import type { AriaAttributes } from 'react';
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: ReadonlyArray<SelectOption>;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: AriaAttributes['aria-invalid'];
  fullWidth?: boolean;
  size?: 'sm' | 'md';
  id?: string;
}

// Radix reserves the empty string for "nothing chosen", but options like "All" use it as a value.
const EMPTY_VALUE = '__legacy-select-empty__';
const encode = (value: string) => (value === '' ? EMPTY_VALUE : value);
const decode = (value: string) => (value === EMPTY_VALUE ? '' : value);

/** The old options-array Select on top of VM Bridge's Radix select. */
export function Select({
  value,
  options,
  onChange,
  placeholder,
  className,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaInvalid,
  fullWidth = true,
  size = 'md',
  id,
}: SelectProps) {
  // A value with no matching option shows the placeholder, as before.
  const known = options.some((option) => option.value === value);

  return (
    <UiSelect
      value={known ? encode(value) : ''}
      onValueChange={(next) => {
        if (next) onChange(decode(next));
      }}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size === 'sm' ? 'sm' : 'default'}
        className={cn(fullWidth && 'w-full', 'min-w-0', className)}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={encode(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </UiSelect>
  );
}
