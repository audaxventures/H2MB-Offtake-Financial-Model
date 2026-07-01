import XLSX from 'xlsx-js-style';
import { DSCR_DANGER, DSCR_TARGET } from '@/engine/calculations';
import type { ModelOutputs, Scenario } from '@/engine/types';

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

  section('Capital Structure');
  line('Cash Equity', scenario.capital.cashEquity);
  line('Founder / Sweat Equity', scenario.capital.founderSweatEquity);
  line('Land Contribution', scenario.capital.landContribution);
  line('Total Debt', scenario.capital.totalDebt);
  line('Interest Rate', scenario.capital.interestRate, PERCENT_FMT);
  line('Loan Tenor (years)', scenario.capital.loanTenor, '0');
  line('Grace Period (years)', scenario.capital.gracePeriod, '0');
  rows.push([]);

  section('Construction Costs');
  line('Hard CapEx', scenario.construction.hardCapex);
  line('Soft Costs', scenario.construction.softCosts);
  line('Contingency', scenario.construction.contingency);
  line('Construction OpEx / Month', scenario.construction.constructionOpexPerMonth);
  line('Construction Duration (months)', scenario.construction.constructionDurationMonths, '0');
  line('Debt Service Reserve (months)', scenario.construction.debtServiceReserveMonths, '0');
  line('Working Capital Buffer', scenario.construction.workingCapitalBuffer);
  rows.push([]);

  section('ITC Settings');
  rows.push([cell('ITC Amount'), cell(scenario.itc.amount, { ...inputStyle, ...goldFillStyle }, CURRENCY_FMT)]);
  rows.push([cell('Received in Year'), cell(scenario.itc.receivedInYear, { ...inputStyle, ...goldFillStyle }, '0')]);
  rows.push([cell('Applied To'), cell(scenario.itc.appliedTo, { ...inputStyle, ...goldFillStyle })]);
  rows.push([]);

  section('Production & Steady-State');
  line('Kg per Truck Fill', scenario.production.kgPerTruckFill, '0');
  line('H2 Production Cost / kg', scenario.production.h2ProductionCostPerKg, CURRENCY_FMT);
  line('Expense Escalation Rate', scenario.production.expenseEscalationRate, PERCENT_FMT);
  line('Year 5+ Price / kg', scenario.production.year5PlusPricePerKg, CURRENCY_FMT);
  line('Year 5+ Annual Expenses', scenario.production.year5PlusAnnualExpenses);

  return buildSheet(rows, [34, 20]);
}

function buildQuarterlySheet(outputs: ModelOutputs): XLSX.WorkSheet {
  const headers = [
    'Quarter',
    'Trucks/Day',
    'Op.Days',
    '$/kg',
    'Revenue',
    'Gross Profit',
    'Expenses (qtr)',
    'Annual Budget',
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

  for (const q of outputs.quarters) {
    const rowStyle: CellStyle = q.isConstruction
      ? constructionFillStyle
      : q.isITCQuarter
        ? goldFillStyle
        : {};
    rows.push([
      cell(q.label, rowStyle),
      cell(q.isConstruction ? '' : q.trucksPerDay, rowStyle),
      cell(q.isConstruction ? '' : q.operatingDays, rowStyle),
      cell(q.isConstruction ? '' : q.pricePerKg, rowStyle, CURRENCY_FMT),
      cell(q.revenue, rowStyle, CURRENCY_FMT),
      cell(q.grossProfit, rowStyle, CURRENCY_FMT),
      cell(q.quarterlyExpenses, rowStyle, CURRENCY_FMT),
      cell(q.isConstruction ? '' : q.annualExpensesBudget, rowStyle, CURRENCY_FMT),
      cell(q.ebitda, rowStyle, CURRENCY_FMT),
      cell(q.interest, rowStyle, CURRENCY_FMT),
      cell(q.principal, rowStyle, CURRENCY_FMT),
      cell(q.itcReceived || '', { ...rowStyle, ...(q.itcReceived > 0 ? goldFillStyle : {}) }, CURRENCY_FMT),
      cell(q.netCash, rowStyle, CURRENCY_FMT),
      cell(q.cumulativeCF, rowStyle, CURRENCY_FMT),
      cell(q.closingDebtBalance, rowStyle, CURRENCY_FMT),
      cell(q.dscr ?? '', { ...rowStyle, ...dscrStyle(q.dscr) }, DSCR_FMT),
    ]);
  }

  return buildSheet(rows, [8, 11, 9, 8, 13, 13, 14, 14, 13, 12, 12, 12, 13, 13, 14, 8]);
}

function buildAnnualSheet(outputs: ModelOutputs): XLSX.WorkSheet {
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

  line('Hydrogen Sales Revenue', outputs.annual.map((a) => a.revenue));
  line('Cost of Goods Sold', outputs.annual.map((a) => -a.cogs));
  line('Gross Profit', outputs.annual.map((a) => a.grossProfit), CURRENCY_FMT, boldStyle);
  line('Gross Margin %', outputs.annual.map((a) => a.grossMarginPct), PERCENT_FMT);
  line('Company Expenses', outputs.annual.map((a) => -a.companyExpenses));
  line('EBITDA', outputs.annual.map((a) => a.ebitda), CURRENCY_FMT, boldStyle);
  line('EBITDA Margin %', outputs.annual.map((a) => a.ebitdaMarginPct), PERCENT_FMT);
  line('D&A (20yr SL, 5% salvage)', outputs.annual.map((a) => -a.depreciation));
  line('EBIT', outputs.annual.map((a) => a.ebit), CURRENCY_FMT, boldStyle);
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
  line('Net Cash', outputs.annual.map((a) => a.netCash), CURRENCY_FMT, boldStyle);
  line('Cumulative Cash Flow', outputs.annual.map((a) => a.cumulativeCF));
  line('Closing Debt Balance', outputs.annual.map((a) => a.closingDebtBalance));

  return buildSheet(rows, [30, 14, 14, 14, 14, 14]);
}

function buildSourcesUsesSheet(outputs: ModelOutputs): XLSX.WorkSheet {
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
  rows.push([cell('Contingency'), cell(su.uses.contingency, undefined, CURRENCY_FMT)]);
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
  XLSX.utils.book_append_sheet(workbook, buildQuarterlySheet(outputs), 'Quarterly Model');
  XLSX.utils.book_append_sheet(workbook, buildAnnualSheet(outputs), 'Annual Summary');
  XLSX.utils.book_append_sheet(workbook, buildSourcesUsesSheet(outputs), 'Sources & Uses');

  const fileName = `H2MB_Finance_Model_${scenario.name.replace(/\s+/g, '_')}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}
