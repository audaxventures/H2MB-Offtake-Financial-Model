import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SliderInput } from '@/components/shared/SliderInput';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { DSCRBadge } from '@/components/shared/Badge';
import { cn } from '@/lib/utils';
import type { AnnualResult, QuarterResult } from '@/engine/types';
import { formatCurrency, formatCurrencyCompact } from '@/engine/formatters';
import { useScenarioStore } from '@/store/scenarioStore';
import { useModelOutputs } from '@/store/useModelOutputs';

const YEARS = [2, 3, 4, 5] as const;

export function QuarterlyModel() {
  const [selectedYear, setSelectedYear] = useState<number>(2);
  const [tableMode, setTableMode] = useState<'quarterly' | 'annual'>('quarterly');

  const current = useScenarioStore((s) => s.current);
  const updateQuarter = useScenarioStore((s) => s.updateQuarter);
  const setYearAnnualExpenses = useScenarioStore((s) => s.setYearAnnualExpenses);
  const outputs = useModelOutputs();

  const isDirectOfftake = current.production.offtakeMode === 'direct';
  const yearQuarters = current.quarters.filter((q) => q.year === selectedYear);
  const hasConstructionNote = selectedYear === 2;
  const annualExpensesForYear = yearQuarters[0]?.annualExpenses ?? 0;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Revenue Quarters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Tabs value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <TabsList>
              {YEARS.map((y) => (
                <TabsTrigger key={y} value={String(y)}>
                  Year {y}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {hasConstructionNote && (
              <Card className="bg-h2mb-construction-bg border-h2mb-construction/30 justify-center">
                <CardContent className="text-h2mb-construction text-center text-sm font-medium">
                  Q1 — Construction
                  <br />
                  (no revenue)
                </CardContent>
              </Card>
            )}
            {yearQuarters.map((q) => (
              <Card key={`${q.year}-${q.quarter}`}>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Y{q.year}Q{q.quarter}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {isDirectOfftake ? (
                    <SliderInput
                      label="Daily Quantity (kg)"
                      value={q.dailyQuantityKg}
                      onChange={(v) => updateQuarter(q.year, q.quarter, { dailyQuantityKg: v })}
                      min={10}
                      max={2_000}
                      step={10}
                      suffix=" kg"
                    />
                  ) : (
                    <SliderInput
                      label="Trucks / Day"
                      value={q.trucksPerDay}
                      onChange={(v) => updateQuarter(q.year, q.quarter, { trucksPerDay: v })}
                      min={1}
                      max={25}
                      step={1}
                    />
                  )}
                  <SliderInput
                    label="Operating Days"
                    value={q.operatingDays}
                    onChange={(v) => updateQuarter(q.year, q.quarter, { operatingDays: v })}
                    min={1}
                    max={92}
                    step={1}
                    helperText={
                      isDirectOfftake
                        ? 'Days product is delivered this quarter'
                        : 'Days trucks operate this quarter'
                    }
                  />
                  <SliderInput
                    label="H2 Price $/kg"
                    value={q.pricePerKg}
                    onChange={(v) => updateQuarter(q.year, q.quarter, { pricePerKg: v })}
                    min={5}
                    max={25}
                    step={0.25}
                    formatValue={(v) => formatCurrency(v, 2)}
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-h2mb-blue-bg/40">
            <CardHeader>
              <CardTitle className="text-sm">Annual Expenses — Year {selectedYear}</CardTitle>
            </CardHeader>
            <CardContent>
              <SliderInput
                label="Annual company expenses"
                value={annualExpensesForYear}
                onChange={(v) => setYearAnnualExpenses(selectedYear, v)}
                min={100_000}
                max={3_000_000}
                step={10_000}
                formatValue={(v) => formatCurrency(v)}
                helperText={`= ${formatCurrency(annualExpensesForYear / 4)} per quarter (÷4). Expenses are set at the year level, not per quarter.`}
              />
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{tableMode === 'quarterly' ? 'Quarterly Detail' : 'Annual Summary'}</CardTitle>
          <ToggleGroup
            type="single"
            variant="outline"
            value={tableMode}
            onValueChange={(v) => v && setTableMode(v as 'quarterly' | 'annual')}
          >
            <ToggleGroupItem value="quarterly">Quarterly</ToggleGroupItem>
            <ToggleGroupItem value="annual">Annual</ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          {tableMode === 'quarterly' ? (
            <QuarterlyTable quarters={outputs.quarters} annual={outputs.annual} />
          ) : (
            <AnnualMiniTable rows={outputs.annual} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type CombinedRow =
  | { kind: 'quarter'; data: QuarterResult }
  | { kind: 'subtotal'; data: AnnualResult };

function QuarterlyTable({
  quarters,
  annual,
}: {
  quarters: QuarterResult[];
  annual: AnnualResult[];
}) {
  const annualByYear = new Map(annual.map((a) => [a.year, a]));
  const rows: CombinedRow[] = [];
  for (const q of quarters) {
    rows.push({ kind: 'quarter', data: q });
    if (q.quarter === 4) {
      const subtotal = annualByYear.get(q.year);
      if (subtotal) rows.push({ kind: 'subtotal', data: subtotal });
    }
  }

  const columns: DataTableColumn<CombinedRow>[] = [
    {
      key: 'label',
      header: 'Quarter',
      render: (r) => (r.kind === 'quarter' ? r.data.label : `Year ${r.data.year} Total`),
    },
    {
      key: 'dailyQty',
      header: 'Daily Qty (kg)',
      align: 'right',
      render: (r) =>
        r.kind === 'quarter' && !r.data.isConstruction
          ? r.data.dailyQuantityKg.toLocaleString('en-CA')
          : '—',
    },
    {
      key: 'days',
      header: 'Op.Days',
      align: 'right',
      render: (r) => (r.kind === 'quarter' && !r.data.isConstruction ? r.data.operatingDays : '—'),
    },
    {
      key: 'price',
      header: '$/kg',
      align: 'right',
      render: (r) =>
        r.kind === 'quarter' && !r.data.isConstruction ? formatCurrency(r.data.pricePerKg, 2) : '—',
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      render: (r) => formatCurrency(r.data.revenue),
    },
    {
      key: 'grossProfit',
      header: 'Gross Profit',
      align: 'right',
      render: (r) => formatCurrency(r.data.grossProfit),
    },
    {
      key: 'expenses',
      header: 'Expenses (qtr)',
      align: 'right',
      render: (r) =>
        formatCurrency(r.kind === 'quarter' ? r.data.quarterlyExpenses : r.data.companyExpenses),
    },
    {
      key: 'annualBudget',
      header: 'Annual Budget',
      align: 'right',
      render: (r) =>
        r.kind === 'quarter'
          ? r.data.isConstruction
            ? '—'
            : formatCurrency(r.data.annualExpensesBudget)
          : '—',
    },
    { key: 'ebitda', header: 'EBITDA', align: 'right', render: (r) => formatCurrency(r.data.ebitda) },
    {
      key: 'interest',
      header: 'Interest',
      align: 'right',
      render: (r) => formatCurrency(r.data.interest),
    },
    {
      key: 'principal',
      header: 'Principal',
      align: 'right',
      render: (r) => formatCurrency(r.data.principal),
    },
    {
      key: 'itc',
      header: '⚡ ITC',
      align: 'right',
      render: (r) => (r.data.itcReceived > 0 ? formatCurrency(r.data.itcReceived) : '—'),
    },
    {
      key: 'netCash',
      header: 'Net Cash',
      align: 'right',
      render: (r) => formatCurrency(r.data.netCash),
    },
    {
      key: 'cumCF',
      header: 'Cum. CF',
      align: 'right',
      render: (r) => formatCurrency(r.data.cumulativeCF),
    },
    {
      key: 'debtBalance',
      header: 'Debt Balance',
      align: 'right',
      render: (r) => formatCurrency(r.data.closingDebtBalance),
    },
    {
      key: 'dscr',
      header: 'DSCR',
      align: 'right',
      render: (r) => <DSCRBadge value={r.data.dscr} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowKey={(r) => (r.kind === 'quarter' ? r.data.label : `Y${r.data.year}-subtotal`)}
      rowClassName={(r) =>
        cn(
          r.kind === 'quarter' && r.data.isConstruction && 'bg-h2mb-construction-bg/60',
          r.kind === 'quarter' && r.data.isITCQuarter && 'bg-h2mb-gold-bg',
          r.kind === 'subtotal' && 'bg-h2mb-navy/90 text-white font-semibold hover:bg-h2mb-navy/90',
        )
      }
    />
  );
}

interface AnnualMiniRow {
  year: number;
  revenue: number;
  ebitda: number;
  netCash: number;
  cumulativeCF: number;
  dscr: number | null;
  closingDebtBalance: number;
}

function AnnualMiniTable({ rows }: { rows: AnnualMiniRow[] }) {
  const columns: DataTableColumn<AnnualMiniRow>[] = [
    { key: 'year', header: 'Year', render: (r) => `Year ${r.year}` },
    { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatCurrencyCompact(r.revenue) },
    { key: 'ebitda', header: 'EBITDA', align: 'right', render: (r) => formatCurrencyCompact(r.ebitda) },
    { key: 'netCash', header: 'Net Cash', align: 'right', render: (r) => formatCurrencyCompact(r.netCash) },
    {
      key: 'cumCF',
      header: 'Cumulative CF',
      align: 'right',
      render: (r) => formatCurrencyCompact(r.cumulativeCF),
    },
    {
      key: 'debtBalance',
      header: 'Debt Balance',
      align: 'right',
      render: (r) => formatCurrencyCompact(r.closingDebtBalance),
    },
    {
      key: 'dscr',
      header: 'DSCR',
      align: 'right',
      render: (r) => <DSCRBadge value={r.dscr} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowKey={(r) => String(r.year)}
      rowClassName={(r) => (r.year === 1 ? 'bg-h2mb-construction-bg/60' : undefined)}
    />
  );
}
