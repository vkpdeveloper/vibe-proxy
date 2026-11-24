import * as React from 'react';
import { type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';

import { toggleVariants } from '@/components/ui/toggle';

const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
    orientation?: 'horizontal' | 'vertical';
  }
>({
  size: 'default',
  variant: 'default',
  spacing: 2,
  orientation: 'horizontal',
});

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = 'horizontal',
  children,
  onKeyDown,
  onFocus,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
    orientation?: 'horizontal' | 'vertical';
  }) {
  // A single-choice group is a radio group: arrow keys select, not only move focus. Radix moves
  // focus after the keydown, so the arrow is remembered until the next item takes focus.
  const arrowed = React.useRef(false);
  const single = props.type === 'single';

  return (
    <ToggleGroupPrimitive.Root
      onKeyDown={(event) => {
        onKeyDown?.(event);
        arrowed.current = single && ARROW_KEYS.has(event.key);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (!arrowed.current) return;
        arrowed.current = false;
        const item = event.target;
        if (item instanceof HTMLElement && item.dataset.state === 'off') item.click();
      }}
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      style={{ '--gap': spacing } as React.CSSProperties}
      className={cn(
        // spacing={0} is a segmented control: a filled track with the selected item raised.
        'group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-lg data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-vertical:flex-col data-vertical:items-stretch data-[spacing=0]:gap-0.5 data-[spacing=0]:bg-muted data-[spacing=0]:p-0.5',
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing, orientation }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant = 'default',
  size = 'default',
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        // Segmented items (spacing 0) are 40px touch targets on phones, so their track is 44px.
        'shrink-0 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:rounded-md group-data-[spacing=0]/toggle-group:border-0 group-data-[spacing=0]/toggle-group:hover:bg-transparent group-data-[spacing=0]/toggle-group:data-[state=on]:bg-foreground/15 group-data-[spacing=0]/toggle-group:data-[state=on]:shadow-sm group-data-[spacing=0]/toggle-group:data-[state=on]:hover:bg-foreground/15 max-sm:group-data-[spacing=0]/toggle-group:h-10',
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
