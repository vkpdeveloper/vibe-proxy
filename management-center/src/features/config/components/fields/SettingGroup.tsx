import { useState, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';

/**
 * A collapsible group of settings. Built on <details> so a search jump can open it
 * (useFieldJump looks for the closest <details> around the target field).
 */
export function SettingGroup({
  label,
  hint,
  defaultOpen = false,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="group/setting-group rounded-xl border bg-card"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 outline-none select-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 group-open/setting-group:rounded-b-none [&::-webkit-details-marker]:hidden">
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={1.75}
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-open/setting-group:rotate-90 motion-reduce:transition-none"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">{label}</span>
          {hint ? <span className="text-[13px] text-muted-foreground">{hint}</span> : null}
        </span>
      </summary>
      {/* Always rendered: closed <details> hides it, and search jumps need the field ids. */}
      <div className="flex flex-col gap-4 border-t p-3 sm:p-4">{children}</div>
    </details>
  );
}
