import { describe, expect, it } from 'vitest';
import { buildProfitAndLossRows, filterRowsForDetail } from './statementRows';
import type { RowSpec } from '@/components/shared/StatementTable';
import { createDefaultScenario } from '@/engine/defaults';
import { runModel } from '@/engine/calculations';
import { formatCurrency } from '@/engine/formatters';

const rows: RowSpec[] = [
  { key: 'revenue', section: 'Revenue', label: 'Revenue', render: () => '', summary: true },
  { key: 'cogs', label: 'COGS', render: () => '', summary: true },
  { key: 'grossProfit', label: 'Gross Profit', render: () => '' },
  { key: 'opexA', section: 'Operating Expenses', label: 'OpEx A', render: () => '' },
  { key: 'opexB', label: 'OpEx B', render: () => '' },
  { key: 'totalOpex', label: 'Total OpEx', render: () => '', summary: true },
  { key: 'netIncome', section: 'Net Income', label: 'Net Income', render: () => '', summary: true },
];

describe('filterRowsForDetail', () => {
  it('returns all rows unchanged for "detailed"', () => {
    expect(filterRowsForDetail(rows, 'detailed')).toBe(rows);
  });

  it('keeps only summary-flagged rows for "summary"', () => {
    const result = filterRowsForDetail(rows, 'summary');
    expect(result.map((r) => r.key)).toEqual(['revenue', 'cogs', 'totalOpex', 'netIncome']);
  });

  it('re-derives section headers so the first surviving row of each original section keeps its heading', () => {
    const result = filterRowsForDetail(rows, 'summary');
    const sections = Object.fromEntries(result.map((r) => [r.key, r.section]));
    // 'revenue' already had the 'Revenue' section directly.
    expect(sections.revenue).toBe('Revenue');
    // 'cogs' had no section of its own and follows 'revenue' in the same section — no repeat heading.
    expect(sections.cogs).toBeUndefined();
    // 'totalOpex' is the first surviving row under 'Operating Expenses' (opexA/opexB got filtered out).
    expect(sections.totalOpex).toBe('Operating Expenses');
    // 'netIncome' carries its own section forward.
    expect(sections.netIncome).toBe('Net Income');
  });

  it('does not repeat a section heading on consecutive surviving rows already under it', () => {
    const consecutiveSummaryRows: RowSpec[] = [
      { key: 'a', section: 'Section 1', label: 'A', render: () => '', summary: true },
      { key: 'b', label: 'B', render: () => '', summary: true },
    ];
    const result = filterRowsForDetail(consecutiveSummaryRows, 'summary');
    expect(result[0].section).toBe('Section 1');
    expect(result[1].section).toBeUndefined();
  });
});

describe('buildProfitAndLossRows', () => {
  it('breaks revenue and expenses out line by line rather than by category', () => {
    const scenario = createDefaultScenario();
    const outputs = runModel(scenario);
    const rows = buildProfitAndLossRows(scenario);
    const a = outputs.annual[1]; // Year 2: first year with revenue

    // One row per named revenue stream (not a single combined category row).
    for (const stream of scenario.revenueStreams) {
      const row = rows.find((r) => r.key === `revenue-${stream.id}`);
      expect(row).toBeDefined();
      expect(row!.label).toBe(stream.name);
    }

    // One row per named expense line item (excluding cogs-category items, which live in the COGS section).
    for (const item of scenario.expenseLineItems.filter((i) => i.category !== 'cogs')) {
      const row = rows.find((r) => r.key === `expense-${item.id}`);
      expect(row).toBeDefined();
      expect(row!.label).toBe(item.name);
    }

    // Individual revenue-stream rows sum to the Total Revenue row.
    const totalRevenueRow = rows.find((r) => r.key === 'totalRevenue')!;
    const streamRowsSum = scenario.revenueStreams.reduce(
      (acc, stream) => acc + (a.streamBreakdown.find((s) => s.streamId === stream.id)?.revenue ?? 0),
      0,
    );
    expect(totalRevenueRow.render(a)).toBe(formatCurrency(streamRowsSum));
    expect(totalRevenueRow.render(a)).toBe(formatCurrency(a.revenue));
  });

  it('combines Employee Roles payroll into a single row rather than one row per role', () => {
    const scenario = createDefaultScenario();
    scenario.employeeRoles = [
      { id: 'r1', title: 'Plant Manager', baseSalaryYear: 2, baseAnnualSalary: 100_000, salaryEscalation: { type: 'flat' }, salaryYearOverrides: {}, benefitsPct: 0.2, headcountByYear: { 2: 1 } },
      { id: 'r2', title: 'Operator', baseSalaryYear: 2, baseAnnualSalary: 70_000, salaryEscalation: { type: 'flat' }, salaryYearOverrides: {}, benefitsPct: 0.2, headcountByYear: { 2: 2 } },
    ];
    const rows = buildProfitAndLossRows(scenario);
    expect(rows.filter((r) => r.key === 'payrollRoles')).toHaveLength(1);
    expect(rows.some((r) => r.label === 'Plant Manager')).toBe(false);
    expect(rows.some((r) => r.label === 'Operator')).toBe(false);
  });
});
