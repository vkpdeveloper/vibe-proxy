import * as React from 'react';
import { cn } from '@/lib/utils';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

const InsideProvider = React.createContext(false);

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <InsideProvider value={true}>
      <TooltipPrimitive.Provider
        data-slot="tooltip-provider"
        delayDuration={delayDuration}
        {...props}
      />
    </InsideProvider>
  );
}

/**
 * Uses the app's shared provider (one delay, instant handoff between neighbours) when there is one,
 * and its own otherwise, so a component still renders on its own (isolated renders, tests).
 */
function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const root = <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
  return React.useContext(InsideProvider) ? (
    root
  ) : (
    <TooltipPrimitive.Provider>{root}</TooltipPrimitive.Provider>
  );
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

const OPEN_OVERLAY = '[role=dialog][data-state=open], [role=alertdialog][data-state=open]';

/**
 * A tooltip is the top Radix layer while it shows, so Escape only closes it and a dialog or sheet
 * under it stays open. While one is open, pass the Escape on once the tooltip is gone
 * (only then does the layer below listen again), so one press closes both. Tooltips have no exit
 * animation for the same reason: a fading tooltip is still the top layer and would take the
 * Escape meant for the dialog.
 */
function passEscapeOn(content: HTMLElement) {
  let frames = 0;
  const waitForUnmount = () => {
    if (content.isConnected && ++frames < 30) {
      requestAnimationFrame(waitForUnmount);
      return;
    }
    // The layer below starts listening in an effect after the tooltip unmounts.
    requestAnimationFrame(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
  };
  requestAnimationFrame(waitForUnmount);
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={contentRef}
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        onEscapeKeyDown={(event) => {
          onEscapeKeyDown?.(event);
          const content = contentRef.current;
          if (event.defaultPrevented || !event.isTrusted || !content) return;
          // Any open overlay, not just the trigger's own: the trigger may already have dropped
          // aria-describedby by the time Escape arrives.
          if (!document.querySelector(OPEN_OVERLAY)) return;
          passEscapeOn(content);
        }}
        className={cn(
          'z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/**
 * Our tooltip on one element, used instead of the native `title`, which is slow and unstyled.
 * The child must accept a ref and props (a Button, a native element, or a Radix trigger with `asChild`).
 */
function Hint({
  label,
  side,
  children,
}: {
  label: React.ReactNode;
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>['side'];
  children: React.ReactElement;
}) {
  if (label == null || label === '') return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

export { Hint, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
