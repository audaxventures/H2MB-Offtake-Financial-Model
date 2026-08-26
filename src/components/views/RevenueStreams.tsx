import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SliderInput } from '@/components/shared/SliderInput';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { DSCRBadge } from '@/components/shared/Badge';
import { cn } from '@/lib/utils';
import { REVENUE_PRODUCT_LABELS } from '@/engine/types';
import type { AnnualResult, OfftakeMode, PeriodResult, RevenueProduct } from '@/engine/types';
import { formatCurrency, formatCurrencyCompact } from '@/engine/formatters';
import { useScenarioStore } from '@/store/scenarioStore';
import { useModelOutputs } from '@/store/useModelOutputs';

export function RevenueStreams() {
  const current = useScenarioStore((s) => s.current);
  const addRevenueStream = useScenarioStore((s) => s.addRevenueStream);
  const removeRevenueStream = useScenarioStore((s) => s.removeRevenueStream);
  const updateRevenueStream = useScenarioStore((s) => s.updateRevenueStream);
  const updateStreamPeriod = useScenarioStore((s) => s.updateStreamPeriod);
  const outputs = useModelOutputs();

  const [selectedStreamId, setSelectedStreamId] = useState<string | undefined>(
    current.revenueStreams[0]?.id,
  );
  const [selectedYear, setSelectedYear] = useState(2);
  const [tableMode, setTableMode] = useState<'periods' | 'annual'>('periods');

  const stream =
    current.revenueStreams.find((s) => s.id === selectedStreamId) ?? current.revenueStreams[0];
  const { quarterlyYears, totalYears } = current.modelSettings;
  const isDirectOfftake = stream?.offtakeMode === 'direct';
  const years = Array.from({ length: totalYears - 1 }, (_, i) => i + 2);
  const isQuarterlyYear = selectedYear <= quarterlyYears;
  const periodsForYear = stream
    ? stream.periods.filter((p) => p.year === selectedYear)
    : [];

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Revenue Streams</CardTitle>
          <Button size="sm" variant="outline" onClick={addRevenueStream}>
            <Plus />
            Add Stream
          </Button>
        </CardHeader>
        <CardContent className="grid gap-5">
          {current.revenueStreams.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No revenue streams yet. Add one to start modeling offtake volume and price.
            </p>
          ) : (
            <>
              <Tabs
                value={stream?.id}
                onValueChange={(v) => setSelectedStreamId(v)}
              >
                <TabsList className="flex-wrap">
                  {current.revenueStreams.map((s) => (
                    <TabsTrigger key={s.id} value={s.id}>
                      {s.name || 'Untitled Stream'}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {stream && (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="grid gap-1.5">
                      <Label className="text-muted-foreground">Stream Name</Label>
                      <Input
                        value={stream.name}
                        onChange={(e) =>
                          updateRevenueStream(stream.id, { name: e.target.value })
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-muted-foreground">Product</Label>
                      <Select
                        value={stream.product}
                        onValueChange={(v) =>
                          updateRevenueStream(stream.id, { product: v as RevenueProduct })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(REVENUE_PRODUCT_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-muted-foreground">Offtake Type</Label>
                      <Select
                        value={stream.offtakeMode}
                        onValueChange={(v) =>
                          updateRevenueStream(stream.id, { offtakeMode: v as OfftakeMode })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trucks">Truck Delivery (Class 8 FCET)</SelectItem>
                          <SelectItem value="direct">Direct Daily Volume</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {stream.offtakeMode === 'trucks' && (
                      <SliderInput
                        label="Kg per Truck Fill"
                        value={stream.kgPerTruckFill}
                        onChange={(v) => updateRevenueStream(stream.id, { kgPerTruckFill: v })}
                        min={40}
                        max={120}
                        step={5}
                        suffix=" kg"
                      />
                    )}
                    <SliderInput
                      label={
                        stream.product === 'hydrogen'
                          ? 'H2 Production Cost / kg'
                          : stream.product === 'oxygen'
                            ? 'O2 Production Cost / kg'
                            : 'Production Cost / kg'
                      }
                      value={stream.h2ProductionCostPerKg}
                      onChange={(v) =>
                        updateRevenueStream(stream.id, { h2ProductionCostPerKg: v })
                      }
                      min={1}
                      max={8}
                      step={0.01}
                      formatValue={(v) => formatCurrency(v, 2)}
                    />
                    <SliderInput
                      label="Start Year"
                      value={stream.startYear}
                      onChange={(v) => updateRevenueStream(stream.id, { startYear: v })}
                      min={2}
                      max={totalYears}
                      step={1}
                      helperText="First year this stream can generate revenue"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Tabs value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                      <TabsList className="flex-wrap">
                        {years.map((y) => (
                          <TabsTrigger key={y} value={String(y)}>
                            Year {y}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                    {current.revenueStreams.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeRevenueStream(stream.id)}
                      >
                        <Trash2 />
                        Remove Stream
                      </Button>
                    )}
                  </div>

                  {selectedYear < stream.startYear && (
                    <p className="text-muted-foreground bg-muted/50 rounded-lg p-3 text-sm">
                      This stream doesn't start until Year {stream.startYear}; inputs below won't
                      contribute revenue until then.
                    </p>
                  )}

                  <div
                    className={cn(
                      'grid grid-cols-1 gap-4',
                      isQuarterlyYear && 'md:grid-cols-2 xl:grid-cols-4',
                    )}
                  >
                    {periodsForYear.map((p) => (
                      <Card key={`${p.year}-${p.quarter}`}>
                        <CardHeader>
                          <CardTitle className="text-sm">
                            {p.quarter === null ? `Year ${p.year} (annual)` : `Y${p.year}Q${p.quarter}`}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                          {isDirectOfftake ? (
                            <SliderInput
                              label="Daily Quantity (kg)"
                              value={p.dailyQuantityKg}
                              onChange={(v) =>
                                updateStreamPeriod(stream.id, p.year, p.quarter, {
                                  dailyQuantityKg: v,
                                })
                              }
                              min={10}
                              max={2_000}
                              step={10}
                              suffix=" kg"
                            />
                          ) : (
                            <SliderInput
                              label="Trucks / Day"
                              value={p.trucksPerDay}
                              onChange={(v) =>
                                updateStreamPeriod(stream.id, p.year, p.quarter, {
                                  trucksPerDay: v,
                                })
                              }
                              min={1}
                              max={25}
                              step={1}
                            />
                          )}
                          <SliderInput
                            label="Operating Days"
                            value={p.operatingDays}
                            onChange={(v) =>
                              updateStreamPeriod(stream.id, p.year, p.quarter, {
                                operatingDays: v,
                              })
                            }
                            min={1}
                            max={p.quarter === null ? 365 : 92}
                            step={1}
                            helperText={
                              p.quarter === null
                                ? 'Days product is delivered this year'
                                : 'Days product is delivered this quarter'
                            }
                          />
                          <SliderInput
                            label="Price $/kg"
                            value={p.pricePerKg}
                            onChange={(v) =>
                              updateStreamPeriod(stream.id, p.year, p.quarter, {
                                pricePerKg: v,
                              })
                            }
                            min={5}
                            max={25}
                            step={0.25}
                            formatValue={(v) => formatCurrency(v, 2)}
                          />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{tableMode === 'periods' ? 'Period Detail (all streams combined)' : 'Annual Summary'}</CardTitle>
          <ToggleGroup
            type="single"
            variant="outline"
            value={tableMode}
            onValueChange={(v) => v && setTableMode(v as 'periods' | 'annual')}
          >
            <ToggleGroupItem value="periods">Periods</ToggleGroupItem>
            <ToggleGroupItem value="annual">Annual</ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          {tableMode === 'periods' ? (
            <PeriodTable periods={outputs.periods} annual={outputs.annual} />
          ) : (
            <AnnualMiniTable rows={outputs.annual} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type CombinedRow =
  | { kind: 'period'; data: PeriodResult }
  | { kind: 'subtotal'; data: AnnualResult };

function PeriodTable({ periods, annual }: { periods: PeriodResult[]; annual: AnnualResult[] }) {
  const annualByYear = new Map(annual.map((a) => [a.year, a]));
  const rows: CombinedRow[] = [];
  for (const p of periods) {
    rows.push({ kind: 'period', data: p });
    if (p.quarter === 4 || p.quarter === null) {
      const subtotal = annualByYear.get(p.year);
      if (subtotal) rows.push({ kind: 'subtotal', data: subtotal });
    }
  }

  const columns: DataTableColumn<CombinedRow>[] = [
    { key: 'label', header: 'Period', render: (r) => (r.kind === 'period' ? r.data.label : `Year ${r.data.year} Total`) },
    {
      key: 'dailyQty',
      header: 'Total Daily Kg',
      align: 'right',
      render: (r) =>
        r.kind === 'period' && !r.data.isConstruction
          ? r.data.streamBreakdown
              .reduce((acc, s) => acc + s.dailyQuantityKg, 0)
              .toLocaleString('en-CA')
          : '—',
    },
    { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatCurrency(r.data.revenue) },
    { key: 'grossProfit', header: 'Gross Profit', align: 'right', render: (r) => formatCurrency(r.data.grossProfit) },
    {
      key: 'opex',
      header: 'Operating Exp.',
      align: 'right',
      render: (r) => formatCurrency(r.data.totalOperatingExpenses + r.data.preRevenueOpex),
    },
    { key: 'ebitda', header: 'EBITDA', align: 'right', render: (r) => formatCurrency(r.data.ebitda) },
    { key: 'interest', header: 'Interest', align: 'right', render: (r) => formatCurrency(r.data.interest) },
    { key: 'principal', header: 'Principal', align: 'right', render: (r) => formatCurrency(r.data.principal) },
    {
      key: 'itc',
      header: '⚡ ITC',
      align: 'right',
      render: (r) => (r.data.itcReceived > 0 ? formatCurrency(r.data.itcReceived) : '—'),
    },
    { key: 'netCash', header: 'Net Cash', align: 'right', render: (r) => formatCurrency(r.data.netCash) },
    { key: 'cumCF', header: 'Cum. CF', align: 'right', render: (r) => formatCurrency(r.data.cumulativeCF) },
    { key: 'debtBalance', header: 'Debt Balance', align: 'right', render: (r) => formatCurrency(r.data.closingDebtBalance) },
    { key: 'dscr', header: 'DSCR', align: 'right', render: (r) => <DSCRBadge value={r.data.dscr} /> },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowKey={(r) => (r.kind === 'period' ? r.data.label : `Y${r.data.year}-subtotal`)}
      rowClassName={(r) =>
        cn(
          r.kind === 'period' && r.data.isConstruction && 'bg-h2mb-construction-bg/60',
          r.kind === 'period' && r.data.isITCPeriod && 'bg-h2mb-gold-bg',
          r.kind === 'subtotal' && 'bg-h2mb-navy/90 text-white font-semibold hover:bg-h2mb-navy/90',
        )
      }
    />
  );
}

function AnnualMiniTable({ rows }: { rows: AnnualResult[] }) {
  const columns: DataTableColumn<AnnualResult>[] = [
    { key: 'year', header: 'Year', render: (r) => `Year ${r.year}` },
    { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatCurrencyCompact(r.revenue) },
    { key: 'ebitda', header: 'EBITDA', align: 'right', render: (r) => formatCurrencyCompact(r.ebitda) },
    { key: 'netCash', header: 'Net Cash', align: 'right', render: (r) => formatCurrencyCompact(r.netCash) },
    { key: 'cumCF', header: 'Cumulative CF', align: 'right', render: (r) => formatCurrencyCompact(r.cumulativeCF) },
    { key: 'debtBalance', header: 'Debt Balance', align: 'right', render: (r) => formatCurrencyCompact(r.closingDebtBalance) },
    { key: 'dscr', header: 'DSCR', align: 'right', render: (r) => <DSCRBadge value={r.dscr} /> },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowKey={(r) => String(r.year)}
      rowClassName={(r) => (r.isConstruction ? 'bg-h2mb-construction-bg/60' : undefined)}
    />
  );
}
