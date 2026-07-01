import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right' | 'center';
  render: (row: T, rowIndex: number) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowKey: (row: T, index: number) => string;
  rowClassName?: (row: T, index: number) => string | undefined;
  stickyHeader?: boolean;
  className?: string;
}

const alignClass: Record<NonNullable<DataTableColumn<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  rowClassName,
  stickyHeader = true,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn('rounded-lg border', className)}>
      <Table>
        <TableHeader
          className={cn(
            'bg-h2mb-navy',
            stickyHeader && 'sticky top-0',
          )}
        >
          <TableRow className="hover:bg-h2mb-navy border-none">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  'text-white first:rounded-tl-lg last:rounded-tr-lg',
                  alignClass[col.align ?? 'left'],
                  col.className,
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, index) => (
            <TableRow key={getRowKey(row, index)} className={rowClassName?.(row, index)}>
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={cn(alignClass[col.align ?? 'left'], col.className)}
                >
                  {col.render(row, index)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
