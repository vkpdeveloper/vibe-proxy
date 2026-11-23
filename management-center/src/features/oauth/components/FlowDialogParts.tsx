import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircle02Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ProviderLogo } from '@/features/providers/components/ProviderLogo';
import { splitAuthUrl } from '../flowView';

export interface DialogHeading {
  title: string;
  caption: string;
  icon: string;
}

/** Dialog frame shared by every sign-in and import dialog: brand header, body, optional footer. */
export function FlowDialog({
  open,
  heading,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  heading: DialogHeading;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-lg">
        <FlowDialogHeader {...heading} />
        {children}
        {footer}
      </DialogContent>
    </Dialog>
  );
}

/** One dialog view (form, steps, result). Keyed by the caller so a switch replays a short fade. */
export function FlowView({ children }: { children: ReactNode }) {
  return (
    // min-w-0: the dialog is a grid, so without it a long sign-in link widens the view past the edge.
    <div className="flex min-w-0 flex-col gap-5 duration-150 ease-out animate-in fade-in-0 motion-reduce:animate-none">
      {children}
    </div>
  );
}

function FlowDialogHeader({ title, caption, icon }: DialogHeading) {
  return (
    <DialogHeader className="flex-row items-center gap-3 pr-8">
      <ProviderLogo src={icon} className="size-9 rounded-lg" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <DialogTitle className="truncate">{title}</DialogTitle>
        <DialogDescription className="truncate">{caption}</DialogDescription>
      </div>
    </DialogHeader>
  );
}

export function FlowAlert({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm break-words text-destructive"
      role="alert"
    >
      {children}
    </div>
  );
}

/** Numbered steps; the numbers come from a CSS counter so conditional steps stay in order. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex flex-col gap-5 [counter-reset:step]">{children}</ol>;
}

export function Step({
  title,
  titleFor,
  children,
}: {
  title: string;
  titleFor?: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3 [counter-increment:step]">
      <span
        className="grid size-5 shrink-0 place-items-center rounded-full bg-muted font-mono text-xs text-muted-foreground before:content-[counter(step)]"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex min-h-5 items-center">
          {titleFor ? (
            <Label htmlFor={titleFor}>{title}</Label>
          ) : (
            <span className="text-sm leading-none font-medium">{title}</span>
          )}
        </div>
        {children}
      </div>
    </li>
  );
}

/** The sign-in link with its host highlighted, so the user can check where it goes. */
export function AuthUrlField({
  url,
  copyLabel,
  pendingLabel,
}: {
  url?: string;
  copyLabel: string;
  pendingLabel: string;
}) {
  const parts = url ? splitAuthUrl(url) : null;
  return (
    <div
      className="flex h-9 min-w-0 items-center gap-1 rounded-lg border border-input pr-0.5 pl-3 dark:bg-input/30"
      aria-busy={!url}
    >
      {parts ? (
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={url}>
          <span className="text-foreground">{parts.host}</span>
          <span className="text-muted-foreground">{parts.rest}</span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm text-faint">{pendingLabel}</span>
      )}
      {url && <CopyButton value={url} label={copyLabel} />}
    </div>
  );
}

export function OpenLinkButton({ url, label }: { url?: string; label: string }) {
  return (
    <Button
      size="lg"
      className="h-9 px-4 max-sm:h-10 max-sm:w-full sm:w-fit"
      disabled={!url}
      onClick={() => url && window.open(url, '_blank', 'noopener,noreferrer')}
    >
      {label}
      <HugeiconsIcon icon={LinkSquare02Icon} data-icon="inline-end" strokeWidth={1.75} />
    </Button>
  );
}

/** Callback URL form row: the input and its submit button, stacked on phones. */
export function CallbackForm({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

export function CallbackFeedback({
  id,
  tone,
  children,
}: {
  id: string;
  tone: 'error' | 'success';
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      className={cn('text-sm', tone === 'error' ? 'text-destructive' : 'text-success')}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

type FooterTone = 'pending' | 'waiting' | 'error';

const FOOTER_DOT: Record<FooterTone, string> = {
  pending: 'bg-muted-foreground/50',
  waiting: 'bg-primary',
  error: 'bg-destructive',
};

/** Live status of a running sign-in, with one action on the right. */
export function FlowFooter({
  tone,
  label,
  hint,
  children,
}: {
  tone: FooterTone;
  label: string;
  /** A quiet line under the label, for footers without a button. */
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <DialogFooter className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:justify-between">
      {/* On phones the hint sits under the label and the row is button height, so every footer
          is as tall as the others; wider screens keep the hint at the far end. */}
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground max-sm:min-h-10">
        <span className={cn('size-2 shrink-0 rounded-full', FOOTER_DOT[tone])} aria-hidden="true" />
        <p className="flex min-w-0 flex-col" role="status" aria-live="polite">
          <span className={cn('break-words', tone === 'error' && 'text-destructive')}>{label}</span>
          {hint && <span className="text-xs text-faint sm:hidden">{hint}</span>}
        </p>
      </div>
      {hint && <span className="text-xs text-faint max-sm:hidden">{hint}</span>}
      {children}
    </DialogFooter>
  );
}

/** Finished view: a static check, a title, details and the next actions. */
export function ResultView({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        strokeWidth={1.75}
        className="size-10 text-success duration-200 ease-out animate-in fade-in-0 zoom-in-90 motion-reduce:animate-none"
        aria-hidden="true"
      />
      <p className="text-base font-medium">{title}</p>
      {children}
      <div className="mt-2 flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">{actions}</div>
    </div>
  );
}
