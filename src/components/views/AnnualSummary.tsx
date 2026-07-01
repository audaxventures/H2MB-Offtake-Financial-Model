import { Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DSCRBadge } from '@/components/shared/Badge';
import { RevenueEBITDAChart } from '@/components/charts/RevenueEBITDAChart';
import { DebtWaterfallChart } from '@/components/charts/DebtWaterfallChart';
import { DSCRChart } from '@/components/charts/DSCRChart';
import { cn } from '@/lib/utils';
import type { AnnualResult } from '@/engine/types';
import { formatCurrency, formatDSCR, formatPercent } from '@/engine/formatters';
import { useModelOutputs } from '@/store/useModelOutputs';

interface RowSpec {
  section?: string;
  label: string;
  render: (a: AnnualResult) => string;
  emphasis?: boolean;
  highlightPayback?: boolean;
}

export function AnnualSummary() {
  const outputs = useModelOutputs();
  const { annual, equityPaybackYear } = outputs;

  const rows: RowSpec[] = [
    { section: 'Revenue', label: 'Hydrogen Sales Revenue', render: (a) => formatCurrency(a.revenue) },
    { label: 'Cost of Goods Sold', render: (a) => formatCurrency(-a.cogs) },
    { label: 'Gross Profit', render: (a) => formatCurrency(a.grossProfit), emphasis: true },
    { label: 'Gross Margin %', render: (a) => formatPercent(a.grossMarginPct) },

    { section: 'Operating Expenses', label: 'Company Expenses', render: (a) => formatCurrency(-a.companyExpenses) },
    { label: 'EBITDA', render: (a) => formatCurrency(a.ebitda), emphasis: true },
    { label: 'EBITDA Margin %', render: (a) => formatPercent(a.ebitdaMarginPct) },

    { section: 'Depreciation & EBIT', label: 'D&A (20yr SL, 5% salvage)', render: (a) => formatCurrency(-a.depreciation) },
    { label: 'EBIT', render: (a) => formatCurrency(a.ebit), emphasis: true },

    { section: 'Debt Service', label: 'Interest Expense', render: (a) => formatCurrency(-a.interest) },
    { label: 'Principal Repayment', render: (a) => formatCurrency(-a.principal) },
    { label: 'ITC Received', render: (a) => formatCurrency(a.itcReceived) },
    { label: 'Extra Principal (ITC)', render: (a) => formatCurrency(-a.extraPrincipalFromITC) },
    { label: 'Total Debt Service', render: (a) => formatCurrency(a.totalDebtService), emphasis: true },
    { label: 'DSCR (annual)', render: (a) => formatDSCR(a.dscr) },
    {
      label: 'DSCR vs 1.25x Target (headroom)',
      render: (a) => (a.dscrHeadroom !== null ? `${a.dscrHeadroom >= 0 ? '+' : ''}${a.dscrHeadroom.toFixed(2)}x` : 'N/A'),
    },

    { section: 'Cash Flow', label: 'Net Cash (EBITDA − Debt Service)', render: (a) => formatCurrency(a.netCash), emphasis: true },
    {
      label: 'Cumulative Cash Flow',
      render: (a) => formatCurrency(a.cumulativeCF),
      highlightPayback: true,
    },
    { label: 'Closing Debt Balance', render: (a) => formatCurrency(a.closingDebtBalance) },
  ];

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>5-Year P&amp;L Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-h2mb-navy sticky top-0">
                <TableRow className="hover:bg-h2mb-navy border-none">
                  <TableHead className="text-white">Line Item</TableHead>
                  {annual.map((a) => (
                    <TableHead
                      key={a.year}
                      className={cn(
                        'text-right text-white',
                        a.isConstruction && 'bg-h2mb-construction/70',
                        a.isPartialRevenue && 'bg-h2mb-blue/40',
                      )}
                    >
                      Year {a.year}
                      {a.isConstruction && (
                        <div className="text-[10px] font-normal opacity-90">Construction</div>
                      )}
                      {a.isPartialRevenue && (
                        <div className="text-[10px] font-normal opacity-90">Partial Revenue</div>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <Fragment key={idx}>
                    {row.section && (
                      <TableRow className="bg-muted/60 hover:bg-muted/60">
                        <TableCell
                          colSpan={annual.length + 1}
                          className="text-muted-foreground text-xs font-bold tracking-wide uppercase"
                        >
                          {row.section}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell className={cn(row.emphasis && 'font-semibold')}>{row.label}</TableCell>
                      {annual.map((a) => {
                        const isPaybackYear =
                          row.highlightPayback && a.year === equityPaybackYear;
                        if (row.label === 'DSCR (annual)') {
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
          {equityPaybackYear && (
            <p className="text-muted-foreground mt-2 text-xs">
              Equity payback occurs in <span className="text-h2mb-success font-semibold">Year {equityPaybackYear}</span> (highlighted above).
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Revenue &amp; EBITDA vs. Total Costs</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueEBITDAChart annual={annual} itcReceivedYear={outputs.quarters.find((q) => q.itcReceived > 0)?.year ?? null} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Debt Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <DebtWaterfallChart annual={annual} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">DSCR by Year</CardTitle>
          </CardHeader>
          <CardContent>
            <DSCRChart annual={annual} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
