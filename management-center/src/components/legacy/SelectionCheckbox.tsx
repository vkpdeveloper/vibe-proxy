import { useId, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface SelectionCheckboxProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
}

export function SelectionCheckbox({
  checked,
  onChange,
  label,
  ariaLabel,
  title,
  disabled = false,
  className,
  labelClassName,
}: SelectionCheckboxProps) {
  const id = useId();
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 text-sm',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
      title={title}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        aria-label={ariaLabel}
        disabled={disabled}
      />
      {label ? (
        <label htmlFor={id} className={cn('min-w-0 cursor-pointer select-none', labelClassName)}>
          {label}
        </label>
      ) : null}
    </span>
  );
}
