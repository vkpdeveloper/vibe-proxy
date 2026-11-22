import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input as UiInput } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
  rightElement?: ReactNode;
}

/** The old labelled input on top of VM Bridge's Field and Input. */
export function Input({ label, hint, error, rightElement, className, id, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy =
    [rest['aria-describedby'], errorId, hintId].filter(Boolean).join(' ') || undefined;
  const inputProps = {
    ...rest,
    id: inputId,
    className,
    'aria-invalid': Boolean(error) || rest['aria-invalid'],
    'aria-describedby': describedBy,
  };

  return (
    <Field data-invalid={Boolean(error) || undefined} className="mb-4 last:mb-0">
      {label && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
      {rightElement ? (
        <InputGroup>
          <InputGroupInput {...inputProps} />
          <InputGroupAddon align="inline-end">{rightElement}</InputGroupAddon>
        </InputGroup>
      ) : (
        <UiInput {...inputProps} />
      )}
      {hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  );
}
