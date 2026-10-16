import * as React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Table — design system §9
// The ledger is the product, so the table carries the weight: tabular figures
// from the base layer, a sticky header, and one way to align money (`num`).
// No hex, no arbitrary text sizes — the old header was bg-[#F9F9F9] and
// text-[11px], both now bg-surface / text-micro.
// ============================================

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-body', className)} {...props} />
    </div>
  ),
);
Table.displayName = 'Table';

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('border-b border-hairline-strong bg-surface', className)} {...props} />
  ),
);
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn('[&_tr:last-child]:border-0 [&_tr:nth-child(even)]:bg-surface/60', className)}
      {...props}
    />
  ),
);
TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-hairline-soft transition-colors duration-120 hover:bg-accent-soft/70 data-[state=selected]:bg-accent-soft',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Right-align as tabular figures, for a header above a money column (P2). */
  num?: boolean;
}

export const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, num = false, ...props }, ref) => (
    <th
      ref={ref}
      // Sticky lives on the <th>, not the <thead>: a page can override the header
      // background (StudentList forces bg-white) and bg-inherit picks that up while
      // the cell keeps pinning itself to the scroll container.
      className={cn(
        'sticky top-0 z-sticky bg-inherit h-row px-2.5 py-1 text-left align-middle text-micro font-semibold uppercase tracking-wide whitespace-nowrap text-ink-muted',
        num && 'text-right',
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = 'TableHead';

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /** Money cell: tabular, right-aligned, never wraps mid-value (P2). */
  num?: boolean;
}

export const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, num = false, ...props }, ref) => (
    <td ref={ref} className={cn('px-2.5 py-1.5 align-middle text-body', num && 'num', className)} {...props} />
  ),
);
TableCell.displayName = 'TableCell';

/**
 * Sortable column header. Extracted from StudentList, which had a private copy —
 * every table in the app (directory, ledger, audit, expenses, bank) needs the same
 * affordance, and P4 requires the direction to be carried by an arrow and not by
 * colour alone.
 */
export function TableSortHead<K extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  num = false,
  className,
  ...props
}: Omit<TableHeadProps, 'children'> & {
  label: string;
  sortKey: K;
  activeKey: K;
  dir: 'asc' | 'desc';
  onSort: (key: K) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead
      num={num}
      // aria-sort is a column property and must sit on the <th>, not the button.
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('p-0', className)}
      {...props}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex h-full w-full cursor-pointer items-center gap-1.5 px-2.5 transition-colors duration-120',
          num && 'justify-end',
          active ? 'font-semibold text-ink' : 'hover:text-ink',
        )}
      >
        {label}
        {active && (dir === 'asc' ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />)}
      </button>
    </TableHead>
  );
}
