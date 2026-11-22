import type { ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NavIndicator, useSlidingNav } from './nav';

export interface Tab<T extends string> {
  id: T;
  label: string;
  icon: IconSvgElement;
  /** Shows a small dot, for something that still needs doing. */
  attention?: boolean;
  /** What the dot means, for screen readers (for example "2 errors, Unsaved"). */
  attentionLabel?: string;
}

/** A settings-style page: a title, an optional list of sub-pages on the left, and the content. */
export function Page<T extends string>({
  title,
  actions,
  tabs,
  tab,
  onTab,
  wide = false,
  children,
}: {
  title: string;
  /** Shown beside the title, for state that applies to every tab. */
  actions?: ReactNode;
  tabs?: Tab<T>[];
  tab?: T;
  onTab?: (tab: T) => void;
  /** Use the full width, for dashboards and card grids. Forms and lists read better narrow. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* The top bar already names the page, so this stays a slim row. A fixed minimum height
          keeps pages with and without actions the same height. */}
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-5 py-2 sm:px-10">
        <h1 className="min-w-0 truncate text-base font-semibold tracking-tight sm:text-lg">
          {title}
        </h1>
        {actions}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6 px-5 py-6 sm:px-10 sm:py-8 md:flex-row md:gap-12">
          {tabs && <Tabs tabs={tabs} tab={tab} onTab={onTab} />}
          <div className={cn('flex min-w-0 flex-1 flex-col gap-10', !wide && 'max-w-2xl')}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tabs<T extends string>({
  tabs,
  tab,
  onTab,
}: {
  tabs: Tab<T>[];
  tab?: T;
  onTab?: (tab: T) => void;
}) {
  const { hover, current, navProps, itemProps } = useSlidingNav(tab);
  return (
    <nav
      {...navProps}
      className="relative -mx-1 flex shrink-0 gap-1 overflow-x-auto md:mx-0 md:w-48 md:flex-col"
    >
      {hover && (
        <NavIndicator
          box={hover.box}
          shown={hover.shown}
          slide={hover.slide}
          className="rounded-lg bg-muted/50"
        />
      )}
      {current && (
        <NavIndicator box={current.box} slide={current.slide} className="rounded-lg bg-accent" />
      )}
      {tabs.map((entry) => (
        <Button
          key={entry.id}
          {...itemProps(entry.id, entry.label)}
          variant="ghost"
          size="lg"
          aria-current={entry.id === tab ? 'page' : undefined}
          onClick={() => onTab?.(entry.id)}
          className={cn(
            'relative h-10 shrink-0 justify-start gap-2 px-3 text-sm text-muted-foreground hover:bg-transparent md:gap-3 dark:hover:bg-transparent',
            entry.id === tab && 'text-foreground'
          )}
        >
          <HugeiconsIcon
            icon={entry.icon}
            className={cn('size-5 max-md:hidden', entry.id === tab && 'text-primary')}
            strokeWidth={1.75}
          />
          {entry.label}
          {entry.attention && <span aria-hidden className="size-1.5 rounded-full bg-warning" />}
          {entry.attentionLabel && <span className="sr-only">, {entry.attentionLabel}</span>}
        </Button>
      ))}
    </nav>
  );
}

export function Section({
  title,
  icon,
  actions,
  children,
}: {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          {icon}
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
