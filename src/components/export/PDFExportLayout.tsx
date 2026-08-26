import { forwardRef } from 'react';
import { RevenueEBITDAChart } from '@/components/charts/RevenueEBITDAChart';
import { DebtWaterfallChart } from '@/components/charts/DebtWaterfallChart';
import { DSCRChart } from '@/components/charts/DSCRChart';
import { formatCurrency, formatCurrencyCompact, formatDSCR, formatPercent } from '@/engine/formatters';
import type { ModelOutputs, Scenario } from '@/engine/types';

interface PDFExportLayoutProps {
  scenario: Scenario;
  outputs: ModelOutputs;
}

export const PDFExportLayout = forwardRef<HTMLDivElement, PDFExportLayoutProps>(
  function PDFExportLayout({ scenario, outputs }, ref) {
    const itcYear = outputs.periods.find((p) => p.itcReceived > 0)?.year ?? null;
    const pageWidth = Math.max(1500, 700 + outputs.annual.length * 55);

    return (
      <div
        ref={ref}
        style={{
          width: pageWidth,
          padding: 40,
          background: '#ffffff',
          color: '#0f172a',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '4px solid #1F4E79', paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, color: '#1F4E79' }}>H2MB Inc. — Project Finance Model</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#475569' }}>
              Executive Summary — {scenario.name} · Generated {new Date().toLocaleDateString()}
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#475569' }}>
            <p style={{ margin: 0 }}>Manitoba's first commercial-scale green hydrogen facility</p>
            <p style={{ margin: 0 }}>2.5 MW PEM electrolyzer · up to 1,000 kg/day</p>
          </div>
        </div>

        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
          <Kpi
            label={`Total ${outputs.annual.length}-yr Revenue`}
            value={formatCurrencyCompact(outputs.totalRevenueAllYears)}
          />
          <Kpi
            label={`Net Cash (${outputs.annual.length}yr)`}
            value={formatCurrencyCompact(outputs.totalNetCashAllYears)}
          />
          <Kpi
            label="Equity IRR"
            value={outputs.equityIRR !== null ? formatPercent(outputs.equityIRR, 1) : 'N/A'}
          />
          <Kpi label="Min DSCR" value={formatDSCR(outputs.minDSCR)} sub={outputs.minDSCRYear ? `Year ${outputs.minDSCRYear}` : undefined} />
          <Kpi
            label="Funding Status"
            value={outputs.sourcesAndUses.isFullyFunded ? 'Fully Funded' : 'Funding Gap'}
            sub={formatCurrencyCompact(Math.abs(outputs.sourcesAndUses.surplusOrGap))}
            tone={outputs.sourcesAndUses.isFullyFunded ? 'success' : 'danger'}
          />
        </div>

        {/* Sources & Uses */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <MiniTable
            title="Sources"
            rows={[
              ['Cash Equity', formatCurrency(outputs.sourcesAndUses.sources.cashEquity)],
              ['Sweat Equity', formatCurrency(outputs.sourcesAndUses.sources.founderSweatEquity)],
              ['Land', formatCurrency(outputs.sourcesAndUses.sources.landContribution)],
              ['Debt', formatCurrency(outputs.sourcesAndUses.sources.debt)],
              ['ITC', formatCurrency(outputs.sourcesAndUses.sources.itc)],
              ['Total Sources', formatCurrency(outputs.sourcesAndUses.sources.total)],
            ]}
          />
          <MiniTable
            title="Uses"
            rows={[
              ['Hard CapEx', formatCurrency(outputs.sourcesAndUses.uses.hardCapex)],
              ['Soft Costs', formatCurrency(outputs.sourcesAndUses.uses.softCosts)],
              ['Contingency', formatCurrency(outputs.sourcesAndUses.uses.contingency)],
              ...(outputs.sourcesAndUses.uses.otherCapex > 0
                ? ([['Other CapEx', formatCurrency(outputs.sourcesAndUses.uses.otherCapex)]] as [string, string][])
                : []),
              ['Pre-Rev OpEx', formatCurrency(outputs.sourcesAndUses.uses.preRevenueOpex)],
              ['DSR', formatCurrency(outputs.sourcesAndUses.uses.debtServiceReserve)],
              ['Total Uses', formatCurrency(outputs.sourcesAndUses.uses.total)],
            ]}
          />
        </div>

        {/* Annual P&L */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#1F4E79', color: '#fff' }}>
              <th style={cellStyle('left')}>Line Item</th>
              {outputs.annual.map((a) => (
                <th key={a.year} style={cellStyle('right')}>
                  Year {a.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Revenue" values={outputs.annual.map((a) => formatCurrency(a.revenue))} />
            <Row label="EBITDA" values={outputs.annual.map((a) => formatCurrency(a.ebitda))} bold />
            <Row label="Net Cash" values={outputs.annual.map((a) => formatCurrency(a.netCash))} />
            <Row label="Cumulative CF" values={outputs.annual.map((a) => formatCurrency(a.cumulativeCF))} />
            <Row label="Closing Debt Balance" values={outputs.annual.map((a) => formatCurrency(a.closingDebtBalance))} />
            <Row label="DSCR" values={outputs.annual.map((a) => formatDSCR(a.dscr))} />
          </tbody>
        </table>

        {/* Charts */}
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
      </div>
    );
  },
);

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'success' | 'danger' }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
      <p style={{ margin: 0, fontSize: 10, textTransform: 'uppercase', color: '#64748b', letterSpacing: 0.5 }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700, color: tone === 'success' ? '#3B6D11' : tone === 'danger' ? '#A32D2D' : '#0f172a' }}>
        {value}
      </p>
      {sub && <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{sub}</p>}
    </div>
  );
}

function MiniTable({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
      <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13 }}>{title}</p>
      {rows.map(([label, value], idx) => (
        <div
          key={label}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            padding: '3px 0',
            borderTop: idx === rows.length - 1 ? '1px solid #e2e8f0' : undefined,
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

function Row({ label, values, bold }: { label: string; values: string[]; bold?: boolean }) {
  return (
    <tr style={{ borderTop: '1px solid #e2e8f0', fontWeight: bold ? 700 : 400 }}>
      <td style={cellStyle('left')}>{label}</td>
      {values.map((v, i) => (
        <td key={i} style={cellStyle('right')}>
          {v}
        </td>
      ))}
    </tr>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
      <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13 }}>{title}</p>
      <div style={{ width: '100%', height: 220 }}>{children}</div>
    </div>
  );
}

function cellStyle(align: 'left' | 'right'): React.CSSProperties {
  return { textAlign: align, padding: '5px 8px' };
}
