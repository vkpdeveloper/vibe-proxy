import type { PropsWithChildren, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  title?: ReactNode;
  extra?: ReactNode;
  className?: string;
}

/** A bordered rounded-xl panel, like VM Bridge's grouped settings. */
export function Card({ title, extra, children, className }: PropsWithChildren<CardProps>) {
  return (
    <div className={cn('flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5', className)}>
      {(title || extra) && (
        <div className="flex flex-wrap items-center justify-between gap-2 *:min-w-0">
          <div className="min-w-0 flex-1 text-base font-semibold tracking-tight">{title}</div>
          {extra}
        </div>
      )}
      {children}
    </div>
  );
}
