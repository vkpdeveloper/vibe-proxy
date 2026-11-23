import { createContext, use, useState, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';

const GroupedContext = createContext(false);

/**
 * One card holding several collapsible groups, split by dividers, like the setting lists on
 * the other tabs. The groups inside drop their own card.
 */
export function SettingGroups({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card">
      <GroupedContext value={true}>{children}</GroupedContext>
    </div>
  );
}

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
  const grouped = use(GroupedContext);
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className={cn('group/setting-group', !grouped && 'rounded-xl border bg-card')}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-start gap-3 px-4 py-3 outline-none max-sm:min-h-12 max-sm:items-center select-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden',
          // Inside a shared card the edges clip, so the focus ring sits inside.
          grouped
            ? 'focus-visible:ring-inset'
            : 'rounded-xl group-open/setting-group:rounded-b-none'
        )}
      >
        {/* Wider screens: a chevron before the title, pointing right until open. Phones use the
            native disclosure: a down chevron at the end that flips when open, so a right-pointing
            chevron only ever means a row that navigates. */}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={1.75}
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none max-sm:order-last max-sm:ml-auto max-sm:group-open/setting-group:rotate-180 sm:mt-0.5 sm:-rotate-90 sm:group-open/setting-group:rotate-0"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">{label}</span>
          {hint ? <span className="text-[13px] text-muted-foreground">{hint}</span> : null}
        </span>
      </summary>
      {/* Always rendered: closed <details> hides it, and search jumps need the field ids.
          A group holding a single list shows its rows directly instead of a card inside a card.
          On phones the open content sits on a darker, indented panel so it reads as nested. */}
      <div className="flex flex-col gap-4 border-t p-3 max-sm:bg-background max-sm:[&>[data-slot=setting-list]:only-child>*]:pl-8 has-[>[data-slot=setting-list]:only-child]:p-0 sm:p-4 [&>[data-slot=setting-list]:only-child]:rounded-none [&>[data-slot=setting-list]:only-child]:border-0 [&>[data-slot=setting-list]:only-child]:bg-transparent">
        {children}
      </div>
    </details>
  );
}
