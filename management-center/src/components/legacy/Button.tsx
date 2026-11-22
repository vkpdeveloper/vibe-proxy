import { Children, isValidElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Loading03Icon } from '@hugeicons/core-free-icons';
import { Button as UiButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
}

const VARIANTS = {
  primary: 'default',
  secondary: 'outline',
  ghost: 'ghost',
  danger: 'destructive',
} as const;

/** The old Button API on top of the VM Bridge button. */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  className,
  disabled,
  ...rest
}: PropsWithChildren<ButtonProps>) {
  // A lone icon with an accessible name is an icon button: square, like VM Bridge's.
  const items = Children.toArray(children);
  const iconOnly =
    items.length === 1 &&
    isValidElement(items[0]) &&
    typeof items[0].type !== 'string' &&
    Boolean(rest['aria-label'] ?? rest.title);
  const uiSize = iconOnly ? (size === 'sm' ? 'icon-sm' : 'icon') : size === 'sm' ? 'sm' : 'default';

  return (
    <UiButton
      variant={VARIANTS[variant]}
      size={uiSize}
      className={cn(fullWidth && 'w-full', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <HugeiconsIcon
          icon={Loading03Icon}
          strokeWidth={2}
          className="animate-spin motion-reduce:animate-none"
        />
      )}
      {iconOnly && loading ? null : children}
    </UiButton>
  );
}
