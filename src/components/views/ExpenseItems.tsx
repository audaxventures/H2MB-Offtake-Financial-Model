import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { resolveLineItemAnnualAmount } from '@/engine/calculations';
import { formatCurrency, formatPercent } from '@/engine/formatters';
import { EXPENSE_CATEGORY_LABELS } from '@/engine/types';
import type { EscalationType, ExpenseCategory, ExpenseLineItem } from '@/engine/types';
import { useScenarioStore } from '@/store/scenarioStore';
import { useModelOutputs } from '@/store/useModelOutputs';

const ESCALATION_LABELS: Record<EscalationType, string> = {
  flat: 'Flat $ (no growth)',
  percentGrowth: '% Annual Growth',
  percentOfRevenue: '% of Revenue',
  manual: 'Manual / One-Time (per-year)',
};

export function ExpenseItems() {
  const current = useScenarioStore((s) => s.current);
  const addExpenseLineItem = useScenarioStore((s) => s.addExpenseLineItem);
  const removeExpenseLineItem = useScenarioStore((s) => s.removeExpenseLineItem);
  const updateExpenseLineItem = useScenarioStore((s) => s.updateExpenseLineItem);
  const setLineItemYearOverride = useScenarioStore((s) => s.setLineItemYearOverride);
  const outputs = useModelOutputs();

  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(
    current.expenseLineItems[0]?.id,
  );
  const item =
    current.expenseLineItems.find((i) => i.id === selectedItemId) ?? current.expenseLineItems[0];

  const revenueByYear = new Map(outputs.annual.map((a) => [a.year, a.revenue]));
  const years = Array.from({ length: current.modelSettings.totalYears }, (_, i) => i + 1);

  const totalOpexByYear = outputs.annual.map((a) => a.totalOperatingExpenses);

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Expense Line Items</CardTitle>
            <Button size="sm" variant="outline" onClick={addExpenseLineItem}>
              <Plus />
              Add Item
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {current.expenseLineItems.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No expense line items yet. Add one to start building out operating costs.
              </p>
            )}
            {current.expenseLineItems.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setSelectedItemId(i.id)}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  i.id === item?.id
                    ? 'border-primary bg-accent'
                    : 'hover:bg-accent/50 border-transparent'
                }`}
              >
                <div>
                  <p className="font-medium">{i.name || 'Untitled Expense'}</p>
                  <p className="text-muted-foreground text-xs">
                    {EXPENSE_CATEGORY_LABELS[i.category]} · {ESCALATION_LABELS[i.escalation.type]}
                  </p>
                </div>
                <span className="text-muted-foreground tabular-nums">
                  {formatCurrency(
                    resolveLineItemAnnualAmount(i, i.startYear, revenueByYear.get(i.startYear) ?? 0),
                  )}
                  /yr
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{item ? 'Edit Line Item' : 'No Item Selected'}</CardTitle>
            {item && (
              <Button size="sm" variant="outline" onClick={() => removeExpenseLineItem(item.id)}>
                <Trash2 />
                Remove
              </Button>
            )}
          </CardHeader>
          {item && (
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-muted-foreground">Name</Label>
                  <Input
                    value={item.name}
                    onChange={(e) => updateExpenseLineItem(item.id, { name: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-muted-foreground">Category</Label>
                  <Select
                    value={item.category}
                    onValueChange={(v) =>
                      updateExpenseLineItem(item.id, { category: v as ExpenseCategory })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <SliderInput
                label="Start Year"
                value={item.startYear}
                onChange={(v) => updateExpenseLineItem(item.id, { startYear: v })}
                min={1}
                max={current.modelSettings.totalYears}
                step={1}
              />

              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">Escalation</Label>
                <Select
                  value={item.escalation.type}
                  onValueChange={(v) =>
                    updateExpenseLineItem(item.id, {
                      escalation: { ...item.escalation, type: v as EscalationType },
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESCALATION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {item.escalation.type !== 'manual' && item.escalation.type !== 'percentOfRevenue' && (
                <SliderInput
                  label="Base Annual Amount"
                  value={item.baseAnnualAmount}
                  onChange={(v) => updateExpenseLineItem(item.id, { baseAnnualAmount: v })}
                  min={0}
                  max={3_000_000}
                  step={5_000}
                  formatValue={(v) => formatCurrency(v)}
                />
              )}

              {item.escalation.type === 'percentGrowth' && (
                <SliderInput
                  label="Annual Growth Rate"
                  value={item.escalation.growthRate ?? 0}
                  onChange={(v) =>
                    updateExpenseLineItem(item.id, {
                      escalation: { ...item.escalation, growthRate: v },
                    })
                  }
                  min={-0.1}
                  max={0.2}
                  step={0.0025}
                  formatValue={(v) => formatPercent(v, 2)}
                />
              )}

              {item.escalation.type === 'percentOfRevenue' && (
                <SliderInput
                  label="% of Total Revenue"
                  value={item.escalation.percentOfRevenue ?? 0}
                  onChange={(v) =>
                    updateExpenseLineItem(item.id, {
                      escalation: { ...item.escalation, percentOfRevenue: v },
                    })
                  }
                  min={0}
                  max={0.2}
                  step={0.0025}
                  formatValue={(v) => formatPercent(v, 2)}
                />
              )}

              {item.escalation.type === 'manual' && (
                <p className="text-muted-foreground bg-muted/50 rounded-lg p-3 text-xs">
                  Set this item's dollar amount for each year directly in the per-year table below.
                  Years without a value are treated as $0 — useful for a one-time or irregular cost.
                </p>
              )}

              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">Per-Year Amount ($) — override any year</Label>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {years.map((year) => {
                    const computed = resolveLineItemAnnualAmount(
                      item,
                      year,
                      revenueByYear.get(year) ?? 0,
                    );
                    const isOverridden = item.yearOverrides[year] !== undefined;
                    return (
                      <div key={year} className="grid gap-1">
                        <span className="text-muted-foreground text-[11px]">Yr {year}</span>
                        <Input
                          className={`h-8 text-xs ${isOverridden ? 'border-primary' : ''}`}
                          value={Math.round(computed).toString()}
                          onChange={(e) => {
                            const num = Number(e.target.value.replace(/[^0-9.-]/g, ''));
                            if (!Number.isNaN(num)) setLineItemYearOverride(item.id, year, num);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                {Object.keys(item.yearOverrides).length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-fit"
                    onClick={() => {
                      for (const year of Object.keys(item.yearOverrides).map(Number)) {
                        setLineItemYearOverride(item.id, year, undefined);
                      }
                    }}
                  >
                    Clear all overrides
                  </Button>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Expenses by Year</CardTitle>
        </CardHeader>
        <CardContent>
          <ExpenseByYearTable
            items={current.expenseLineItems}
            years={years}
            revenueByYear={revenueByYear}
            totalOpexByYear={totalOpexByYear}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ExpenseByYearTable({
  items,
  years,
  revenueByYear,
  totalOpexByYear,
}: {
  items: ExpenseLineItem[];
  years: number[];
  revenueByYear: Map<number, number>;
  totalOpexByYear: number[];
}) {
  interface Row {
    label: string;
    isTotal?: boolean;
    values: number[];
  }

  const rows: Row[] = items.map((item) => ({
    label: item.name || 'Untitled Expense',
    values: years.map((year) => resolveLineItemAnnualAmount(item, year, revenueByYear.get(year) ?? 0)),
  }));
  rows.push({ label: 'Total Operating Expenses', isTotal: true, values: totalOpexByYear });

  const columns: DataTableColumn<Row>[] = [
    { key: 'label', header: 'Line Item', render: (r) => r.label },
    ...years.map((year, idx) => ({
      key: `y${year}`,
      header: `Y${year}`,
      align: 'right' as const,
      render: (r: Row) => formatCurrency(r.values[idx]),
    })),
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowKey={(r) => r.label}
      rowClassName={(r) => (r.isTotal ? 'bg-h2mb-navy/90 text-white font-semibold hover:bg-h2mb-navy/90' : undefined)}
    />
  );
}
