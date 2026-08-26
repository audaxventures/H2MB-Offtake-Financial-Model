import XLSX from 'xlsx-js-style';
import {
  DSCR_DANGER,
  DSCR_TARGET,
  computeBaseCapexBeforeContingency,
  computeCapexByCategory,
  computeITCAmount,
  computeITCEligibleBase,
  computeRoleAnnualCost,
  computeTotalCapex,
  resolveLineItemAnnualAmount,
} from '@/engine/calculations';
import { CAPEX_CATEGORY_LABELS, EXPENSE_CATEGORY_LABELS } from '@/engine/types';
import type { ModelOutputs, Scenario } from '@/engine/types';
import { usedCapexCategories } from '@/lib/statementRows';

const NAVY = '1F4E79';
const WHITE = 'FFFFFF';
const GOLD_BG = 'FFF9E6';
const CONSTRUCTION_BG = 'FAEEDA';
const SUCCESS_BG = 'EAF3DE';
const DANGER_BG = 'FCEBEB';
const INPUT_BLUE = '2E75B6';

const CURRENCY_FMT = '"$"#,##0;("$"#,##0)';
const PERCENT_FMT = '0.0%';
const DSCR_FMT = '0.00"x"';

type CellStyle = NonNullable<XLSX.CellObject['s']>;

const headerStyle: CellStyle = {
  font: { bold: true, color: { rgb: WHITE } },
  fill: { fgColor: { rgb: NAVY } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
};

const inputStyle: CellStyle = { font: { color: { rgb: INPUT_BLUE } } };
const boldStyle: CellStyle = { font: { bold: true } };
const goldFillStyle: CellStyle = { fill: { fgColor: { rgb: GOLD_BG } } };
const constructionFillStyle: CellStyle = { fill: { fgColor: { rgb: CONSTRUCTION_BG } } };

function dscrStyle(value: number | null): CellStyle {
  if (value === null) return {};
  if (value >= DSCR_TARGET) return { fill: { fgColor: { rgb: SUCCESS_BG } } };
  if (value < DSCR_DANGER) return { fill: { fgColor: { rgb: DANGER_BG } } };
  return {};
}

function cell(value: string | number | null, style?: CellStyle, numFmt?: string): XLSX.CellObject {
  const type: XLSX.ExcelDataType = typeof value === 'number' ? 'n' : 's';
  const c: XLSX.CellObject = { v: value ?? '', t: type };
  if (numFmt) c.z = numFmt;
  if (style) c.s = style;
  return c;
}

function buildSheet(rows: XLSX.CellObject[][], colWidths: number[]): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  const range = { s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: 0 } };
  rows.forEach((row, r) => {
    range.e.c = Math.max(range.e.c, row.length - 1);
    row.forEach((c, colIdx) => {
      const ref = XLSX.utils.encode_cell({ r, c: colIdx });
      sheet[ref] = c;
    });
  });
  sheet['!ref'] = XLSX.utils.encode_range(range);
  sheet['!cols'] = colWidths.map((wch) => ({ wch }));
  return sheet;
}

function buildAssumptionsSheet(scenario: Scenario): XLSX.WorkSheet {
  const rows: XLSX.CellObject[][] = [];
  rows.push([cell('H2MB Project Finance Model — Assumptions', boldStyle)]);
  rows.push([cell(`Scenario: ${scenario.name}`, boldStyle)]);
  rows.push([]);

  const section = (title: string) => rows.push([cell(title, headerStyle), cell('', headerStyle)]);
  const line = (label: string, value: number, numFmt = CURRENCY_FMT) =>
    rows.push([cell(label), cell(value, inputStyle, numFmt)]);

  section('Model Settings');
  line('Model Horizon (years)', scenario.modelSettings.totalYears, '0');
  line('Quarterly Detail Years', scenario.modelSettings.quarterlyYears, '0');
  line('Max Daily Capacity (kg)', scenario.plant.maxDailyCapacityKg, '0');
  rows.push([]);

  section('Capital Structure');
  line('Cash Equity', scenario.capital.cashEquity);
  line('Founder / Sweat Equity', scenario.capital.founderSweatEquity);
  line('Land Contribution', scenario.capital.landContribution);
  line('Total Debt', scenario.capital.totalDebt);
  line('Interest Rate', scenario.capital.interestRate, PERCENT_FMT);
  line('Loan Tenor (years)', scenario.capital.loanTenor, '0');
  line('Grace Period (years)', scenario.capital.gracePeriod, '0');
  rows.push([]);

  const capexByCategory = computeCapexByCategory(scenario);
  section('Construction Costs');
  line('Hard CapEx', capexByCategory.hardCapex ?? 0);
  line('Soft Costs', capexByCategory.softCosts ?? 0);
  if (capexByCategory.other) line('Other Capital Costs', capexByCategory.other);
  line('Base CapEx Before Contingency', computeBaseCapexBeforeContingency(scenario));
  line('Contingency', capexByCategory.contingency ?? 0);
  line('Total Project CapEx', computeTotalCapex(scenario));
  line('Construction OpEx / Month', scenario.construction.constructionOpexPerMonth);
  line('Construction Duration (months)', scenario.construction.constructionDurationMonths, '0');
  line('Debt Service Reserve (months)', scenario.construction.debtServiceReserveMonths, '0');
  line('Working Capital Buffer', scenario.construction.workingCapitalBuffer);
  rows.push([]);

  section('CapEx Line Items');
  for (const item of scenario.capexLineItems) {
    const escalationDesc =
      item.escalation.type === 'percentGrowth'
        ? `${((item.escalation.growthRate ?? 0) * 100).toFixed(2)}%/yr growth`
        : item.escalation.type === 'percentOfRevenue'
          ? `${((item.escalation.percentOfRevenue ?? 0) * 100).toFixed(2)}% of revenue`
          : item.escalation.type === 'manual'
            ? 'Manual per-year'
            : 'Flat';
    rows.push([cell(item.name, boldStyle), cell(`${CAPEX_CATEGORY_LABELS[item.category]} · ${escalationDesc}`)]);
  }
  rows.push([]);

  section('ITC Settings');
  rows.push([cell('Calculation Method'), cell(scenario.itc.mode === 'percentOfEligibleCapex' ? '% of Eligible CapEx' : 'Fixed Dollar Amount')]);
  if (scenario.itc.mode === 'percentOfEligibleCapex') {
    rows.push([cell('% of Eligible CapEx'), cell(scenario.itc.percentOfEligibleCapex, { ...inputStyle, ...goldFillStyle }, PERCENT_FMT)]);
    rows.push([cell('Additional Eligible Cost'), cell(scenario.itc.additionalEligibleCostAmount, { ...inputStyle, ...goldFillStyle }, CURRENCY_FMT)]);
    rows.push([cell('ITC-Eligible CapEx Tagged'), cell(computeITCEligibleBase(scenario), undefined, CURRENCY_FMT)]);
  }
  rows.push([cell('ITC Amount (computed)'), cell(computeITCAmount(scenario), { ...inputStyle, ...goldFillStyle }, CURRENCY_FMT)]);
  rows.push([cell('Received in Year'), cell(scenario.itc.receivedInYear, { ...inputStyle, ...goldFillStyle }, '0')]);
  rows.push([
    cell('Received in Quarter'),
    cell(scenario.itc.receivedInQuarter ?? 'Auto', { ...inputStyle, ...goldFillStyle }, scenario.itc.receivedInQuarter ? '0' : undefined),
  ]);
  rows.push([cell('Applied To'), cell(scenario.itc.appliedTo, { ...inputStyle, ...goldFillStyle })]);
  rows.push([]);

  section('Revenue Streams');
  for (const stream of scenario.revenueStreams) {
    rows.push([cell(stream.name, boldStyle)]);
    rows.push([
      cell('  Offtake Type'),
      cell(stream.offtakeMode === 'direct' ? 'Direct Daily Volume' : 'Truck Delivery', inputStyle),
    ]);
    if (stream.offtakeMode === 'trucks') {
      rows.push([cell('  Kg per Truck Fill'), cell(stream.kgPerTruckFill, inputStyle, '0')]);
    }
    rows.push([cell('  H2 Production Cost / kg'), cell(stream.h2ProductionCostPerKg, inputStyle, CURRENCY_FMT)]);
    rows.push([cell('  Start Year'), cell(stream.startYear, inputStyle, '0')]);
  }
  rows.push([]);

  section('Expense Line Items');
  for (const item of scenario.expenseLineItems) {
    const escalationDesc =
      item.escalation.type === 'percentGrowth'
        ? `${((item.escalation.growthRate ?? 0) * 100).toFixed(2)}%/yr growth`
        : item.escalation.type === 'percentOfRevenue'
          ? `${((item.escalation.percentOfRevenue ?? 0) * 100).toFixed(2)}% of revenue`
          : item.escalation.type === 'manual'
            ? 'Manual per-year'
            : 'Flat';
    rows.push([cell(item.name, boldStyle), cell(`${EXPENSE_CATEGORY_LABELS[item.category]} · ${escalationDesc}`)]);
    rows.push([cell('  Base Annual Amount'), cell(item.baseAnnualAmount, inputStyle, CURRENCY_FMT)]);
    rows.push([cell('  Start Year'), cell(item.startYear, inputStyle, '0')]);
  }

  if (scenario.employeeRoles.length > 0) {
    rows.push([]);
    section('Employee Roles (Payroll & Benefits)');
    for (const role of scenario.employeeRoles) {
      const escalationDesc =
        role.salaryEscalation.type === 'percentGrowth'
          ? `${((role.salaryEscalation.growthRate ?? 0) * 100).toFixed(2)}%/yr growth`
          : role.salaryEscalation.type === 'manual'
            ? 'Manual per-year'
            : 'Flat';
      rows.push([
        cell(role.title, boldStyle),
        cell(`${escalationDesc} · ${(role.benefitsPct * 100).toFixed(0)}% benefits`),
      ]);
      rows.push([cell('  Base Annual Salary'), cell(role.baseAnnualSalary, inputStyle, CURRENCY_FMT)]);
      const headcountByYear = Object.entries(role.headcountByYear)
        .filter(([, count]) => count > 0)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([year, count]) => `Y${year}: ${count}`)
        .join(', ');
      rows.push([cell('  Headcount by Year'), cell(headcountByYear || '—')]);
    }
  }

  return buildSheet(rows, [34, 26]);
}

function buildPeriodSheet(outputs: ModelOutputs): XLSX.WorkSheet {
  const headers = [
    'Period',
    'Total Daily Kg',
    'Op.Days',
    'Revenue',
    'Gross Profit',
    'Operating Exp.',
    'EBITDA',
    'Interest',
    'Principal',
    'ITC',
    'Net Cash',
    'Cum. CF',
    'Debt Balance',
    'DSCR',
  ];
  const rows: XLSX.CellObject[][] = [headers.map((h) => cell(h, headerStyle))];

  for (const p of outputs.periods) {
    const rowStyle: CellStyle = p.isConstruction
      ? constructionFillStyle
      : p.isITCPeriod
        ? goldFillStyle
        : {};
    const totalDailyKg = p.streamBreakdown.reduce((acc, s) => acc + s.dailyQuantityKg, 0);
    const avgOperatingDays =
      p.streamBreakdown.length > 0
        ? p.streamBreakdown.reduce((acc, s) => acc + s.operatingDays, 0) / p.streamBreakdown.length
        : 0;
    rows.push([
      cell(p.label, rowStyle),
      cell(p.isConstruction ? '' : totalDailyKg, rowStyle),
      cell(p.isConstruction ? '' : Math.round(avgOperatingDays), rowStyle),
      cell(p.revenue, rowStyle, CURRENCY_FMT),
      cell(p.grossProfit, rowStyle, CURRENCY_FMT),
      cell(p.totalOperatingExpenses, rowStyle, CURRENCY_FMT),
      cell(p.ebitda, rowStyle, CURRENCY_FMT),
      cell(p.interest, rowStyle, CURRENCY_FMT),
      cell(p.principal, rowStyle, CURRENCY_FMT),
      cell(p.itcReceived || '', { ...rowStyle, ...(p.itcReceived > 0 ? goldFillStyle : {}) }, CURRENCY_FMT),
      cell(p.netCash, rowStyle, CURRENCY_FMT),
      cell(p.cumulativeCF, rowStyle, CURRENCY_FMT),
      cell(p.closingDebtBalance, rowStyle, CURRENCY_FMT),
      cell(p.dscr ?? '', { ...rowStyle, ...dscrStyle(p.dscr) }, DSCR_FMT),
    ]);
  }

  return buildSheet(rows, [8, 13, 9, 13, 13, 14, 13, 12, 12, 12, 13, 13, 14, 8]);
}

function buildProfitAndLossSheet(scenario: Scenario, outputs: ModelOutputs): XLSX.WorkSheet {
  const rows: XLSX.CellObject[][] = [];
  const yearHeaders = ['Line Item', ...outputs.annual.map((a) => `Year ${a.year}`)];
  rows.push(yearHeaders.map((h) => cell(h, headerStyle)));

  const line = (
    label: string,
    values: (number | null)[],
    numFmt = CURRENCY_FMT,
    style?: CellStyle,
  ) =>
    rows.push([
      cell(label, style),
      ...values.map((v) => cell(v ?? '', style, numFmt)),
    ]);

  const cogsLineItems = scenario.expenseLineItems.filter((i) => i.category === 'cogs');
  const opexLineItems = scenario.expenseLineItems.filter((i) => i.category !== 'cogs');
  const revenueByYear = new Map(outputs.annual.map((a) => [a.year, a.revenue]));

  for (const stream of scenario.revenueStreams) {
    line(
      stream.name || 'Untitled Stream',
      outputs.annual.map((a) => a.streamBreakdown.find((s) => s.streamId === stream.id)?.revenue ?? 0),
    );
  }
  line('Total Revenue', outputs.annual.map((a) => a.revenue), CURRENCY_FMT, boldStyle);

  for (const stream of scenario.revenueStreams) {
    line(
      `${stream.name || 'Untitled Stream'} — Production Cost`,
      outputs.annual.map((a) => -(a.streamBreakdown.find((s) => s.streamId === stream.id)?.cogs ?? 0)),
    );
  }
  for (const item of cogsLineItems) {
    line(
      item.name || 'Untitled Item',
      outputs.annual.map((a) => -resolveLineItemAnnualAmount(item, a.year, revenueByYear.get(a.year) ?? 0)),
    );
  }
  line('Total Cost of Goods Sold', outputs.annual.map((a) => -a.cogs), CURRENCY_FMT, boldStyle);
  line('Gross Profit', outputs.annual.map((a) => a.grossProfit), CURRENCY_FMT, boldStyle);
  line('Gross Margin %', outputs.annual.map((a) => a.grossMarginPct), PERCENT_FMT);

  line('Pre-Revenue / Construction OpEx', outputs.annual.map((a) => -a.preRevenueOpex));
  for (const item of opexLineItems) {
    line(
      item.name || 'Untitled Item',
      outputs.annual.map((a) => -resolveLineItemAnnualAmount(item, a.year, revenueByYear.get(a.year) ?? 0)),
    );
  }
  if (scenario.employeeRoles.length > 0) {
    line(
      'Payroll & Benefits (Employee Roles)',
      outputs.annual.map((a) => -scenario.employeeRoles.reduce((acc, r) => acc + computeRoleAnnualCost(r, a.year), 0)),
    );
  }
  line(
    'Total Operating Expenses',
    outputs.annual.map((a) => -(a.totalOperatingExpenses + a.preRevenueOpex)),
    CURRENCY_FMT,
    boldStyle,
  );
  line('EBITDA', outputs.annual.map((a) => a.ebitda), CURRENCY_FMT, boldStyle);
  line('EBITDA Margin %', outputs.annual.map((a) => a.ebitdaMarginPct), PERCENT_FMT);
  line('D&A (20yr SL, 5% salvage)', outputs.annual.map((a) => -a.depreciation));
  line('EBIT', outputs.annual.map((a) => a.ebit), CURRENCY_FMT, boldStyle);
  line('Interest Expense', outputs.annual.map((a) => -a.interest));
  line('Net Profit (Loss)', outputs.annual.map((a) => a.netIncome), CURRENCY_FMT, boldStyle);
  line('Net Margin %', outputs.annual.map((a) => a.netIncomeMarginPct), PERCENT_FMT);

  const colWidths = [30, ...outputs.annual.map(() => 14)];
  return buildSheet(rows, colWidths);
}

function buildCashFlowSheet(scenario: Scenario, outputs: ModelOutputs): XLSX.WorkSheet {
  const rows: XLSX.CellObject[][] = [];
  const yearHeaders = ['Line Item', ...outputs.annual.map((a) => `Year ${a.year}`)];
  rows.push(yearHeaders.map((h) => cell(h, headerStyle)));

  const line = (
    label: string,
    values: (number | null)[],
    numFmt = CURRENCY_FMT,
    style?: CellStyle,
  ) =>
    rows.push([
      cell(label, style),
      ...values.map((v) => cell(v ?? '', style, numFmt)),
    ]);

  const capexCategories = usedCapexCategories(scenario, outputs.annual);

  for (const category of capexCategories) {
    line(
      CAPEX_CATEGORY_LABELS[category],
      outputs.annual.map((a) => -(a.capexByCategory[category] ?? 0)),
    );
  }
  line('Cash from Investing Activities', outputs.annual.map((a) => a.cashFromInvesting), CURRENCY_FMT, boldStyle);

  line('Interest Expense', outputs.annual.map((a) => -a.interest));
  line('Principal Repayment', outputs.annual.map((a) => -a.principal));
  line('ITC Received', outputs.annual.map((a) => a.itcReceived));
  line('Extra Principal (ITC)', outputs.annual.map((a) => -a.extraPrincipalFromITC));
  line('Total Debt Service', outputs.annual.map((a) => a.totalDebtService), CURRENCY_FMT, boldStyle);
  rows.push([
    cell('DSCR (annual)'),
    ...outputs.annual.map((a) => cell(a.dscr ?? '', dscrStyle(a.dscr), DSCR_FMT)),
  ]);
  line('DSCR vs 1.25x Target (headroom)', outputs.annual.map((a) => a.dscrHeadroom), DSCR_FMT);
  line('Closing Debt Balance', outputs.annual.map((a) => a.closingDebtBalance));

  line('Net Income', outputs.annual.map((a) => a.netIncome));
  line('+ Depreciation & Amortization', outputs.annual.map((a) => a.depreciation));
  line('Cash from Operating Activities', outputs.annual.map((a) => a.cashFromOperations), CURRENCY_FMT, boldStyle);
  line('Cash from Investing Activities', outputs.annual.map((a) => a.cashFromInvesting));
  line('Debt Drawn (Financial Close)', outputs.annual.map((a) => (a.year === 1 ? scenario.capital.totalDebt : 0)));
  line(
    'Equity Contributed (Financial Close)',
    outputs.annual.map((a) =>
      a.year === 1
        ? scenario.capital.cashEquity + scenario.capital.founderSweatEquity + scenario.capital.landContribution
        : 0,
    ),
  );
  line('− Principal Repayment', outputs.annual.map((a) => -a.principal));
  line('− Extra Principal (ITC)', outputs.annual.map((a) => -a.extraPrincipalFromITC));
  line('ITC Received (Cash)', outputs.annual.map((a) => (scenario.itc.appliedTo === 'debt' ? 0 : a.itcReceived)));
  line('Cash from Financing Activities', outputs.annual.map((a) => a.cashFromFinancing), CURRENCY_FMT, boldStyle);
  line('Net Change in Cash', outputs.annual.map((a) => a.netChangeInCash), CURRENCY_FMT, boldStyle);
  line('Ending Cash Balance', outputs.annual.map((a) => a.endingCashBalance), CURRENCY_FMT, boldStyle);

  line('Net Cash (EBITDA − Debt Service +/− ITC)', outputs.annual.map((a) => a.netCash), CURRENCY_FMT, boldStyle);
  line('Cumulative Cash Flow', outputs.annual.map((a) => a.cumulativeCF));

  const colWidths = [30, ...outputs.annual.map(() => 14)];
  return buildSheet(rows, colWidths);
}

function buildSourcesUsesSheet(scenario: Scenario, outputs: ModelOutputs): XLSX.WorkSheet {
  const { sourcesAndUses: su } = outputs;
  const rows: XLSX.CellObject[][] = [];
  rows.push([cell('Sources', headerStyle), cell('', headerStyle)]);
  rows.push([cell('Cash Equity'), cell(su.sources.cashEquity, undefined, CURRENCY_FMT)]);
  rows.push([cell('Founder / Sweat Equity'), cell(su.sources.founderSweatEquity, undefined, CURRENCY_FMT)]);
  rows.push([cell('Land Contribution'), cell(su.sources.landContribution, undefined, CURRENCY_FMT)]);
  rows.push([cell('Debt Facility'), cell(su.sources.debt, undefined, CURRENCY_FMT)]);
  rows.push([cell('⚡ ITC Refund', goldFillStyle), cell(su.sources.itc, goldFillStyle, CURRENCY_FMT)]);
  rows.push([cell('Total Sources', boldStyle), cell(su.sources.total, boldStyle, CURRENCY_FMT)]);
  rows.push([]);
  rows.push([cell('Uses', headerStyle), cell('', headerStyle)]);
  rows.push([cell('Hard CapEx'), cell(su.uses.hardCapex, undefined, CURRENCY_FMT)]);
  rows.push([cell('Soft Costs'), cell(su.uses.softCosts, undefined, CURRENCY_FMT)]);
  if (su.uses.otherCapex) {
    rows.push([cell('Other Capital Costs'), cell(su.uses.otherCapex, undefined, CURRENCY_FMT)]);
  }
  rows.push([cell('Base CapEx Before Contingency', boldStyle), cell(computeBaseCapexBeforeContingency(scenario), boldStyle, CURRENCY_FMT)]);
  rows.push([cell('Contingency'), cell(su.uses.contingency, undefined, CURRENCY_FMT)]);
  rows.push([cell('Total Project CapEx', boldStyle), cell(computeTotalCapex(scenario), boldStyle, CURRENCY_FMT)]);
  rows.push([cell('Pre-Revenue OpEx'), cell(su.uses.preRevenueOpex, undefined, CURRENCY_FMT)]);
  rows.push([cell('Debt Service Reserve'), cell(su.uses.debtServiceReserve, undefined, CURRENCY_FMT)]);
  rows.push([cell('Working Capital Buffer'), cell(su.uses.workingCapitalBuffer, undefined, CURRENCY_FMT)]);
  rows.push([cell('Total Uses', boldStyle), cell(su.uses.total, boldStyle, CURRENCY_FMT)]);
  rows.push([]);
  rows.push([
    cell('Surplus / (Gap)', boldStyle),
    cell(su.surplusOrGap, { ...boldStyle, fill: { fgColor: { rgb: su.surplusOrGap >= 0 ? SUCCESS_BG : DANGER_BG } } }, CURRENCY_FMT),
  ]);

  return buildSheet(rows, [26, 16]);
}

export function exportToExcel(scenario: Scenario, outputs: ModelOutputs): void {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildAssumptionsSheet(scenario), 'Assumptions');
  XLSX.utils.book_append_sheet(workbook, buildPeriodSheet(outputs), 'Period Detail');
  XLSX.utils.book_append_sheet(workbook, buildProfitAndLossSheet(scenario, outputs), 'Profit & Loss');
  XLSX.utils.book_append_sheet(workbook, buildCashFlowSheet(scenario, outputs), 'Cash Flow Statement');
  XLSX.utils.book_append_sheet(workbook, buildSourcesUsesSheet(scenario, outputs), 'Sources & Uses');

  const fileName = `H2MB_Finance_Model_${scenario.name.replace(/\s+/g, '_')}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}
