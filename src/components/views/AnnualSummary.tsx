import { Fragment, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DSCRBadge } from '@/components/shared/Badge';
import { RevenueEBITDAChart } from '@/components/charts/RevenueEBITDAChart';
import { DebtWaterfallChart } from '@/components/charts/DebtWaterfallChart';
import { DSCRChart } from '@/components/charts/DSCRChart';
import { cn } from '@/lib/utils';
import { EXPENSE_CATEGORY_LABELS } from '@/engine/types';
import type { AnnualResult, ExpenseCategory } from '@/engine/types';
import { formatCurrency, formatDSCR, formatPercent } from '@/engine/formatters';
import { useScenarioStore } from '@/store/scenarioStore';
import { useModelOutputs } from '@/store/useModelOutputs';

interface RowSpec {
  key: string;
  section?: string;
  label: string;
  render: (a: AnnualResult) => string;
  emphasis?: boolean;
  highlightPayback?: boolean;
  isDscr?: boolean;
}

export function AnnualSummary() {
  const current = useScenarioStore((s) => s.current);
  const outputs = useModelOutputs();
  const { annual, equityPaybackYear } = outputs;

  const usedCategories = useMemo(() => {
    const set = new Set<ExpenseCategory>();
    for (const item of current.expenseLineItems) {
      if (item.category !== 'cogs') set.add(item.category);
    }
    for (const a of annual) {
      for (const category of Object.keys(a.expensesByCategory) as ExpenseCategory[]) {
        if (category !== 'cogs') set.add(category);
      }
    }
    return Array.from(set);
  }, [current.expenseLineItems, annual]);

  const rows: RowSpec[] = [
    { key: 'revenue', section: 'Revenue', label: 'Hydrogen Sales Revenue', render: (a) => formatCurrency(a.revenue) },
    { key: 'cogs', label: 'Cost of Goods Sold', render: (a) => formatCurrency(-a.cogs) },
    { key: 'grossProfit', label: 'Gross Profit', render: (a) => formatCurrency(a.grossProfit), emphasis: true },
    { key: 'grossMargin', label: 'Gross Margin %', render: (a) => formatPercent(a.grossMarginPct) },

    {
      key: 'preRevenueOpex',
      section: 'Operating Expenses',
      label: 'Pre-Revenue / Construction OpEx',
      render: (a) => formatCurrency(-a.preRevenueOpex),
    },
    ...usedCategories.map(
      (category): RowSpec => ({
        key: `expense-${category}`,
        label: EXPENSE_CATEGORY_LABELS[category],
        render: (a) => formatCurrency(-(a.expensesByCategory[category] ?? 0)),
      }),
    ),
    {
      key: 'totalOpex',
      label: 'Total Operating Expenses',
      render: (a) => formatCurrency(-(a.totalOperatingExpenses + a.preRevenueOpex)),
      emphasis: true,
    },
    { key: 'ebitda', label: 'EBITDA', render: (a) => formatCurrency(a.ebitda), emphasis: true },
    { key: 'ebitdaMargin', label: 'EBITDA Margin %', render: (a) => formatPercent(a.ebitdaMarginPct) },

    { key: 'da', section: 'Depreciation & EBIT', label: 'D&A (20yr SL, 5% salvage)', render: (a) => formatCurrency(-a.depreciation) },
    { key: 'ebit', label: 'EBIT', render: (a) => formatCurrency(a.ebit), emphasis: true },

    { key: 'interest', section: 'Debt Service', label: 'Interest Expense', render: (a) => formatCurrency(-a.interest) },
    { key: 'principal', label: 'Principal Repayment', render: (a) => formatCurrency(-a.principal) },
    { key: 'itc', label: 'ITC Received', render: (a) => formatCurrency(a.itcReceived) },
    { key: 'extraPrincipal', label: 'Extra Principal (ITC)', render: (a) => formatCurrency(-a.extraPrincipalFromITC) },
    { key: 'totalDebtService', label: 'Total Debt Service', render: (a) => formatCurrency(a.totalDebtService), emphasis: true },
    { key: 'dscr', label: 'DSCR (annual)', render: (a) => formatDSCR(a.dscr), isDscr: true },
    {
      key: 'dscrHeadroom',
      label: 'DSCR vs 1.25x Target (headroom)',
      render: (a) => (a.dscrHeadroom !== null ? `${a.dscrHeadroom >= 0 ? '+' : ''}${a.dscrHeadroom.toFixed(2)}x` : 'N/A'),
    },

    { key: 'netCash', section: 'Cash Flow', label: 'Net Cash (EBITDA − Debt Service)', render: (a) => formatCurrency(a.netCash), emphasis: true },
    {
      key: 'cumulativeCF',
      label: 'Cumulative Cash Flow',
      render: (a) => formatCurrency(a.cumulativeCF),
      highlightPayback: true,
    },
    { key: 'closingDebt', label: 'Closing Debt Balance', render: (a) => formatCurrency(a.closingDebtBalance) },
  ];

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{annual.length}-Year P&amp;L Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[70vh] overflow-auto rounded-lg border">
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
            <RevenueEBITDAChart
              annual={annual}
              itcReceivedYear={outputs.periods.find((p) => p.itcReceived > 0)?.year ?? null}
            />
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
