import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertBanner } from '@/components/shared/AlertBanner';
import {
  computeDebtPayoffQuarter,
  computeEquityIRRFromScenario,
  periodLabel,
  runModel,
} from '@/engine/calculations';
import { formatCurrency, formatCurrencyCompact, formatPercent } from '@/engine/formatters';
import { useScenarioStore } from '@/store/scenarioStore';
import { useModelOutputs } from '@/store/useModelOutputs';

export function SourcesAndUses() {
  const current = useScenarioStore((s) => s.current);
  const outputs = useModelOutputs();
  const { sourcesAndUses } = outputs;

  const noItcOutputs = useMemo(() => {
    const noItcScenario = { ...current, itc: { ...current.itc, amount: 0 } };
    return runModel(noItcScenario);
  }, [current]);

  const payoffWithITC = useMemo(() => computeDebtPayoffQuarter(current), [current]);
  const payoffWithoutITC = useMemo(() => computeDebtPayoffQuarter(current, 0), [current]);
  const noItcIRR = computeEquityIRRFromScenario(current, noItcOutputs.annual);

  const eligibleCapex = current.construction.hardCapex + current.construction.softCosts;
  const itcPctOfCapex = eligibleCapex > 0 ? current.itc.amount / eligibleCapex : 0;

  const savingsChartData = [
    { label: 'Without ITC', value: outputs.totalInterestPaidNoITC },
    { label: 'With ITC', value: outputs.totalInterestPaid },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {/* Left panel */}
      <div className="grid gap-6 content-start">
        <AlertBanner
          variant={sourcesAndUses.isFullyFunded ? 'success' : 'danger'}
          title={
            sourcesAndUses.isFullyFunded
              ? `✓ Fully funded — ${formatCurrencyCompact(sourcesAndUses.surplusOrGap)} surplus at financial close`
              : `⚠ Funding gap of ${formatCurrencyCompact(Math.abs(sourcesAndUses.surplusOrGap))} — cannot close as structured`
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <LineRow label="Cash Equity" value={formatCurrency(sourcesAndUses.sources.cashEquity)} />
            <LineRow label="Founder / Sweat Equity" value={formatCurrency(sourcesAndUses.sources.founderSweatEquity)} />
            <LineRow label="Land Contribution" value={formatCurrency(sourcesAndUses.sources.landContribution)} />
            <LineRow label="Debt Facility" value={formatCurrency(sourcesAndUses.sources.debt)} />
            <LineRow
              label={`⚡ ITC Refund (Year ${current.itc.receivedInYear})`}
              value={`+${formatCurrency(sourcesAndUses.sources.itc)}`}
              className="bg-h2mb-gold-bg/60 -mx-2 rounded px-2"
            />
            <LineRow label="Total Sources" value={formatCurrency(sourcesAndUses.sources.total)} strong divider />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Uses</CardTitle>
          </CardHeader>
          <CardContent>
            <LineRow label="Hard CapEx" value={formatCurrency(sourcesAndUses.uses.hardCapex)} />
            <LineRow label="Soft Costs" value={formatCurrency(sourcesAndUses.uses.softCosts)} />
            <LineRow label="Contingency" value={formatCurrency(sourcesAndUses.uses.contingency)} />
            <LineRow
              label={`Pre-Revenue OpEx (${current.construction.constructionDurationMonths} mo × ${formatCurrency(current.construction.constructionOpexPerMonth / 1000)}k)`}
              value={formatCurrency(sourcesAndUses.uses.preRevenueOpex)}
            />
            <LineRow
              label={`Debt Service Reserve (${current.construction.debtServiceReserveMonths} mo)`}
              value={formatCurrency(sourcesAndUses.uses.debtServiceReserve)}
            />
            <LineRow label="Working Capital Buffer" value={formatCurrency(sourcesAndUses.uses.workingCapitalBuffer)} />
            <LineRow label="Total Uses" value={formatCurrency(sourcesAndUses.uses.total)} strong divider />
            <LineRow
              label="Surplus / (Gap)"
              value={formatCurrency(sourcesAndUses.surplusOrGap)}
              strong
              tone={sourcesAndUses.surplusOrGap >= 0 ? 'success' : 'danger'}
            />
          </CardContent>
        </Card>
      </div>

      {/* Right panel */}
      <div className="grid gap-6 content-start">
        <Card className="bg-h2mb-gold-bg/40 border-h2mb-gold/40">
          <CardHeader>
            <CardTitle className="text-h2mb-gold">ITC Deep Dive</CardTitle>
          </CardHeader>
          <CardContent>
            <LineRow label="ITC Amount" value={formatCurrency(current.itc.amount)} />
            <LineRow label="Eligible CapEx (Hard + Soft)" value={formatCurrency(eligibleCapex)} />
            <LineRow label="ITC as % of Eligible CapEx" value={formatPercent(itcPctOfCapex, 1)} />
            <LineRow
              label="Application Method"
              value={
                current.itc.appliedTo === 'debt'
                  ? 'Debt Paydown'
                  : current.itc.appliedTo === 'reserve'
                    ? 'Reserve'
                    : 'OpEx'
              }
            />
            <LineRow label="Net Debt After ITC" value={formatCurrency(outputs.netDebtAfterITC)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>With ITC vs. Without ITC</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="text-muted-foreground font-medium">Metric</div>
              <div className="text-h2mb-gold text-right font-medium">With ITC</div>
              <div className="text-muted-foreground text-right font-medium">Without ITC</div>

              <ComparisonRow
                label="Total Interest Paid"
                withValue={formatCurrency(outputs.totalInterestPaid)}
                withoutValue={formatCurrency(outputs.totalInterestPaidNoITC)}
              />
              <ComparisonRow
                label="Debt Paid Off By"
                withValue={payoffWithITC ? periodLabel(payoffWithITC.year, payoffWithITC.quarter) : 'Beyond horizon'}
                withoutValue={payoffWithoutITC ? periodLabel(payoffWithoutITC.year, payoffWithoutITC.quarter) : 'Beyond horizon'}
              />
              <ComparisonRow
                label={`Total Net Cash (${current.modelSettings.totalYears}yr)`}
                withValue={formatCurrency(outputs.totalNetCashAllYears)}
                withoutValue={formatCurrency(noItcOutputs.totalNetCashAllYears)}
              />
              <ComparisonRow
                label="Equity IRR"
                withValue={outputs.equityIRR !== null ? formatPercent(outputs.equityIRR, 1) : 'N/A'}
                withoutValue={noItcIRR !== null ? formatPercent(noItcIRR, 1) : 'N/A'}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Interest Savings from ITC:{' '}
              <span className="text-h2mb-success">{formatCurrencyCompact(outputs.interestSavedFromITC)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={savingsChartData} layout="vertical" margin={{ left: 24, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={12} tickFormatter={(v) => formatCurrencyCompact(v)} />
                <YAxis type="category" dataKey="label" fontSize={12} width={90} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {savingsChartData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#A32D2D' : '#3B6D11'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LineRow({
  label,
  value,
  strong,
  divider,
  tone,
  className,
}: {
  label: string;
  value: string;
  strong?: boolean;
  divider?: boolean;
  tone?: 'success' | 'danger';
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 py-1.5 text-sm ${divider ? 'mt-1 border-t pt-2' : ''} ${className ?? ''}`}
    >
      <span className={strong ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
      <span
        className={`tabular-nums ${strong ? 'font-semibold' : 'font-medium'} ${
          tone === 'success' ? 'text-h2mb-success' : tone === 'danger' ? 'text-h2mb-danger' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ComparisonRow({
  label,
  withValue,
  withoutValue,
}: {
  label: string;
  withValue: string;
  withoutValue: string;
}) {
  return (
    <>
      <div className="border-t py-2">{label}</div>
      <div className="border-t py-2 text-right font-medium tabular-nums">{withValue}</div>
      <div className="text-muted-foreground border-t py-2 text-right tabular-nums">{withoutValue}</div>
    </>
  );
}
