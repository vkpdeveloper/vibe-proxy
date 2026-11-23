import { useContext, useEffect, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NavIndicator, useSlidingNav } from './nav';
import { PageBarContext, usePageBar } from './pageBar';

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
  onBack,
  children,
}: {
  title: string;
  /** Shown beside the title, for state that applies to every tab. */
  actions?: ReactNode;
  /** For sub-pages: a Back button, before the title on phones and before the actions otherwise. */
  onBack?: () => void;
  tabs?: Tab<T>[];
  tab?: T;
  onTab?: (tab: T) => void;
  /** Use the full width, for dashboards and card grids. Forms and lists read better narrow. */
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const pageBar = usePageBar();

  return (
    <div className="flex h-full flex-col">
      {pageBar ? (
        <PageBarContent
          bar={pageBar}
          title={title}
          actions={actions}
          back={
            onBack && (
              <Button
                variant="ghost"
                size="icon-lg"
                className="-ml-2.5 size-10 shrink-0"
                onClick={onBack}
                aria-label={t('common.back')}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" strokeWidth={1.75} />
              </Button>
            )
          }
        />
      ) : (
        // The top bar already names the page, so this stays a slim row. A fixed minimum height
        // keeps pages with and without actions the same height.
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-5 py-2 sm:px-10">
          <h1 className="min-w-0 truncate text-base font-semibold tracking-tight sm:text-lg">
            {title}
          </h1>
          {onBack ? (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                size="lg"
                className="h-9 px-3"
                onClick={onBack}
                aria-label={t('common.back')}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.75} data-icon="inline-start" />
                {t('common.back')}
              </Button>
              {actions}
            </div>
          ) : (
            actions
          )}
        </header>
      )}
      {/* Positioned so absolute children (sr-only text, popovers) scroll and clip with the page,
          instead of stretching the layout's own scroller. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-4 pt-4 pb-8 sm:gap-6 sm:px-10 sm:py-8 md:flex-row md:gap-12">
          {tabs && <Tabs tabs={tabs} tab={tab} onTab={onTab} />}
          <div className={cn('flex min-w-0 flex-1 flex-col gap-8 sm:gap-10', !wide && 'max-w-2xl')}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A page's title and actions inside the app's top bar on phones. Pages with their own header
 * (Config's source mode) use it directly; Page uses it for everyone else.
 */
export function PageBarContent({
  bar,
  title,
  actions,
  back,
}: {
  bar: HTMLElement;
  title: string;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  const { register, title: shortTitle } = useContext(PageBarContext);
  // A sub-page with a back button keeps its own title; top-level pages use their short name.
  const shown = back ? title : (shortTitle ?? title);
  const hasActions = Boolean(actions);
  const hasBack = Boolean(back);
  useEffect(
    () => register({ actions: hasActions, back: hasBack }),
    [register, hasActions, hasBack]
  );

  return createPortal(
    <>
      {back}
      {/* Long sub-page titles get a second line rather than losing their end. */}
      <h1
        title={title}
        className="line-clamp-2 min-w-0 flex-1 text-base leading-tight font-semibold tracking-tight break-words"
      >
        {shown}
      </h1>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </>,
    bar
  );
}

/**
 * On phones the tabs scroll sideways under an end fade: keep the active one fully in view,
 * clear of the fade. A ref on the active tab only, so it runs when a tab becomes active.
 * Scrolls the strip only, never the page.
 */
function revealTab(item: HTMLElement | null) {
  const nav = item?.parentElement;
  if (!item || !nav || nav.scrollWidth <= nav.clientWidth) return;
  const margin = 48;
  const start = item.offsetLeft - margin;
  const end = item.offsetLeft + item.offsetWidth + margin - nav.clientWidth;
  if (nav.scrollLeft > start) nav.scrollTo({ left: start, behavior: 'smooth' });
  else if (nav.scrollLeft < end) nav.scrollTo({ left: end, behavior: 'smooth' });
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

  // Tab pattern: one tab stop, arrow keys (either axis, the strip turns vertical on desktop)
  // and Home/End move between tabs and select them.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const index = tabs.findIndex((entry) => entry.id === tab);
    const last = tabs.length - 1;
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = index >= last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = index <= 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
    onTab?.(tabs[next].id);
  };

  return (
    // Phones keep the strip pinned while the page scrolls under it. The background sits on this
    // wrapper because the strip's own edge fade is a mask, which would let content show through.
    <div className="max-sm:sticky max-sm:top-0 max-sm:z-10 max-sm:-mx-4 max-sm:-my-2 max-sm:bg-background max-sm:py-2 sm:contents">
      <nav
        {...navProps}
        role="tablist"
        onKeyDown={onKeyDown}
        className="relative -mx-1 flex shrink-0 gap-1 overflow-x-auto max-sm:mx-0 max-sm:scroll-fade-x max-sm:px-4 md:mx-0 md:w-48 md:flex-col"
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
            role="tab"
            aria-selected={entry.id === tab}
            tabIndex={entry.id === tab ? 0 : -1}
            ref={entry.id === tab ? revealTab : undefined}
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
    </div>
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
    <section className="flex flex-col gap-3 sm:gap-5">
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
