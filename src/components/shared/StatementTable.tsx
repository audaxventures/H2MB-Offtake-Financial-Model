import { Fragment } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DSCRBadge } from '@/components/shared/Badge';
import { cn } from '@/lib/utils';
import type { AnnualResult } from '@/engine/types';

export interface RowSpec {
  key: string;
  section?: string;
  label: string;
  render: (a: AnnualResult) => string;
  emphasis?: boolean;
  highlightPayback?: boolean;
  isDscr?: boolean;
  /** Marks this row as belonging to the condensed "Summary" view (PDF export) — ignored on screen, where the full row set always shows. */
  summary?: boolean;
}

interface StatementTableProps {
  annual: AnnualResult[];
  rows: RowSpec[];
  equityPaybackYear?: number | null;
  /** Removes the scroll/max-height clamp so the whole table renders unclipped — used when capturing the table for a PDF page. */
  printMode?: boolean;
}

/** Shared sticky-header, sticky-first-column financial statement table used by the P&L, Cash Flow, and other year-by-year views. */
export function StatementTable({ annual, rows, equityPaybackYear, printMode }: StatementTableProps) {
  return (
    <div className={printMode ? 'w-fit rounded-lg border' : 'max-h-[70vh] overflow-auto rounded-lg border'}>
      <Table>
        <TableHeader className="bg-h2mb-navy sticky top-0 z-10">
          <TableRow className="hover:bg-h2mb-navy border-none">
            <TableHead className="bg-h2mb-navy sticky left-0 z-20 text-white">Line Item</TableHead>
            {annual.map((a) => (
              <TableHead
                key={a.year}
                className={cn(
                  'text-right whitespace-nowrap text-white',
                  a.isConstruction && 'bg-h2mb-construction/70',
                  a.isPartialRevenue && 'bg-h2mb-blue/40',
                )}
              >
                Year {a.year}
                {a.isConstruction && <div className="text-[10px] font-normal opacity-90">Construction</div>}
                {a.isPartialRevenue && (
                  <div className="text-[10px] font-normal opacity-90">Partial Revenue</div>
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <Fragment key={row.key}>
              {row.section && (
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  <TableCell
                    colSpan={annual.length + 1}
                    className="bg-muted/60 sticky left-0 text-xs font-bold tracking-wide text-muted-foreground uppercase"
                  >
                    {row.section}
                  </TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell className={cn('bg-card sticky left-0 whitespace-nowrap', row.emphasis && 'font-semibold')}>
                  {row.label}
                </TableCell>
                {annual.map((a) => {
                  const isPaybackYear = row.highlightPayback && a.year === equityPaybackYear;
                  if (row.isDscr) {
                    return (
                      <TableCell key={a.year} className="text-right">
                        <DSCRBadge value={a.dscr} />
                      </TableCell>
                    );
                  }
                  return (
                    <TableCell
                      key={a.year}
                      className={cn(
                        'text-right',
                        row.emphasis && 'font-semibold',
                        isPaybackYear && 'bg-h2mb-success-bg text-h2mb-success font-semibold',
                        a.isConstruction && 'bg-h2mb-construction-bg/50',
                      )}
                    >
                      {row.render(a)}
                    </TableCell>
                  );
                })}
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
