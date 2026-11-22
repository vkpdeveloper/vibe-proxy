import type {
  HTMLAttributes,
  PropsWithChildren,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';
import {
  Table as UiTable,
  TableBody as UiTableBody,
  TableCell as UiTableCell,
  TableHead as UiTableHead,
  TableHeader as UiTableHeader,
  TableRow as UiTableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  className?: string;
  cols?: ReactNode;
}

/** VM Bridge's table inside a bordered rounded-xl group. */
export function Table({ children, cols, className, ...rest }: PropsWithChildren<TableProps>) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <UiTable className={cn('text-[13px]', className)} {...rest}>
        {cols ? <colgroup>{cols}</colgroup> : null}
        {children}
      </UiTable>
    </div>
  );
}

export function TableHeader({
  children,
  className,
  ...rest
}: PropsWithChildren<HTMLAttributes<HTMLTableSectionElement>>) {
  return (
    <UiTableHeader className={cn('bg-muted/50', className)} {...rest}>
      {children}
    </UiTableHeader>
  );
}

export function TableBody({
  children,
  className,
  ...rest
}: PropsWithChildren<HTMLAttributes<HTMLTableSectionElement>>) {
  return (
    <UiTableBody className={className} {...rest}>
      {children}
    </UiTableBody>
  );
}

interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
}

export function TableRow({
  children,
  className,
  selected,
  ...rest
}: PropsWithChildren<TableRowProps>) {
  return (
    <UiTableRow
      data-state={selected ? 'selected' : undefined}
      className={cn('data-[state=selected]:bg-primary/5', className)}
      {...rest}
    >
      {children}
    </UiTableRow>
  );
}

interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  alignRight?: boolean;
}

export function TableHead({
  children,
  className,
  alignRight,
  ...rest
}: PropsWithChildren<TableHeadProps>) {
  return (
    <UiTableHead
      className={cn(
        'h-9 px-3.5 text-xs font-medium text-muted-foreground',
        alignRight && 'text-right',
        className
      )}
      {...rest}
    >
      {children}
    </UiTableHead>
  );
}

interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  alignRight?: boolean;
}

export function TableCell({
  children,
  className,
  alignRight,
  ...rest
}: PropsWithChildren<TableCellProps>) {
  return (
    <UiTableCell
      className={cn(
        'px-3.5 py-3 align-top leading-normal whitespace-normal',
        alignRight && 'text-right',
        className
      )}
      {...rest}
    >
      {children}
    </UiTableCell>
  );
}
