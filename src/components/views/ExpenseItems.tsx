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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SliderInput } from '@/components/shared/SliderInput';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import {
  computePayrollFromRoles,
  computeRoleAnnualCost,
  computeRoleAnnualSalary,
  resolveLineItemAnnualAmount,
} from '@/engine/calculations';
import { formatCurrency, formatPercent } from '@/engine/formatters';
import { CAPEX_CATEGORY_LABELS, EXPENSE_CATEGORY_LABELS } from '@/engine/types';
import type {
  CapexCategory,
  CapexLineItem,
  EmployeeRole,
  EscalationType,
  ExpenseCategory,
  ExpenseLineItem,
  SalaryEscalationType,
} from '@/engine/types';
import { useScenarioStore } from '@/store/scenarioStore';
import { useModelOutputs } from '@/store/useModelOutputs';

const ROLE_ESCALATION_LABELS: Record<SalaryEscalationType, string> = {
  flat: 'Flat Salary (no growth)',
  percentGrowth: '% Annual Growth (raise)',
  manual: 'Manual / Per-Year Entry',
};

const ESCALATION_LABELS: Record<EscalationType, string> = {
  flat: 'Flat $ (no growth)',
  percentGrowth: '% Annual Growth',
  percentOfRevenue: '% of Revenue',
  manual: 'Manual / One-Time (per-year)',
};

export function ExpenseItems() {
  return (
    <Tabs defaultValue="opex" className="gap-6">
      <TabsList>
        <TabsTrigger value="opex">Operating Expenses</TabsTrigger>
        <TabsTrigger value="roles">Employee Roles</TabsTrigger>
        <TabsTrigger value="capex">Construction / CapEx</TabsTrigger>
      </TabsList>
      <TabsContent value="opex">
        <OperatingExpensesTab />
      </TabsContent>
      <TabsContent value="roles">
        <EmployeeRolesTab />
      </TabsContent>
      <TabsContent value="capex">
        <CapexTab />
      </TabsContent>
    </Tabs>
  );
}

function OperatingExpensesTab() {
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
  const roleTotalByYear = years.map((year) => computePayrollFromRoles(current.employeeRoles, year));
  const hasRoles = current.employeeRoles.length > 0;

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
            totalByYear={totalOpexByYear}
            totalLabel="Total Operating Expenses"
            extraRow={
              hasRoles
                ? { label: 'Payroll & Benefits (from Employee Roles)', values: roleTotalByYear }
                : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function EmployeeRolesTab() {
  const current = useScenarioStore((s) => s.current);
  const addEmployeeRole = useScenarioStore((s) => s.addEmployeeRole);
  const removeEmployeeRole = useScenarioStore((s) => s.removeEmployeeRole);
  const updateEmployeeRole = useScenarioStore((s) => s.updateEmployeeRole);
  const setRoleHeadcount = useScenarioStore((s) => s.setRoleHeadcount);
  const setRoleSalaryYearOverride = useScenarioStore((s) => s.setRoleSalaryYearOverride);

  const [selectedRoleId, setSelectedRoleId] = useState<string | undefined>(
    current.employeeRoles[0]?.id,
  );
  const role =
    current.employeeRoles.find((r) => r.id === selectedRoleId) ?? current.employeeRoles[0];

  const years = Array.from({ length: current.modelSettings.totalYears }, (_, i) => i + 1);
  const roleCostByYear = (r: (typeof current.employeeRoles)[number]) =>
    years.map((year) => computeRoleAnnualCost(r, year));
  const totalCostByYear = years.map((year) => computePayrollFromRoles(current.employeeRoles, year));

  return (
    <div className="grid gap-6">
      <p className="text-muted-foreground -mt-2 text-sm">
        Build up Payroll &amp; Benefits from an actual hiring plan: list each role, its salary and
        benefits load, and how many people fill it in each year — so headcount growth and timing
        are explicit rather than a single escalating number. This adds to the "Payroll &amp;
        Benefits" expense category; delete or zero out any manual payroll line item under Operating
        Expenses to avoid double-counting.
      </p>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Employee Roles</CardTitle>
            <Button size="sm" variant="outline" onClick={addEmployeeRole}>
              <Plus />
              Add Role
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {current.employeeRoles.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No roles yet. Add one to start building your hiring plan.
              </p>
            )}
            {current.employeeRoles.map((r) => {
              const totalCost = roleCostByYear(r).reduce((acc, v) => acc + v, 0);
              const peakHeadcount = Math.max(0, ...Object.values(r.headcountByYear));
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRoleId(r.id)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    r.id === role?.id
                      ? 'border-primary bg-accent'
                      : 'hover:bg-accent/50 border-transparent'
                  }`}
                >
                  <div>
                    <p className="font-medium">{r.title || 'Untitled Role'}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatCurrency(computeRoleAnnualSalary(r, r.baseSalaryYear))}/yr starting ·{' '}
                      {ROLE_ESCALATION_LABELS[r.salaryEscalation.type]} · {formatPercent(r.benefitsPct, 1)}{' '}
                      benefits · peak {peakHeadcount} FTE
                    </p>
                  </div>
                  <span className="text-muted-foreground tabular-nums">
                    {formatCurrency(totalCost)} total
                  </span>
                </button>
              );
            })}
            {current.employeeRoles.length > 0 && (
              <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm font-semibold">
                <span>Total Payroll &amp; Benefits</span>
                <span className="tabular-nums">
                  {formatCurrency(totalCostByYear.reduce((acc, v) => acc + v, 0))}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{role ? 'Edit Role' : 'No Role Selected'}</CardTitle>
            {role && (
              <Button size="sm" variant="outline" onClick={() => removeEmployeeRole(role.id)}>
                <Trash2 />
                Remove
              </Button>
            )}
          </CardHeader>
          {role && (
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">Role Title</Label>
                <Input
                  value={role.title}
                  onChange={(e) => updateEmployeeRole(role.id, { title: e.target.value })}
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">Salary Escalation</Label>
                <Select
                  value={role.salaryEscalation.type}
                  onValueChange={(v) =>
                    updateEmployeeRole(role.id, {
                      salaryEscalation: { ...role.salaryEscalation, type: v as SalaryEscalationType },
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_ESCALATION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {role.salaryEscalation.type !== 'manual' && (
                <SliderInput
                  label="Base Annual Salary (per FTE)"
                  value={role.baseAnnualSalary}
                  onChange={(v) => updateEmployeeRole(role.id, { baseAnnualSalary: v })}
                  min={0}
                  max={300_000}
                  step={2_500}
                  formatValue={(v) => formatCurrency(v)}
                />
              )}

              {role.salaryEscalation.type === 'percentGrowth' && (
                <>
                  <SliderInput
                    label="Annual Growth Rate (raise)"
                    value={role.salaryEscalation.growthRate ?? 0}
                    onChange={(v) =>
                      updateEmployeeRole(role.id, {
                        salaryEscalation: { ...role.salaryEscalation, growthRate: v },
                      })
                    }
                    min={-0.1}
                    max={0.2}
                    step={0.0025}
                    formatValue={(v) => formatPercent(v, 2)}
                  />
                  <SliderInput
                    label="Growth Base Year"
                    value={role.baseSalaryYear}
                    onChange={(v) => updateEmployeeRole(role.id, { baseSalaryYear: v })}
                    min={1}
                    max={current.modelSettings.totalYears}
                    step={1}
                    helperText="The year the Base Annual Salary applies to — growth compounds from here"
                  />
                </>
              )}

              {role.salaryEscalation.type === 'manual' && (
                <p className="text-muted-foreground bg-muted/50 rounded-lg p-3 text-xs">
                  Set this role's exact salary for each year directly in the per-year table below —
                  useful for entering known raises year by year. Years without a value use the last
                  entered/base amount.
                </p>
              )}

              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">Per-Year Salary ($) — override any year</Label>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {years.map((year) => {
                    const computed = computeRoleAnnualSalary(role, year);
                    const isOverridden = role.salaryYearOverrides[year] !== undefined;
                    return (
                      <div key={year} className="grid gap-1">
                        <span className="text-muted-foreground text-[11px]">Yr {year}</span>
                        <Input
                          className={`h-8 text-xs ${isOverridden ? 'border-primary' : ''}`}
                          value={Math.round(computed).toString()}
                          onChange={(e) => {
                            const num = Number(e.target.value.replace(/[^0-9.-]/g, ''));
                            if (!Number.isNaN(num)) setRoleSalaryYearOverride(role.id, year, num);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                {Object.keys(role.salaryYearOverrides).length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-fit"
                    onClick={() => {
                      for (const year of Object.keys(role.salaryYearOverrides).map(Number)) {
                        setRoleSalaryYearOverride(role.id, year, undefined);
                      }
                    }}
                  >
                    Clear all overrides
                  </Button>
                )}
              </div>

              <SliderInput
                label="Benefits (% of salary)"
                value={role.benefitsPct}
                onChange={(v) => updateEmployeeRole(role.id, { benefitsPct: v })}
                min={0}
                max={0.5}
                step={0.001}
                formatValue={(v) => formatPercent(v, 1)}
              />

              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">Headcount by Year</Label>
                <p className="text-muted-foreground text-xs">
                  Number of people in this role each year — 0 (or blank) before it's hired.
                  Decimals are allowed for part-time headcount (e.g. 0.5 for a half-time hire).
                </p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {years.map((year) => (
                    <div key={year} className="grid gap-1">
                      <span className="text-muted-foreground text-[11px]">Yr {year}</span>
                      <Input
                        className="h-8 text-xs"
                        value={String(role.headcountByYear[year] ?? 0)}
                        onChange={(e) => {
                          const num = Number(e.target.value.replace(/[^0-9.]/g, ''));
                          if (!Number.isNaN(num)) setRoleHeadcount(role.id, year, num);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Roles by Year (Fully-Loaded Cost)</CardTitle>
        </CardHeader>
        <CardContent>
          <RolesByYearTable
            roles={current.employeeRoles}
            years={years}
            totalByYear={totalCostByYear}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function RolesByYearTable({
  roles,
  years,
  totalByYear,
}: {
  roles: EmployeeRole[];
  years: number[];
  totalByYear: number[];
}) {
  interface Row {
    label: string;
    isTotal?: boolean;
    values: number[];
  }

  const rows: Row[] = roles.map((r) => ({
    label: r.title || 'Untitled Role',
    values: years.map((year) => computeRoleAnnualCost(r, year)),
  }));
  rows.push({ label: 'Total Payroll & Benefits (from Roles)', isTotal: true, values: totalByYear });

  const columns: DataTableColumn<Row>[] = [
    { key: 'label', header: 'Role', render: (r) => r.label },
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

function CapexTab() {
  const current = useScenarioStore((s) => s.current);
  const addCapexLineItem = useScenarioStore((s) => s.addCapexLineItem);
  const removeCapexLineItem = useScenarioStore((s) => s.removeCapexLineItem);
  const updateCapexLineItem = useScenarioStore((s) => s.updateCapexLineItem);
  const setCapexLineItemYearOverride = useScenarioStore((s) => s.setCapexLineItemYearOverride);
  const outputs = useModelOutputs();

  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(
    current.capexLineItems[0]?.id,
  );
  const item =
    current.capexLineItems.find((i) => i.id === selectedItemId) ?? current.capexLineItems[0];

  const revenueByYear = new Map(outputs.annual.map((a) => [a.year, a.revenue]));
  const years = Array.from({ length: current.modelSettings.totalYears }, (_, i) => i + 1);

  const totalCapexByYear = outputs.annual.map((a) => a.capexSpend);
  const totalCapex = totalCapexByYear.reduce((acc, v) => acc + v, 0);

  return (
    <div className="grid gap-6">
      <p className="text-muted-foreground -mt-2 text-sm">
        Detailed capital cost items — equipment, engineering, contingency, etc. Unlike operating
        expenses these don't hit EBITDA; they fund Sources &amp; Uses and depreciation. Enter the
        dollar amount actually spent in each year (e.g. most of a plant purchase in Year 1, the
        remainder in Year 2) using the per-year table below.
      </p>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>CapEx Line Items</CardTitle>
            <Button size="sm" variant="outline" onClick={addCapexLineItem}>
              <Plus />
              Add Item
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2">
            {current.capexLineItems.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No CapEx line items yet. Add one to start detailing construction costs.
              </p>
            )}
            {current.capexLineItems.map((i) => (
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
                  <p className="font-medium">{i.name || 'Untitled CapEx Item'}</p>
                  <p className="text-muted-foreground text-xs">
                    {CAPEX_CATEGORY_LABELS[i.category]} · {ESCALATION_LABELS[i.escalation.type]}
                    {i.itcEligible && ' · ITC Eligible'}
                  </p>
                </div>
                <span className="text-muted-foreground tabular-nums">
                  {formatCurrency(
                    years.reduce(
                      (acc, y) => acc + resolveLineItemAnnualAmount(i, y, revenueByYear.get(y) ?? 0),
                      0,
                    ),
                  )}
                  {' total'}
                </span>
              </button>
            ))}
            {current.capexLineItems.length > 0 && (
              <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm font-semibold">
                <span>Total CapEx</span>
                <span className="tabular-nums">{formatCurrency(totalCapex)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{item ? 'Edit CapEx Item' : 'No Item Selected'}</CardTitle>
            {item && (
              <Button size="sm" variant="outline" onClick={() => removeCapexLineItem(item.id)}>
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
                    onChange={(e) => updateCapexLineItem(item.id, { name: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-muted-foreground">Category</Label>
                  <Select
                    value={item.category}
                    onValueChange={(v) =>
                      updateCapexLineItem(item.id, { category: v as CapexCategory })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CAPEX_CATEGORY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <Label className="text-sm font-medium">ITC Eligible</Label>
                  <p className="text-muted-foreground text-xs">
                    Counts toward the ITC-eligible CapEx base when the ITC is set to "% of Eligible
                    CapEx" on the Assumptions Dashboard.
                  </p>
                </div>
                <Switch
                  checked={item.itcEligible}
                  onCheckedChange={(checked) => updateCapexLineItem(item.id, { itcEligible: checked })}
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">Escalation</Label>
                <Select
                  value={item.escalation.type}
                  onValueChange={(v) =>
                    updateCapexLineItem(item.id, {
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
                  onChange={(v) => updateCapexLineItem(item.id, { baseAnnualAmount: v })}
                  min={0}
                  max={25_000_000}
                  step={25_000}
                  formatValue={(v) => formatCurrency(v)}
                />
              )}

              {item.escalation.type === 'percentGrowth' && (
                <SliderInput
                  label="Annual Growth Rate"
                  value={item.escalation.growthRate ?? 0}
                  onChange={(v) =>
                    updateCapexLineItem(item.id, {
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
                    updateCapexLineItem(item.id, {
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
                  Set this item's dollar amount for each year directly in the per-year table below
                  — e.g. most of the spend in Year 1 (construction) and the remainder in Year 2.
                  Years without a value are $0.
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
                            if (!Number.isNaN(num)) setCapexLineItemYearOverride(item.id, year, num);
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
                        setCapexLineItemYearOverride(item.id, year, undefined);
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
          <CardTitle>All CapEx by Year</CardTitle>
        </CardHeader>
        <CardContent>
          <ExpenseByYearTable
            items={current.capexLineItems}
            years={years}
            revenueByYear={revenueByYear}
            totalByYear={totalCapexByYear}
            totalLabel="Total CapEx"
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
  totalByYear,
  totalLabel,
  extraRow,
}: {
  items: (ExpenseLineItem | CapexLineItem)[];
  years: number[];
  revenueByYear: Map<number, number>;
  totalByYear: number[];
  totalLabel: string;
  extraRow?: { label: string; values: number[] };
}) {
  interface Row {
    label: string;
    isTotal?: boolean;
    values: number[];
  }

  const rows: Row[] = items.map((item) => ({
    label: item.name || 'Untitled',
    values: years.map((year) => resolveLineItemAnnualAmount(item, year, revenueByYear.get(year) ?? 0)),
  }));
  if (extraRow) rows.push(extraRow);
  rows.push({ label: totalLabel, isTotal: true, values: totalByYear });

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
