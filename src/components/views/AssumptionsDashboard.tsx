import { useMemo } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useModelOutputs } from '@/store/useModelOutputs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { SliderInput } from '@/components/shared/SliderInput';
import { KPICard } from '@/components/shared/KPICard';
import { DSCRBadge } from '@/components/shared/Badge';
import {
  computeBreakEvenPricePerKg,
  computeDebtPayoffQuarter,
  computeMaxDailyCapacityKg,
  periodLabel,
} from '@/engine/calculations';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatPercent,
} from '@/engine/formatters';
import { useScenarioStore } from '@/store/scenarioStore';
import type { ITCApplication } from '@/engine/types';

export function AssumptionsDashboard() {
  const current = useScenarioStore((s) => s.current);
  const updateCapital = useScenarioStore((s) => s.updateCapital);
  const updateConstruction = useScenarioStore((s) => s.updateConstruction);
  const updateITC = useScenarioStore((s) => s.updateITC);
  const updatePlant = useScenarioStore((s) => s.updatePlant);
  const updateModelSettings = useScenarioStore((s) => s.updateModelSettings);

  const outputs = useModelOutputs();
  const { capital, construction, itc, plant, modelSettings } = current;

  const totalSources = outputs.sourcesAndUses.sources.total;
  const debtPct = totalSources > 0 ? capital.totalDebt / totalSources : 0;
  const equityCapital = capital.cashEquity + capital.founderSweatEquity + capital.landContribution;
  const equityPct = totalSources > 0 ? equityCapital / totalSources : 0;
  const annualInterestYr1 = capital.totalDebt * capital.interestRate;

  const totalCapex =
    outputs.sourcesAndUses.uses.hardCapex +
    outputs.sourcesAndUses.uses.softCosts +
    outputs.sourcesAndUses.uses.contingency +
    outputs.sourcesAndUses.uses.otherCapex;
  const preRevenueOpexTotal =
    construction.constructionOpexPerMonth * construction.constructionDurationMonths;
  const dsrAmount = outputs.sourcesAndUses.uses.debtServiceReserve;

  const payoffWithITC = useMemo(() => computeDebtPayoffQuarter(current), [current]);
  const payoffWithoutITC = useMemo(() => computeDebtPayoffQuarter(current, 0), [current]);

  const maxCapacityKg = computeMaxDailyCapacityKg(current);
  const breakEvenPrice = computeBreakEvenPricePerKg(outputs.periods);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
      {/* Left column: input cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Capital Structure</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SliderInput
              label="Cash Equity"
              value={capital.cashEquity}
              onChange={(v) => updateCapital({ cashEquity: v })}
              min={1_000_000}
              max={15_000_000}
              step={50_000}
              formatValue={(v) => formatCurrency(v)}
            />
            <SliderInput
              label="Founder / Sweat Equity"
              value={capital.founderSweatEquity}
              onChange={(v) => updateCapital({ founderSweatEquity: v })}
              min={0}
              max={2_000_000}
              step={25_000}
              formatValue={(v) => formatCurrency(v)}
            />
            <SliderInput
              label="Land Contribution"
              value={capital.landContribution}
              onChange={(v) => updateCapital({ landContribution: v })}
              min={0}
              max={2_000_000}
              step={25_000}
              formatValue={(v) => formatCurrency(v)}
            />
            <SliderInput
              label="Total Debt"
              value={capital.totalDebt}
              onChange={(v) => updateCapital({ totalDebt: v })}
              min={1_000_000}
              max={20_000_000}
              step={50_000}
              formatValue={(v) => formatCurrency(v)}
            />
            <SliderInput
              label="Interest Rate"
              value={capital.interestRate}
              onChange={(v) => updateCapital({ interestRate: v })}
              min={0.02}
              max={0.15}
              step={0.0025}
              formatValue={(v) => formatPercent(v, 2)}
            />
            <SliderInput
              label="Loan Tenor (years)"
              value={capital.loanTenor}
              onChange={(v) => updateCapital({ loanTenor: v })}
              min={3}
              max={25}
              step={1}
              suffix=" yrs"
            />
            <SliderInput
              label="Grace Period (years)"
              value={capital.gracePeriod}
              onChange={(v) => updateCapital({ gracePeriod: v })}
              min={0}
              max={5}
              step={1}
              suffix=" yrs"
            />

            <div className="bg-muted/50 grid grid-cols-1 gap-y-1.5 rounded-lg p-3 text-sm">
              <StatRow label="Total Sources" value={formatCurrency(totalSources)} />
              <StatRow
                label="Debt / Equity Split"
                value={`${formatPercent(debtPct, 0)} / ${formatPercent(equityPct, 0)}`}
              />
              <StatRow label="Annual Interest (Yr 1)" value={formatCurrency(annualInterestYr1)} />
              <StatRow label="Equity % of Total Cap" value={formatPercent(equityPct, 1)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Construction Costs</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="bg-muted/50 grid grid-cols-1 gap-y-1.5 rounded-lg p-3 text-sm">
              <StatRow label="Hard CapEx" value={formatCurrency(outputs.sourcesAndUses.uses.hardCapex)} />
              <StatRow label="Soft Costs" value={formatCurrency(outputs.sourcesAndUses.uses.softCosts)} />
              <StatRow label="Contingency" value={formatCurrency(outputs.sourcesAndUses.uses.contingency)} />
              {outputs.sourcesAndUses.uses.otherCapex > 0 && (
                <StatRow label="Other Capital Costs" value={formatCurrency(outputs.sourcesAndUses.uses.otherCapex)} />
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Detailed CapEx line items (with per-year construction spend) are entered under{' '}
              <span className="font-medium">Expense Items → Construction / CapEx</span>.
            </p>
            <SliderInput
              label="Construction OpEx / Month"
              value={construction.constructionOpexPerMonth}
              onChange={(v) => updateConstruction({ constructionOpexPerMonth: v })}
              min={0}
              max={100_000}
              step={1_000}
              formatValue={(v) => formatCurrency(v)}
            />
            <SliderInput
              label="Construction Duration"
              value={construction.constructionDurationMonths}
              onChange={(v) => updateConstruction({ constructionDurationMonths: v })}
              min={6}
              max={36}
              step={1}
              suffix=" mo"
              helperText="Drives which leading quarters/years have zero revenue"
            />
            <SliderInput
              label="Debt Service Reserve"
              value={construction.debtServiceReserveMonths}
              onChange={(v) => updateConstruction({ debtServiceReserveMonths: v })}
              min={0}
              max={12}
              step={1}
              suffix=" mo"
            />
            <SliderInput
              label="Working Capital Buffer"
              value={construction.workingCapitalBuffer}
              onChange={(v) => updateConstruction({ workingCapitalBuffer: v })}
              min={0}
              max={1_000_000}
              step={10_000}
              formatValue={(v) => formatCurrency(v)}
            />

            <div className="bg-muted/50 grid grid-cols-1 gap-y-1.5 rounded-lg p-3 text-sm">
              <StatRow label="Total CapEx" value={formatCurrency(totalCapex)} />
              <StatRow label="Pre-Revenue OpEx Total" value={formatCurrency(preRevenueOpexTotal)} />
              <StatRow label="DSR Amount Locked Up" value={formatCurrency(dsrAmount)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-h2mb-gold/40 bg-h2mb-gold-bg/40">
          <CardHeader>
            <CardTitle className="text-h2mb-gold">ITC Settings</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SliderInput
              label="ITC Amount"
              value={itc.amount}
              onChange={(v) => updateITC({ amount: v })}
              min={1_000_000}
              max={6_000_000}
              step={100_000}
              formatValue={(v) => formatCurrency(v)}
              accent="gold"
            />
            <SliderInput
              label="Received in Year"
              value={itc.receivedInYear}
              onChange={(v) => updateITC({ receivedInYear: v })}
              min={1}
              max={modelSettings.totalYears}
              step={1}
              accent="gold"
            />
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground">Applied To</Label>
              <Select
                value={itc.appliedTo}
                onValueChange={(v) => updateITC({ appliedTo: v as ITCApplication })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debt">Debt Paydown</SelectItem>
                  <SelectItem value="reserve">Reserve</SelectItem>
                  <SelectItem value="opex">OpEx</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-1.5 rounded-lg bg-white/60 p-3 text-sm dark:bg-black/20">
              <StatRow
                label="Interest Saved"
                value={formatCurrency(outputs.interestSavedFromITC)}
              />
              <StatRow
                label="Debt Payoff (with ITC)"
                value={payoffWithITC ? periodLabel(payoffWithITC.year, payoffWithITC.quarter) : 'Beyond horizon'}
              />
              <StatRow
                label="Debt Payoff (without ITC)"
                value={payoffWithoutITC ? periodLabel(payoffWithoutITC.year, payoffWithoutITC.quarter) : 'Beyond horizon'}
              />
              <StatRow
                label="Net Effective Debt After ITC"
                value={formatCurrency(outputs.netDebtAfterITC)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model Settings</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SliderInput
              label="Model Horizon"
              value={modelSettings.totalYears}
              onChange={(v) => updateModelSettings({ totalYears: v })}
              min={5}
              max={25}
              step={1}
              suffix=" yrs"
            />
            <SliderInput
              label="Quarterly Detail Years"
              value={modelSettings.quarterlyYears}
              onChange={(v) =>
                updateModelSettings({
                  quarterlyYears: Math.min(v, modelSettings.totalYears),
                })
              }
              min={2}
              max={modelSettings.totalYears}
              step={1}
              suffix=" yrs"
              helperText="Years 1..N are modeled quarterly; the rest are annual"
            />
            <SliderInput
              label="Max Daily Capacity"
              value={plant.maxDailyCapacityKg}
              onChange={(v) => updatePlant({ maxDailyCapacityKg: v })}
              min={100}
              max={5_000}
              step={50}
              suffix=" kg/day"
              helperText="Shared plant nameplate capacity across all revenue streams"
            />

            <div className="bg-muted/50 grid grid-cols-1 gap-y-1.5 rounded-lg p-3 text-sm">
              <StatRow label="Max Daily Capacity" value={`${formatCurrencyForKg(maxCapacityKg)} kg`} />
              <StatRow label="Break-even $/kg (avg. volume)" value={formatCurrency(breakEvenPrice, 2)} />
              <StatRow label="Revenue Streams" value={String(current.revenueStreams.length)} />
              <StatRow label="Expense Line Items" value={String(current.expenseLineItems.length)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right column: live KPIs */}
      <div className="grid grid-cols-1 gap-6 content-start">
        <div className="grid grid-cols-2 gap-3">
          <KPICard
            label={`Total ${modelSettings.totalYears}-yr Revenue`}
            value={formatCurrencyCompact(outputs.totalRevenueAllYears)}
          />
          <KPICard
            label={`Net Cash (${modelSettings.totalYears} yr)`}
            value={formatCurrencyCompact(outputs.totalNetCashAllYears)}
          />
          <KPICard
            label="Equity IRR"
            value={outputs.equityIRR !== null ? formatPercent(outputs.equityIRR, 1) : 'N/A'}
            tone={
              outputs.equityIRR !== null && outputs.equityIRR < 0.08
                ? 'danger'
                : outputs.equityIRR !== null && outputs.equityIRR < 0.15
                  ? 'warning'
                  : 'success'
            }
          />
          <Card className="gap-2 py-4">
            <CardContent className="flex flex-col gap-1 px-4">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Min DSCR
              </p>
              <DSCRBadge value={outputs.minDSCR} />
              {outputs.minDSCRYear && (
                <p className="text-muted-foreground text-xs">Year {outputs.minDSCRYear}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card
          className={
            outputs.sourcesAndUses.isFullyFunded
              ? 'bg-h2mb-success-bg border-h2mb-success/30'
              : 'bg-h2mb-danger-bg border-h2mb-danger/30'
          }
        >
          <CardContent className="flex items-center gap-3 px-4">
            {outputs.sourcesAndUses.isFullyFunded ? (
              <CheckCircle2 className="text-h2mb-success size-8 shrink-0" />
            ) : (
              <XCircle className="text-h2mb-danger size-8 shrink-0" />
            )}
            <div>
              <p
                className={
                  outputs.sourcesAndUses.isFullyFunded
                    ? 'text-h2mb-success font-semibold'
                    : 'text-h2mb-danger font-semibold'
                }
              >
                {outputs.sourcesAndUses.isFullyFunded ? 'Fully Funded' : 'Funding Gap'}
              </p>
              <p className="text-muted-foreground text-sm">
                {formatCurrency(Math.abs(outputs.sourcesAndUses.surplusOrGap))}{' '}
                {outputs.sourcesAndUses.isFullyFunded ? 'surplus' : 'gap'} at financial close
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sources &amp; Uses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                  Sources
                </p>
                <div className="grid gap-1">
                  <StatRow label="Cash Equity" value={formatCurrency(outputs.sourcesAndUses.sources.cashEquity)} />
                  <StatRow label="Sweat Equity" value={formatCurrency(outputs.sourcesAndUses.sources.founderSweatEquity)} />
                  <StatRow label="Land" value={formatCurrency(outputs.sourcesAndUses.sources.landContribution)} />
                  <StatRow label="Debt" value={formatCurrency(outputs.sourcesAndUses.sources.debt)} />
                  <StatRow label="⚡ ITC" value={formatCurrency(outputs.sourcesAndUses.sources.itc)} />
                </div>
              </div>
              <div>
                <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                  Uses
                </p>
                <div className="grid gap-1">
                  <StatRow label="Hard CapEx" value={formatCurrency(outputs.sourcesAndUses.uses.hardCapex)} />
                  <StatRow label="Soft Costs" value={formatCurrency(outputs.sourcesAndUses.uses.softCosts)} />
                  <StatRow label="Contingency" value={formatCurrency(outputs.sourcesAndUses.uses.contingency)} />
                  {outputs.sourcesAndUses.uses.otherCapex > 0 && (
                    <StatRow label="Other CapEx" value={formatCurrency(outputs.sourcesAndUses.uses.otherCapex)} />
                  )}
                  <StatRow label="Pre-Rev OpEx" value={formatCurrency(outputs.sourcesAndUses.uses.preRevenueOpex)} />
                  <StatRow label="DSR" value={formatCurrency(outputs.sourcesAndUses.uses.debtServiceReserve)} />
                  <StatRow label="Working Capital" value={formatCurrency(outputs.sourcesAndUses.uses.workingCapitalBuffer)} />
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm font-semibold">
              <span>Surplus / (Gap)</span>
              <span
                className={
                  outputs.sourcesAndUses.surplusOrGap >= 0
                    ? 'text-h2mb-success'
                    : 'text-h2mb-danger'
                }
              >
                {formatCurrency(outputs.sourcesAndUses.surplusOrGap)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function formatCurrencyForKg(value: number): string {
  return value.toLocaleString('en-CA');
}
