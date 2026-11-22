import type { ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
  ariaLabel?: string;
  /** For an outside <label htmlFor>; without it only label / ariaLabel name the switch. */
  id?: string;
  ariaDescribedBy?: string;
  disabled?: boolean;
  labelPosition?: 'left' | 'right';
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  ariaLabel,
  id,
  ariaDescribedBy,
  disabled = false,
  labelPosition = 'right',
}: ToggleSwitchProps) {
  const control = (
    <Switch
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
    />
  );
  if (!label) return control;

  return (
    <label
      className={cn(
        'inline-flex min-w-0 cursor-pointer items-center gap-2.5 text-sm select-none',
        labelPosition === 'left' && 'flex-row-reverse',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      {control}
      <span className="min-w-0">{label}</span>
    </label>
  );
}
