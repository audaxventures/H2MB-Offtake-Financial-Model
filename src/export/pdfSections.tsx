import type { CSSProperties, ReactNode } from 'react';
import { RevenueEBITDAChart } from '@/components/charts/RevenueEBITDAChart';
import { DebtWaterfallChart } from '@/components/charts/DebtWaterfallChart';
import { DSCRChart } from '@/components/charts/DSCRChart';
import { StatementTable } from '@/components/shared/StatementTable';
import {
  buildCashFlowRows,
  buildProfitAndLossRows,
  filterRowsForDetail,
  type StatementDetail,
} from '@/lib/statementRows';
import {
  computeBaseCapexBeforeContingency,
  computeITCAmount,
  computeITCEligibleBase,
  computeRoleAnnualCost,
  computeTotalCapex,
  resolveLineItemAnnualAmount,
} from '@/engine/calculations';
import { CAPEX_CATEGORY_LABELS, EXPENSE_CATEGORY_LABELS } from '@/engine/types';
import type { ModelOutputs, Scenario } from '@/engine/types';
import { formatCurrency, formatCurrencyCompact, formatDSCR, formatPercent } from '@/engine/formatters';

export type PDFSectionId = 'sourcesUses' | 'pnl' | 'cashflow' | 'revenue' | 'expenses' | 'capex';

export const PDF_SECTION_LABELS: Record<PDFSectionId, string> = {
  sourcesUses: 'Sources & Uses / ITC',
  pnl: 'Profit & Loss Statement',
  cashflow: 'Cash Flow Statement',
  revenue: 'Revenue Assumptions',
  expenses: 'Expense Items & Payroll',
  capex: 'Construction / CapEx',
};

export const PDF_SECTION_ORDER: PDFSectionId[] = [
  'sourcesUses',
  'pnl',
  'cashflow',
  'revenue',
  'expenses',
  'capex',
];

const NAVY = '#1F4E79';
const BORDER = '#e2e8f0';
const MUTED = '#64748b';
const TEXT = '#0f172a';

function pageWidthFor(yearCount: number): number {
  return Math.max(1400, 340 + yearCount * 150);
}

/** Common page chrome: logo header + title, repeated on every exported page. */
function PageShell({
  scenario,
  title,
  width,
  children,
}: {
  scenario: Scenario;
  title: string;
  width: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width,
        padding: 32,
        background: '#ffffff',
        color: TEXT,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `4px solid ${NAVY}`,
          paddingBottom: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="/logo.png" alt="H2MB Inc." style={{ height: 44, width: 'auto' }} />
          <div style={{ borderLeft: `2px solid ${BORDER}`, paddingLeft: 16 }}>
            <h1 style={{ margin: 0, fontSize: 20, color: NAVY }}>{title}</h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: MUTED }}>
              {scenario.name} · Generated {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function cellStyle(align: 'left' | 'right'): CSSProperties {
  return { textAlign: align, padding: '5px 8px', whiteSpace: 'nowrap' };
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'success' | 'danger' }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12 }}>
      <p style={{ margin: 0, fontSize: 10, textTransform: 'uppercase', color: MUTED, letterSpacing: 0.5 }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700, color: tone === 'success' ? '#3B6D11' : tone === 'danger' ? '#A32D2D' : TEXT }}>
        {value}
      </p>
      {sub && <p style={{ margin: 0, fontSize: 11, color: MUTED }}>{sub}</p>}
    </div>
  );
}

function MiniTable({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12 }}>
      <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13 }}>{title}</p>
      {rows.map(([label, value], idx) => (
        <div
          key={label}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            padding: '3px 0',
            borderTop: idx === rows.length - 1 ? `1px solid ${BORDER}` : undefined,
            fontWeight: idx === rows.length - 1 ? 700 : 400,
          }}
        >
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <table style={{ width: 'auto', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
      <thead>
        <tr style={{ background: NAVY, color: '#fff' }}>
          {headers.map((h, i) => (
            <th key={h} style={cellStyle(i === 0 ? 'left' : 'right')}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} style={{ borderTop: `1px solid ${BORDER}` }}>
            {row.map((cell, ci) => (
              <td key={ci} style={cellStyle(ci === 0 ? 'left' : 'right')}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12 }}>
      <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13 }}>{title}</p>
      <div style={{ width: '100%', height: 220 }}>{children}</div>
    </div>
  );
}

export function CoverPage({ scenario, outputs }: { scenario: Scenario; outputs: ModelOutputs }) {
  const width = pageWidthFor(outputs.annual.length);
  const itcYear = outputs.periods.find((p) => p.itcReceived > 0)?.year ?? null;

  return (
    <PageShell scenario={scenario} title="Executive Summary" width={width}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <Kpi label={`Total ${outputs.annual.length}-yr Revenue`} value={formatCurrencyCompact(outputs.totalRevenueAllYears)} />
        <Kpi label={`Net Cash (${outputs.annual.length}yr)`} value={formatCurrencyCompact(outputs.totalNetCashAllYears)} />
        <Kpi label="Equity IRR" value={outputs.equityIRR !== null ? formatPercent(outputs.equityIRR, 1) : 'N/A'} />
        <Kpi label="Min DSCR" value={formatDSCR(outputs.minDSCR)} sub={outputs.minDSCRYear ? `Year ${outputs.minDSCRYear}` : undefined} />
        <Kpi
          label="Funding Status"
          value={outputs.sourcesAndUses.isFullyFunded ? 'Fully Funded' : 'Funding Gap'}
          sub={formatCurrencyCompact(Math.abs(outputs.sourcesAndUses.surplusOrGap))}
          tone={outputs.sourcesAndUses.isFullyFunded ? 'success' : 'danger'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <ChartPanel title="Revenue & EBITDA vs. Total Costs">
          <RevenueEBITDAChart annual={outputs.annual} itcReceivedYear={itcYear} />
        </ChartPanel>
        <ChartPanel title="Debt Balance">
          <DebtWaterfallChart annual={outputs.annual} />
        </ChartPanel>
        <ChartPanel title="DSCR by Year">
          <DSCRChart annual={outputs.annual} />
        </ChartPanel>
      </div>
    </PageShell>
  );
}

export function SourcesUsesPage({ scenario, outputs }: { scenario: Scenario; outputs: ModelOutputs }) {
  const width = pageWidthFor(outputs.annual.length);
  const su = outputs.sourcesAndUses;
  const eligibleBase = computeITCEligibleBase(scenario);
  const itcAmount = computeITCAmount(scenario);
  const totalProjectCapex = computeTotalCapex(scenario);
  const baseCapexBeforeContingency = computeBaseCapexBeforeContingency(scenario);

  return (
    <PageShell scenario={scenario} title="Sources & Uses / ITC" width={width}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <MiniTable
          title="Sources"
          rows={[
            ['Cash Equity', formatCurrency(su.sources.cashEquity)],
            ['Sweat Equity', formatCurrency(su.sources.founderSweatEquity)],
            ['Land', formatCurrency(su.sources.landContribution)],
            ['Debt', formatCurrency(su.sources.debt)],
            ['ITC', formatCurrency(su.sources.itc)],
            ['Total Sources', formatCurrency(su.sources.total)],
          ]}
        />
        <MiniTable
          title="Uses"
          rows={[
            ['Hard CapEx', formatCurrency(su.uses.hardCapex)],
            ['Soft Costs', formatCurrency(su.uses.softCosts)],
            ...(su.uses.otherCapex > 0 ? ([['Other CapEx', formatCurrency(su.uses.otherCapex)]] as [string, string][]) : []),
            ['Base CapEx Before Contingency', formatCurrency(baseCapexBeforeContingency)],
            ['Contingency', formatCurrency(su.uses.contingency)],
            ['Total Project CapEx', formatCurrency(totalProjectCapex)],
            ['Pre-Rev OpEx', formatCurrency(su.uses.preRevenueOpex)],
            ['DSR', formatCurrency(su.uses.debtServiceReserve)],
            ['Working Capital', formatCurrency(su.uses.workingCapitalBuffer)],
            ['Total Uses', formatCurrency(su.uses.total)],
          ]}
        />
      </div>
      <MiniTable
        title="ITC Deep Dive"
        rows={[
          ['Calculation Method', scenario.itc.mode === 'percentOfEligibleCapex' ? '% of Eligible CapEx' : 'Fixed Dollar Amount'],
          ...(scenario.itc.mode === 'percentOfEligibleCapex'
            ? ([
                ['% of Eligible CapEx', formatPercent(scenario.itc.percentOfEligibleCapex, 1)],
                ['ITC-Eligible CapEx Tagged', formatCurrency(eligibleBase)],
              ] as [string, string][])
            : []),
          ['ITC Amount', formatCurrency(itcAmount)],
          ['Applied To', scenario.itc.appliedTo === 'debt' ? 'Debt Paydown' : scenario.itc.appliedTo === 'reserve' ? 'Reserve' : 'OpEx'],
          ['Interest Saved from ITC', formatCurrency(outputs.interestSavedFromITC)],
        ]}
      />
    </PageShell>
  );
}

export function StatementPage({
  scenario,
  outputs,
  statement,
  detail,
}: {
  scenario: Scenario;
  outputs: ModelOutputs;
  statement: 'pnl' | 'cashflow';
  detail: StatementDetail;
}) {
  const width = pageWidthFor(outputs.annual.length);
  const allRows = statement === 'pnl' ? buildProfitAndLossRows(scenario) : buildCashFlowRows(scenario, outputs.annual);
  const rows = filterRowsForDetail(allRows, detail);

  return (
    <PageShell scenario={scenario} title={PDF_SECTION_LABELS[statement]} width={width}>
      <StatementTable annual={outputs.annual} rows={rows} equityPaybackYear={outputs.equityPaybackYear} printMode />
    </PageShell>
  );
}

export function RevenuePage({
  scenario,
  outputs,
  detail,
}: {
  scenario: Scenario;
  outputs: ModelOutputs;
  detail: StatementDetail;
}) {
  const width = pageWidthFor(outputs.annual.length);
  const years = outputs.annual.map((a) => a.year);

  const assumptionRows = scenario.revenueStreams.map((s) => [
    s.name,
    s.offtakeMode === 'direct' ? 'Direct Daily Volume' : 'Truck Delivery',
    formatCurrency(s.h2ProductionCostPerKg, 2),
    String(s.startYear),
  ]);

  const revenueByStreamYear = new Map<string, Map<number, number>>();
  for (const stream of scenario.revenueStreams) revenueByStreamYear.set(stream.id, new Map());
  for (const period of outputs.periods) {
    for (const sb of period.streamBreakdown) {
      const byYear = revenueByStreamYear.get(sb.streamId);
      if (!byYear) continue;
      byYear.set(period.year, (byYear.get(period.year) ?? 0) + sb.revenue);
    }
  }

  return (
    <PageShell scenario={scenario} title="Revenue Assumptions" width={width}>
      <SimpleTable
        headers={['Revenue Stream', 'Offtake Mode', 'H2 Cost / kg', 'Start Year']}
        rows={assumptionRows}
      />
      {detail === 'detailed' ? (
        <SimpleTable
          headers={['Revenue by Stream', ...years.map((y) => `Year ${y}`)]}
          rows={[
            ...scenario.revenueStreams.map((s) => [
              s.name,
              ...years.map((y) => formatCurrency(revenueByStreamYear.get(s.id)?.get(y) ?? 0)),
            ]),
            ['Total Revenue', ...outputs.annual.map((a) => formatCurrency(a.revenue))],
          ]}
        />
      ) : (
        <SimpleTable
          headers={['Total Revenue by Year', ...years.map((y) => `Year ${y}`)]}
          rows={[['Hydrogen Sales Revenue', ...outputs.annual.map((a) => formatCurrency(a.revenue))]]}
        />
      )}
    </PageShell>
  );
}

export function ExpensesPage({
  scenario,
  outputs,
  detail,
}: {
  scenario: Scenario;
  outputs: ModelOutputs;
  detail: StatementDetail;
}) {
  const width = pageWidthFor(outputs.annual.length);
  const years = outputs.annual.map((a) => a.year);
  const revenueByYear = new Map(outputs.annual.map((a) => [a.year, a.revenue]));

  return (
    <PageShell scenario={scenario} title="Expense Items & Payroll" width={width}>
      {detail === 'detailed' ? (
        <>
          <SimpleTable
            headers={['Expense Line Item', 'Category', ...years.map((y) => `Y${y}`)]}
            rows={[
              ...scenario.expenseLineItems.map((item) => [
                item.name,
                EXPENSE_CATEGORY_LABELS[item.category],
                ...years.map((y) => formatCurrency(resolveLineItemAnnualAmount(item, y, revenueByYear.get(y) ?? 0))),
              ]),
              ...(scenario.employeeRoles.length > 0
                ? [[
                    'Payroll & Benefits (Employee Roles)',
                    'Payroll & Benefits',
                    ...years.map((y) => formatCurrency(scenario.employeeRoles.reduce((acc, r) => acc + computeRoleAnnualCost(r, y), 0))),
                  ]]
                : []),
              ['Total Operating Expenses', '', ...outputs.annual.map((a) => formatCurrency(a.totalOperatingExpenses))],
            ]}
          />
          {scenario.employeeRoles.length > 0 && (
            <SimpleTable
              headers={['Employee Role', 'Peak Headcount', ...years.map((y) => `Y${y}`)]}
              rows={scenario.employeeRoles.map((r) => [
                r.title,
                String(Math.max(0, ...Object.values(r.headcountByYear))),
                ...years.map((y) => formatCurrency(computeRoleAnnualCost(r, y))),
              ])}
            />
          )}
        </>
      ) : (
        <SimpleTable
          headers={['Total Operating Expenses by Year', ...years.map((y) => `Y${y}`)]}
          rows={[['All Operating Expenses', ...outputs.annual.map((a) => formatCurrency(a.totalOperatingExpenses))]]}
        />
      )}
    </PageShell>
  );
}

export function CapexPage({
  scenario,
  outputs,
  detail,
}: {
  scenario: Scenario;
  outputs: ModelOutputs;
  detail: StatementDetail;
}) {
  const width = pageWidthFor(outputs.annual.length);
  const years = outputs.annual.map((a) => a.year);
  const revenueByYear = new Map(outputs.annual.map((a) => [a.year, a.revenue]));

  return (
    <PageShell scenario={scenario} title="Construction / CapEx" width={width}>
      {detail === 'detailed' ? (
        <SimpleTable
          headers={['CapEx Line Item', 'Category', 'ITC Eligible', ...years.map((y) => `Y${y}`)]}
          rows={[
            ...scenario.capexLineItems.map((item) => [
              item.name,
              CAPEX_CATEGORY_LABELS[item.category],
              item.itcEligible ? 'Yes' : 'No',
              ...years.map((y) => formatCurrency(resolveLineItemAnnualAmount(item, y, revenueByYear.get(y) ?? 0))),
            ]),
            ['Total CapEx Spend', '', '', ...outputs.annual.map((a) => formatCurrency(a.capexSpend))],
          ]}
        />
      ) : (
        <SimpleTable
          headers={['Total CapEx by Year', ...years.map((y) => `Y${y}`)]}
          rows={[['CapEx Spend', ...outputs.annual.map((a) => formatCurrency(a.capexSpend))]]}
        />
      )}
    </PageShell>
  );
}
