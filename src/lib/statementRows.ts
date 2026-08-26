import { CAPEX_CATEGORY_LABELS, EXPENSE_CATEGORY_LABELS } from '@/engine/types';
import type { AnnualResult, CapexCategory, ExpenseCategory, Scenario } from '@/engine/types';
import { formatCurrency, formatDSCR, formatPercent } from '@/engine/formatters';
import type { RowSpec } from '@/components/shared/StatementTable';

export type StatementDetail = 'summary' | 'detailed';

/**
 * Reduces a full row set down to just the rows flagged `summary: true` for
 * the condensed PDF view, re-deriving section headers so a section whose
 * heading row got filtered out still gets one on its first surviving row.
 */
export function filterRowsForDetail(rows: RowSpec[], detail: StatementDetail): RowSpec[] {
  if (detail === 'detailed') return rows;

  let currentSection: string | undefined;
  const sectionAtKey = new Map<string, string | undefined>();
  for (const r of rows) {
    if (r.section) currentSection = r.section;
    sectionAtKey.set(r.key, currentSection);
  }

  let lastAssignedSection: string | undefined;
  return rows
    .filter((r) => r.summary)
    .map((r) => {
      const section = sectionAtKey.get(r.key);
      if (section && section !== lastAssignedSection) {
        lastAssignedSection = section;
        return { ...r, section };
      }
      return { ...r, section: undefined };
    });
}

export function usedExpenseCategories(scenario: Scenario, annual: AnnualResult[]): ExpenseCategory[] {
  const set = new Set<ExpenseCategory>();
  for (const item of scenario.expenseLineItems) {
    if (item.category !== 'cogs') set.add(item.category);
  }
  for (const a of annual) {
    for (const category of Object.keys(a.expensesByCategory) as ExpenseCategory[]) {
      if (category !== 'cogs') set.add(category);
    }
  }
  return Array.from(set);
}

export function usedCapexCategories(scenario: Scenario, annual: AnnualResult[]): CapexCategory[] {
  const set = new Set<CapexCategory>();
  for (const item of scenario.capexLineItems) set.add(item.category);
  for (const a of annual) {
    for (const category of Object.keys(a.capexByCategory) as CapexCategory[]) set.add(category);
  }
  return Array.from(set);
}

/**
 * Profit & Loss: Revenue -> COGS -> Gross Profit -> Operating Expenses ->
 * EBITDA -> D&A -> EBIT -> Interest -> Net Profit (Loss). Deliberately
 * excludes CapEx (capitalized, not expensed), principal repayment, and ITC
 * (a financing item, not income) — see buildCashFlowRows for those.
 */
export function buildProfitAndLossRows(scenario: Scenario, annual: AnnualResult[]): RowSpec[] {
  const categories = usedExpenseCategories(scenario, annual);

  return [
    { key: 'revenue', section: 'Revenue', label: 'Hydrogen Sales Revenue', render: (a) => formatCurrency(a.revenue), summary: true },
    { key: 'cogs', label: 'Cost of Goods Sold', render: (a) => formatCurrency(-a.cogs), summary: true },
    { key: 'grossProfit', label: 'Gross Profit', render: (a) => formatCurrency(a.grossProfit), emphasis: true },
    { key: 'grossMargin', label: 'Gross Margin %', render: (a) => formatPercent(a.grossMarginPct) },

    {
      key: 'preRevenueOpex',
      section: 'Operating Expenses',
      label: 'Pre-Revenue / Construction OpEx',
      render: (a) => formatCurrency(-a.preRevenueOpex),
    },
    ...categories.map(
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
      summary: true,
    },
    { key: 'ebitda', label: 'EBITDA', render: (a) => formatCurrency(a.ebitda), emphasis: true },
    { key: 'ebitdaMargin', label: 'EBITDA Margin %', render: (a) => formatPercent(a.ebitdaMarginPct) },

    { key: 'da', section: 'Depreciation & Net Income', label: 'D&A (20yr SL, 5% salvage)', render: (a) => formatCurrency(-a.depreciation) },
    { key: 'ebit', label: 'EBIT', render: (a) => formatCurrency(a.ebit), emphasis: true },
    { key: 'interest', label: 'Interest Expense', render: (a) => formatCurrency(-a.interest) },
    {
      key: 'netIncome',
      label: 'Net Profit (Loss)',
      render: (a) => formatCurrency(a.netIncome),
      emphasis: true,
      summary: true,
    },
    { key: 'netIncomeMargin', label: 'Net Margin %', render: (a) => formatPercent(a.netIncomeMarginPct) },
  ];
}

/**
 * Cash Flow Statement: CapEx (Investing) detail, Debt Service, a full
 * indirect-method 3-section Cash Flow Statement ending in a cash balance,
 * and the levered equity cash flow used for IRR/payback (a different,
 * narrower cash concept — what's distributable to equity after debt
 * service — kept separate and clearly labeled from the full statement).
 */
export function buildCashFlowRows(scenario: Scenario, annual: AnnualResult[]): RowSpec[] {
  const capexCategories = usedCapexCategories(scenario, annual);

  return [
    ...capexCategories.map(
      (category, idx): RowSpec => ({
        key: `capex-${category}`,
        section: idx === 0 ? 'Investing Activities' : undefined,
        label: CAPEX_CATEGORY_LABELS[category],
        render: (a) => formatCurrency(-(a.capexByCategory[category] ?? 0)),
      }),
    ),
    {
      key: 'cashFromInvesting',
      section: capexCategories.length === 0 ? 'Investing Activities' : undefined,
      label: 'Cash from Investing Activities',
      render: (a) => formatCurrency(a.cashFromInvesting),
      emphasis: true,
      summary: true,
    },

    { key: 'interest', section: 'Debt Service', label: 'Interest Expense', render: (a) => formatCurrency(-a.interest) },
    { key: 'principal', label: 'Principal Repayment', render: (a) => formatCurrency(-a.principal) },
    { key: 'itcReceivedDebt', label: 'ITC Received', render: (a) => formatCurrency(a.itcReceived) },
    { key: 'extraPrincipal', label: 'Extra Principal (ITC)', render: (a) => formatCurrency(-a.extraPrincipalFromITC) },
    { key: 'totalDebtService', label: 'Total Debt Service', render: (a) => formatCurrency(a.totalDebtService), emphasis: true, summary: true },
    { key: 'dscr', label: 'DSCR (annual)', render: (a) => formatDSCR(a.dscr), isDscr: true, summary: true },
    {
      key: 'dscrHeadroom',
      label: 'DSCR vs 1.25x Target (headroom)',
      render: (a) => (a.dscrHeadroom !== null ? `${a.dscrHeadroom >= 0 ? '+' : ''}${a.dscrHeadroom.toFixed(2)}x` : 'N/A'),
    },
    { key: 'closingDebt', label: 'Closing Debt Balance', render: (a) => formatCurrency(a.closingDebtBalance) },

    {
      key: 'cfoNetIncome',
      section: 'Cash Flow Statement',
      label: 'Net Income',
      render: (a) => formatCurrency(a.netIncome),
    },
    { key: 'cfoDA', label: '+ Depreciation & Amortization', render: (a) => formatCurrency(a.depreciation) },
    {
      key: 'cashFromOperations',
      label: 'Cash from Operating Activities',
      render: (a) => formatCurrency(a.cashFromOperations),
      emphasis: true,
      summary: true,
    },
    {
      key: 'cashFromInvestingRepeat',
      label: 'Cash from Investing Activities',
      render: (a) => formatCurrency(a.cashFromInvesting),
    },
    {
      key: 'debtDrawn',
      label: 'Debt Drawn (Financial Close)',
      render: (a) => formatCurrency(a.year === 1 ? scenario.capital.totalDebt : 0),
    },
    {
      key: 'equityContributed',
      label: 'Equity Contributed (Financial Close)',
      render: (a) =>
        formatCurrency(
          a.year === 1
            ? scenario.capital.cashEquity + scenario.capital.founderSweatEquity + scenario.capital.landContribution
            : 0,
        ),
    },
    { key: 'cffPrincipal', label: '− Principal Repayment', render: (a) => formatCurrency(-a.principal) },
    { key: 'cffExtraPrincipal', label: '− Extra Principal (ITC)', render: (a) => formatCurrency(-a.extraPrincipalFromITC) },
    {
      key: 'cffItc',
      label: 'ITC Received (Cash)',
      render: (a) => formatCurrency(scenario.itc.appliedTo === 'debt' ? 0 : a.itcReceived),
    },
    {
      key: 'cashFromFinancing',
      label: 'Cash from Financing Activities',
      render: (a) => formatCurrency(a.cashFromFinancing),
      emphasis: true,
      summary: true,
    },
    {
      key: 'netChangeInCash',
      label: 'Net Change in Cash',
      render: (a) => formatCurrency(a.netChangeInCash),
      emphasis: true,
      summary: true,
    },
    {
      key: 'endingCashBalance',
      label: 'Ending Cash Balance',
      render: (a) => formatCurrency(a.endingCashBalance),
      emphasis: true,
      summary: true,
    },

    {
      key: 'netCash',
      section: 'Equity Distributions (for IRR)',
      label: 'Net Cash (EBITDA − Debt Service +/− ITC)',
      render: (a) => formatCurrency(a.netCash),
      emphasis: true,
    },
    {
      key: 'cumulativeCF',
      label: 'Cumulative Cash Flow',
      render: (a) => formatCurrency(a.cumulativeCF),
      highlightPayback: true,
    },
  ];
}
