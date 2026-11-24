import {
  useContext,
  useEffect,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/tooltip';
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

/**
 * Header and content share one centred column, so the header's actions end where the content
 * does. Wide pages stop where a card grid still reads as one block; forms and lists stay narrow.
 */
export const PAGE_FRAME = {
  wide: 'mx-auto max-w-[88rem]',
  tabs: 'mx-auto max-w-3xl lg:max-w-[63rem]',
  narrow: 'mx-auto max-w-3xl',
};

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
  /** For sub-pages: a Back button before the title. */
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

  const frame = wide ? PAGE_FRAME.wide : tabs ? PAGE_FRAME.tabs : PAGE_FRAME.narrow;

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
        <PageHeader title={title} actions={actions} onBack={onBack} frame={frame} />
      )}
      {/* Positioned so absolute children (sr-only text, popovers) scroll and clip with the page,
          instead of stretching the layout's own scroller. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-8 sm:px-10 sm:py-8">
          <div className={cn('flex flex-col gap-4 sm:gap-6 lg:flex-row lg:gap-12', frame)}>
            {tabs && <Tabs tabs={tabs} tab={tab} onTab={onTab} />}
            <div className="flex min-w-0 flex-1 flex-col gap-8 sm:gap-10">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The desktop page header. Pages with their own layout (Config's source mode) use it directly so
 * their title and actions sit exactly where Page puts them.
 */
export function PageHeader({
  title,
  actions,
  onBack,
  frame,
}: {
  title: string;
  actions?: ReactNode;
  onBack?: () => void;
  frame: string;
}) {
  const { t } = useTranslation();
  return (
    // A fixed minimum height keeps pages with and without actions the same height.
    <header className="shrink-0 border-b px-5 py-2 sm:px-10">
      <div className={cn('flex min-h-10 items-center gap-3', frame)}>
        {onBack && (
          <Hint label={t('common.back')} side="bottom">
            <Button
              variant="ghost"
              size="icon-lg"
              className="-mr-1 -ml-2 shrink-0"
              onClick={onBack}
              aria-label={t('common.back')}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" strokeWidth={1.75} />
            </Button>
          </Hint>
        )}
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight sm:text-xl">
          {title}
        </h1>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
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

// Tailwind's lg, where the tab strip turns into a vertical list.
const WIDE_QUERY = '(min-width: 64rem)';
const watchWide = (onChange: () => void) => {
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};
const isWide = () => window.matchMedia(WIDE_QUERY).matches;

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
  const vertical = useSyncExternalStore(watchWide, isWide, () => false);

  // Tab pattern: one tab stop, arrow keys (either axis, the strip turns vertical from lg)
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
    // Until it turns vertical (lg) the strip stays pinned while the page scrolls under it. The
    // background sits on this wrapper because the strip's own edge fade is a mask, which would
    // let content show through.
    <div className="max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:-my-2 max-lg:bg-background max-lg:py-2 max-sm:-mx-4 lg:contents">
      <nav
        {...navProps}
        role="tablist"
        onKeyDown={onKeyDown}
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        // A vertical list beside the content from lg; it stays in view while the content scrolls.
        className="relative -mx-1 flex shrink-0 gap-1 overflow-x-auto max-sm:mx-0 max-sm:scroll-fade-x max-sm:px-4 lg:sticky lg:top-8 lg:mx-0 lg:w-48 lg:flex-col lg:self-start"
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
              'relative h-10 shrink-0 justify-start gap-2 px-3 text-sm text-muted-foreground hover:bg-transparent lg:gap-3 dark:hover:bg-transparent',
              entry.id === tab && 'text-foreground'
            )}
          >
            <HugeiconsIcon
              icon={entry.icon}
              className={cn('size-5 max-lg:hidden', entry.id === tab && 'text-primary')}
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
        <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight sm:text-base">
          {icon}
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
