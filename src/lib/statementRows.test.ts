import { describe, expect, it } from 'vitest';
import { filterRowsForDetail } from './statementRows';
import type { RowSpec } from '@/components/shared/StatementTable';

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
