import type { AriaAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export interface FormSelectOption {
  value: string;
  label: string;
}

interface FormSelectProps {
  value: string;
  options: ReadonlyArray<FormSelectOption>;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: AriaAttributes['aria-invalid'];
}

// Radix reserves the empty string for "nothing chosen", but options like "Auto" use it as a value.
const EMPTY_VALUE = '__form-select-empty__';
const encode = (value: string) => (value === '' ? EMPTY_VALUE : value);
const decode = (value: string) => (value === EMPTY_VALUE ? '' : value);

/** An options-array Select that always shows the chosen option's label, even before it opens. */
export function FormSelect({
  value,
  options,
  onChange,
  id,
  disabled,
  placeholder,
  className,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaInvalid,
}: FormSelectProps) {
  const selected = options.find((option) => option.value === value);

  return (
    <Select
      value={selected ? encode(value) : ''}
      onValueChange={(next) => {
        if (next) onChange(decode(next));
      }}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className={cn('w-full min-w-0', className)}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
      >
        <SelectValue placeholder={placeholder}>{selected?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={encode(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface SwitchFieldProps {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** A labelled on/off setting: label and optional hint on the left, switch on the right. */
export function SwitchField({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: SwitchFieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <Field orientation="horizontal" data-disabled={disabled ? 'true' : undefined}>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
      </FieldContent>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={descriptionId}
        onCheckedChange={onCheckedChange}
      />
    </Field>
  );
}

interface SecretInputProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** API key input with a show/hide toggle that password managers leave alone. */
export function SecretInput({
  id,
  value,
  onValueChange,
  visible,
  onVisibleChange,
  placeholder,
  disabled,
  className,
}: SecretInputProps) {
  const { t } = useTranslation();
  const toggleLabel = visible
    ? t('providersPage.form.hideApiKey')
    : t('providersPage.form.showApiKey');
  return (
    <InputGroup className={className}>
      <InputGroupInput
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        autoComplete="new-password"
        data-1p-ignore="true"
        data-lpignore="true"
        data-bwignore="true"
        placeholder={placeholder}
        disabled={disabled}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={toggleLabel}
          title={toggleLabel}
          disabled={disabled}
          onClick={() => onVisibleChange(!visible)}
        >
          <HugeiconsIcon icon={visible ? ViewOffSlashIcon : ViewIcon} strokeWidth={1.75} />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

/** Form-level error, boxed so it stands out at the end of a long form. */
export function FormError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div
      id={id}
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {children}
    </div>
  );
}
