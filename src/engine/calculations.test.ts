import { describe, expect, it } from 'vitest';
import {
  buildEquityCashFlows,
  buildPeriods,
  calculateDSRAmount,
  computeAnnualSummary,
  computeBreakEvenPricePerKg,
  computeCapexByCategory,
  computeDebtPayoffQuarter,
  computeEquityIRRFromScenario,
  computeEquityPaybackYear,
  computeITCAmount,
  computeITCEligibleBase,
  computeMaxDailyCapacityKg,
  computeMinDSCR,
  computeModelPeriods,
  computePayrollFromRoles,
  computeRevenueByYear,
  computeRoleAnnualCost,
  computeRoleAnnualSalary,
  computeSourcesAndUses,
  computeTotalCapex,
  findITCPeriodIndex,
  firstOperatingYear,
  generatePeriods,
  markConstructionPeriods,
  periodLabel,
  resolveLineItemAnnualAmount,
  runModel,
  solveIRR,
  streamPeriodDailyKg,
  sum,
  validateScenario,
} from './calculations';
import { createDefaultScenario } from './defaults';
import type { EmployeeRole, ExpenseLineItem, RevenueStream, Scenario } from './types';

describe('period timeline', () => {
  it('generates 4 quarters/year for quarterlyYears, then 1 annual period/year through totalYears', () => {
    const periods = generatePeriods({ totalYears: 15, quarterlyYears: 5 });
    expect(periods).toHaveLength(5 * 4 + (15 - 5));
    expect(periods.filter((p) => p.quarter !== null)).toHaveLength(20);
    expect(periods.filter((p) => p.quarter === null)).toHaveLength(10);
    expect(periods[0]).toMatchObject({ year: 1, quarter: 1, periodsPerYear: 4, periodFraction: 0.25 });
    expect(periods[19]).toMatchObject({ year: 5, quarter: 4 });
    expect(periods[20]).toMatchObject({ year: 6, quarter: null, periodsPerYear: 1, periodFraction: 1 });
    expect(periods[periods.length - 1]).toMatchObject({ year: 15, quarter: null });
  });

  it('labels quarterly and annual periods correctly', () => {
    expect(periodLabel(2, 3)).toBe('Y2Q3');
    expect(periodLabel(8, null)).toBe('Y8');
  });

  it('marks the leading 5 quarter-equivalents as construction for a 15-month build (default)', () => {
    const periods = markConstructionPeriods(
      generatePeriods({ totalYears: 15, quarterlyYears: 5 }),
      15,
    );
    const construction = periods.filter((p) => p.isConstruction);
    expect(construction).toHaveLength(5);
    expect(construction.map((p) => p.label)).toEqual(['Y1Q1', 'Y1Q2', 'Y1Q3', 'Y1Q4', 'Y2Q1']);
  });

  it('correctly marks construction periods that spill into the annual range', () => {
    // 9 quarter-equivalents of construction with only 1 quarterly year means
    // Year 1 (4 quarterly periods, 1 q-equiv each) covers 4, Year 2 (one
    // annual period, 4 q-equiv) starts construction at elapsed=4 (<9) so
    // it's marked construction too, reaching elapsed=8; Year 3's annual
    // period starts at elapsed=8 (<9) so it's ALSO marked construction
    // (whole periods, not fractional) before elapsed reaches 12.
    const periods = markConstructionPeriods(
      generatePeriods({ totalYears: 5, quarterlyYears: 1 }),
      27,
    );
    const constructionYears = [...new Set(periods.filter((p) => p.isConstruction).map((p) => p.year))];
    expect(constructionYears).toEqual([1, 2, 3]);
    expect(periods.find((p) => p.year === 4)!.isConstruction).toBe(false);
  });

  it('computes firstOperatingYear as the year of the first non-construction period', () => {
    const scenario = createDefaultScenario();
    const periods = buildPeriods(scenario);
    expect(firstOperatingYear(periods)).toBe(2);
  });
});

describe('findITCPeriodIndex', () => {
  it('lands on the first non-construction period of the target year when one exists', () => {
    const periods = buildPeriods(createDefaultScenario());
    const idx = findITCPeriodIndex(periods, 2, null);
    expect(periods[idx].label).toBe('Y2Q2');
  });

  it('falls back to the last period of a fully-construction year', () => {
    const periods = buildPeriods(createDefaultScenario());
    const idx = findITCPeriodIndex(periods, 1, null);
    expect(periods[idx].label).toBe('Y1Q4');
  });

  it('resolves an annual period directly when the target year is beyond quarterlyYears', () => {
    const periods = buildPeriods(createDefaultScenario());
    const idx = findITCPeriodIndex(periods, 8, null);
    expect(periods[idx].label).toBe('Y8');
  });

  it('targets an exact quarter when receivedInQuarter is set', () => {
    const periods = buildPeriods(createDefaultScenario());
    const idx = findITCPeriodIndex(periods, 3, 1);
    expect(periods[idx].label).toBe('Y3Q1');
  });

  it('falls back to year-only matching when the targeted quarter has no period (annual year)', () => {
    const periods = buildPeriods(createDefaultScenario());
    const idx = findITCPeriodIndex(periods, 8, 3);
    expect(periods[idx].label).toBe('Y8');
  });
});

describe('streamPeriodDailyKg', () => {
  const baseStream: RevenueStream = {
    id: 's1',
    name: 'Test Stream',
    offtakeMode: 'trucks',
    kgPerTruckFill: 80,
    h2ProductionCostPerKg: 2.41,
    startYear: 2,
    periods: [],
  };

  it('derives daily kg from trucks x kgPerTruckFill in trucks mode', () => {
    const input = { year: 2, quarter: 2, trucksPerDay: 10, dailyQuantityKg: 999, operatingDays: 90, pricePerKg: 12 };
    expect(streamPeriodDailyKg(baseStream, input)).toBe(800);
  });

  it('uses dailyQuantityKg directly (ignoring trucksPerDay) in direct mode', () => {
    const directStream: RevenueStream = { ...baseStream, offtakeMode: 'direct' };
    const input = { year: 2, quarter: 2, trucksPerDay: 999, dailyQuantityKg: 300, operatingDays: 90, pricePerKg: 14 };
    expect(streamPeriodDailyKg(directStream, input)).toBe(300);
  });
});

describe('resolveLineItemAnnualAmount', () => {
  const base: ExpenseLineItem = {
    id: 'e1',
    name: 'Test Expense',
    category: 'ga',
    startYear: 2,
    baseAnnualAmount: 100_000,
    escalation: { type: 'flat' },
    yearOverrides: {},
  };

  it('returns 0 before the item starts', () => {
    expect(resolveLineItemAnnualAmount(base, 1, 0)).toBe(0);
  });

  it('flat: returns the same amount every year', () => {
    expect(resolveLineItemAnnualAmount(base, 2, 0)).toBe(100_000);
    expect(resolveLineItemAnnualAmount(base, 10, 0)).toBe(100_000);
  });

  it('percentGrowth: compounds annually from startYear', () => {
    const item: ExpenseLineItem = { ...base, escalation: { type: 'percentGrowth', growthRate: 0.1 } };
    expect(resolveLineItemAnnualAmount(item, 2, 0)).toBeCloseTo(100_000, 6);
    expect(resolveLineItemAnnualAmount(item, 3, 0)).toBeCloseTo(110_000, 6);
    expect(resolveLineItemAnnualAmount(item, 5, 0)).toBeCloseTo(100_000 * Math.pow(1.1, 3), 6);
  });

  it('percentOfRevenue: scales with the year\'s total revenue', () => {
    const item: ExpenseLineItem = { ...base, baseAnnualAmount: 0, escalation: { type: 'percentOfRevenue', percentOfRevenue: 0.05 } };
    expect(resolveLineItemAnnualAmount(item, 3, 2_000_000)).toBeCloseTo(100_000, 6);
  });

  it('manual: returns 0 unless a yearOverride is present', () => {
    const item: ExpenseLineItem = { ...base, escalation: { type: 'manual' }, yearOverrides: { 8: 250_000 } };
    expect(resolveLineItemAnnualAmount(item, 5, 0)).toBe(0);
    expect(resolveLineItemAnnualAmount(item, 8, 0)).toBe(250_000);
  });

  it('yearOverrides take precedence over any escalation type', () => {
    const item: ExpenseLineItem = { ...base, escalation: { type: 'percentGrowth', growthRate: 0.5 }, yearOverrides: { 3: 999 } };
    expect(resolveLineItemAnnualAmount(item, 3, 0)).toBe(999);
  });
});

describe('computeModelPeriods', () => {
  const scenario = createDefaultScenario();
  const periods = computeModelPeriods(scenario);

  it('produces one PeriodResult per timeline period (30 for the 15yr/5yr-quarterly default)', () => {
    expect(periods).toHaveLength(30);
  });

  it('has zero revenue/cogs in every construction period, with construction opex tracked as preRevenueOpex (separate from expense line items)', () => {
    for (const p of periods.filter((p) => p.isConstruction)) {
      expect(p.revenue).toBe(0);
      expect(p.cogs).toBe(0);
      expect(p.preRevenueOpex).toBeCloseTo(scenario.construction.constructionOpexPerMonth * 3, 6);
    }
  });

  it('does not apply an expense line item before its startYear, even during construction', () => {
    for (const p of periods.filter((p) => p.isConstruction && p.year === 1)) {
      expect(p.totalOperatingExpenses).toBe(0);
      expect(Object.keys(p.expensesByCategory)).toHaveLength(0);
      expect(p.ebitda).toBeCloseTo(-p.preRevenueOpex, 6);
    }
  });

  it('applies expense line items starting from their startYear even inside a construction period (Y2Q1)', () => {
    const y2q1 = periods.find((p) => p.label === 'Y2Q1')!;
    expect(y2q1.isConstruction).toBe(true);
    const revenueByYear = computeRevenueByYear(scenario);
    const expectedAnnual = sum(
      scenario.expenseLineItems.map((item) =>
        resolveLineItemAnnualAmount(item, 2, revenueByYear.get(2) ?? 0),
      ),
    );
    expect(y2q1.totalOperatingExpenses).toBeCloseTo(expectedAnnual * 0.25, 6);
    expect(y2q1.ebitda).toBeCloseTo(-y2q1.preRevenueOpex - y2q1.totalOperatingExpenses, 6);
  });

  it('computes revenue/COGS for a quarterly revenue period from its single stream', () => {
    const stream = scenario.revenueStreams[0];
    const input = stream.periods[0]; // Y2Q2
    const p = periods.find((p) => p.label === 'Y2Q2')!;
    const dailyKg = input.trucksPerDay * stream.kgPerTruckFill;
    expect(p.revenue).toBeCloseTo(dailyKg * input.pricePerKg * input.operatingDays, 6);
    expect(p.cogs).toBeCloseTo(stream.h2ProductionCostPerKg * dailyKg * input.operatingDays, 6);
    expect(p.grossProfit).toBeCloseTo(p.revenue - p.cogs, 6);
  });

  it('computes revenue for an annual (Year 6+) period using the full-year operatingDays', () => {
    const stream = scenario.revenueStreams[0];
    const input = stream.periods.find((p) => p.year === 8)!;
    const p = periods.find((p) => p.label === 'Y8')!;
    const dailyKg = input.trucksPerDay * stream.kgPerTruckFill;
    expect(p.revenue).toBeCloseTo(dailyKg * input.pricePerKg * input.operatingDays, 6);
    expect(p.periodFraction).toBe(1);
  });

  it('splits each expense line item\'s annual amount evenly across quarters, and applies it whole in annual periods', () => {
    const payroll = scenario.expenseLineItems.find((i) => i.name === 'Payroll & Benefits')!;
    const y3Quarters = periods.filter((p) => p.year === 3);
    const y3PayrollPerQuarter = y3Quarters.map((p) => p.expensesByCategory.payroll ?? 0);
    const annualAmount = payroll.baseAnnualAmount * Math.pow(1 + (payroll.escalation.growthRate ?? 0), 3 - payroll.startYear);
    for (const q of y3PayrollPerQuarter) {
      expect(q).toBeCloseTo(annualAmount / 4, 6);
    }
    const y8 = periods.find((p) => p.label === 'Y8')!;
    const y8AnnualAmount = payroll.baseAnnualAmount * Math.pow(1 + (payroll.escalation.growthRate ?? 0), 8 - payroll.startYear);
    expect(y8.expensesByCategory.payroll).toBeCloseTo(y8AnnualAmount, 6);
  });

  it('folds cogs-category line items into cogs/gross profit rather than operating expenses', () => {
    const scenarioWithCogsItem: Scenario = {
      ...scenario,
      expenseLineItems: [
        ...scenario.expenseLineItems,
        {
          id: 'extra-cogs',
          name: 'Extra COGS Item',
          category: 'cogs',
          startYear: 2,
          baseAnnualAmount: 40_000,
          escalation: { type: 'flat' },
          yearOverrides: {},
        },
      ],
    };
    const withExtra = computeModelPeriods(scenarioWithCogsItem);
    const without = computeModelPeriods(scenario);
    const y3WithExtra = withExtra.find((p) => p.label === 'Y3Q1')!;
    const y3Without = without.find((p) => p.label === 'Y3Q1')!;
    expect(y3WithExtra.cogs - y3Without.cogs).toBeCloseTo(10_000, 6); // 40k/4
    expect(y3WithExtra.totalOperatingExpenses).toBeCloseTo(y3Without.totalOperatingExpenses, 6);
  });

  it('opens the debt schedule at totalDebt and accrues interest at balance x rate x periodFraction', () => {
    expect(periods[0].openingDebtBalance).toBe(scenario.capital.totalDebt);
    for (const p of periods) {
      expect(p.interest).toBeCloseTo(p.openingDebtBalance * scenario.capital.interestRate * p.periodFraction, 6);
    }
  });

  it('charges principal only once year >= gracePeriod + 2, capped at the scheduled amount (and at the remaining balance)', () => {
    const threshold = scenario.capital.gracePeriod + 2;
    const amortYears = scenario.capital.loanTenor - scenario.capital.gracePeriod;
    const annualScheduled = scenario.capital.totalDebt / amortYears;
    for (const p of periods) {
      if (p.year < threshold) {
        expect(p.principal).toBe(0);
      } else {
        const scheduled = annualScheduled * p.periodFraction;
        // The final payment before full payoff is capped at the remaining
        // opening balance, so it can be less than the scheduled amount.
        expect(p.principal).toBeLessThanOrEqual(scheduled + 1e-6);
        expect(p.principal).toBeLessThanOrEqual(p.openingDebtBalance + 1e-6);
        if (p.openingDebtBalance >= scheduled) {
          expect(p.principal).toBeCloseTo(scheduled, 6);
        }
      }
    }
  });

  it('receives the ITC exactly once, in the designated period, and reduces the debt balance when applied to debt', () => {
    const itcPeriods = periods.filter((p) => p.itcReceived > 0);
    expect(itcPeriods).toHaveLength(1);
    expect(itcPeriods[0].itcReceived).toBe(scenario.itc.amount);
    expect(itcPeriods[0].year).toBe(scenario.itc.receivedInYear);
    expect(itcPeriods[0].isITCPeriod).toBe(true);

    const idx = periods.indexOf(itcPeriods[0]);
    expect(periods[idx + 1].openingDebtBalance).toBeCloseTo(itcPeriods[0].closingDebtBalance, 6);
    expect(itcPeriods[0].closingDebtBalance).toBeCloseTo(
      itcPeriods[0].openingDebtBalance - itcPeriods[0].principal - scenario.itc.amount,
      6,
    );
  });

  it('never lets the debt balance go negative, and DSCR is null once debt service reaches zero', () => {
    for (const p of periods) {
      expect(p.closingDebtBalance).toBeGreaterThanOrEqual(0);
      const debtService = p.interest + p.principal;
      if (debtService === 0) {
        expect(p.dscr).toBeNull();
      } else {
        expect(p.dscr).toBeCloseTo(p.ebitda / debtService, 6);
      }
    }
  });

  it('accumulates cumulativeCF as a running sum of netCash', () => {
    let running = 0;
    for (const p of periods) {
      running += p.netCash;
      expect(p.cumulativeCF).toBeCloseTo(running, 6);
    }
  });
});

describe('multi-stream revenue', () => {
  it('sums revenue/COGS across concurrent streams, respecting each stream\'s own startYear', () => {
    const scenario = createDefaultScenario();
    const secondStream: RevenueStream = {
      id: 'stream-2',
      name: 'Datacentre Direct Supply',
      offtakeMode: 'direct',
      kgPerTruckFill: 80,
      h2ProductionCostPerKg: 1.9,
      startYear: 4, // starts later than the primary stream
      periods: buildPeriods(scenario)
        .filter((p) => !p.isConstruction)
        .map((p) => ({
          year: p.year,
          quarter: p.quarter,
          trucksPerDay: 0,
          dailyQuantityKg: 200,
          operatingDays: p.quarter === null ? 360 : 90,
          pricePerKg: 15,
        })),
    };
    scenario.revenueStreams.push(secondStream);

    const periods = computeModelPeriods(scenario);
    const y3 = periods.find((p) => p.label === 'Y3Q1')!;
    const y4 = periods.find((p) => p.label === 'Y4Q1')!;

    // Year 3: second stream hasn't started yet (startYear 4) -> only 1 stream contributes.
    expect(y3.streamBreakdown.find((s) => s.streamId === 'stream-2')?.revenue).toBe(0);

    // Year 4: both streams contribute, and total revenue/cogs is their sum.
    const primary = y4.streamBreakdown.find((s) => s.streamId !== 'stream-2')!;
    const secondary = y4.streamBreakdown.find((s) => s.streamId === 'stream-2')!;
    expect(secondary.revenue).toBeCloseTo(200 * 15 * 90, 6);
    expect(y4.revenue).toBeCloseTo(primary.revenue + secondary.revenue, 6);
    expect(y4.cogs).toBeCloseTo(primary.cogs + secondary.cogs, 6);
  });
});

describe('computeAnnualSummary', () => {
  const scenario = createDefaultScenario();
  const periods = computeModelPeriods(scenario);
  const annual = computeAnnualSummary(scenario, periods);

  it('produces one row per year across the full model horizon', () => {
    expect(annual).toHaveLength(15);
    expect(annual.map((a) => a.year)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it('flags Year 1 as fully construction and Year 2 as partial revenue', () => {
    expect(annual[0].isConstruction).toBe(true);
    expect(annual[0].revenue).toBe(0);
    expect(annual[1].isConstruction).toBe(false);
    expect(annual[1].isPartialRevenue).toBe(true);
    expect(annual[1].revenue).toBeGreaterThan(0);
  });

  it('flags Years 6-15 (single annual periods) as neither construction nor partial', () => {
    for (const a of annual.slice(5)) {
      expect(a.isConstruction).toBe(false);
      expect(a.isPartialRevenue).toBe(false);
    }
  });

  it('aggregates each year as the sum of its periods', () => {
    for (const a of annual) {
      const yearPeriods = periods.filter((p) => p.year === a.year);
      expect(a.revenue).toBeCloseTo(sum(yearPeriods.map((p) => p.revenue)), 6);
      expect(a.ebitda).toBeCloseTo(sum(yearPeriods.map((p) => p.ebitda)), 6);
      expect(a.interest).toBeCloseTo(sum(yearPeriods.map((p) => p.interest)), 6);
    }
  });

  it('rolls up expensesByCategory across the year, matching totalOperatingExpenses', () => {
    for (const a of annual.slice(1)) {
      const categorySum = sum(Object.values(a.expensesByCategory).map((v) => v ?? 0));
      expect(categorySum).toBeCloseTo(a.totalOperatingExpenses, 6);
    }
  });

  it('computes straight-line D&A over 20 years with 5% salvage, starting the first operating year', () => {
    const totalCapex = computeTotalCapex(scenario);
    const expectedAnnualDNA = (totalCapex * 0.95) / 20;
    expect(annual[0].depreciation).toBe(0);
    for (const a of annual.slice(1)) {
      expect(a.depreciation).toBeCloseTo(expectedAnnualDNA, 6);
      expect(a.ebit).toBeCloseTo(a.ebitda - a.depreciation, 6);
    }
  });
});

describe('IRR solver', () => {
  it('solves a simple known cash flow to the expected IRR', () => {
    const irr = solveIRR([-100, 110]);
    expect(irr).not.toBeNull();
    expect(irr!).toBeCloseTo(0.1, 4);
  });

  it('returns null for all-positive or all-negative cash flows', () => {
    expect(solveIRR([100, 200, 300])).toBeNull();
    expect(solveIRR([-100, -200])).toBeNull();
  });
});

describe('equity IRR, payback, and min DSCR (generalized to N years)', () => {
  const scenario = createDefaultScenario();
  const periods = computeModelPeriods(scenario);
  const annual = computeAnnualSummary(scenario, periods);

  it('builds a 15-element equity cash flow stream: [-cashEquity, yr2..yr15 net cash]', () => {
    const flows = buildEquityCashFlows(scenario, annual);
    expect(flows).toHaveLength(15);
    expect(flows[0]).toBe(-scenario.capital.cashEquity);
    expect(flows[1]).toBeCloseTo(annual[1].netCash, 6);
    expect(flows[14]).toBeCloseTo(annual[14].netCash, 6);
  });

  it('computes a positive equity IRR for the default scenario', () => {
    const irr = computeEquityIRRFromScenario(scenario, annual);
    expect(irr).not.toBeNull();
    expect(irr!).toBeGreaterThan(0.15);
    expect(irr!).toBeLessThan(1);
  });

  it('computes an equity payback year within the model horizon', () => {
    const paybackYear = computeEquityPaybackYear(scenario, annual);
    expect(paybackYear).not.toBeNull();
    expect(paybackYear).toBeGreaterThanOrEqual(2);
    expect(paybackYear).toBeLessThanOrEqual(15);
  });

  it('finds the minimum DSCR across non-construction years only, landing in Year 3', () => {
    const { minDSCR, minDSCRYear } = computeMinDSCR(annual);
    expect(minDSCR).not.toBeNull();
    expect(minDSCRYear).toBe(3);
    expect(minDSCR!).toBeGreaterThan(1.0);
  });
});

describe('Sources & Uses', () => {
  it('sums sources and uses correctly and is fully funded at default inputs', () => {
    const scenario = createDefaultScenario();
    const su = computeSourcesAndUses(scenario);
    expect(su.sources.total).toBeCloseTo(
      scenario.capital.cashEquity +
        scenario.capital.founderSweatEquity +
        scenario.capital.landContribution +
        scenario.capital.totalDebt +
        scenario.itc.amount,
      6,
    );
    expect(su.uses.total).toBeCloseTo(
      computeTotalCapex(scenario) +
        scenario.construction.constructionOpexPerMonth * scenario.construction.constructionDurationMonths +
        calculateDSRAmount(scenario) +
        scenario.construction.workingCapitalBuffer,
      6,
    );
    expect(su.isFullyFunded).toBe(true);
  });

  it('flags a funding gap when uses exceed sources', () => {
    const scenario = createDefaultScenario();
    scenario.capexLineItems[0].yearOverrides[1] = 50_000_000;
    const su = computeSourcesAndUses(scenario);
    expect(su.surplusOrGap).toBeLessThan(0);
    expect(su.isFullyFunded).toBe(false);
  });

  it('computes cleanly with the ITC zeroed out (modeling "no ITC")', () => {
    const scenario = createDefaultScenario();
    scenario.itc.amount = 0;
    const outputs = runModel(scenario);
    expect(outputs.periods.every((p) => p.itcReceived === 0)).toBe(true);
    expect(outputs.sourcesAndUses.sources.itc).toBe(0);
    expect(outputs.equityIRR).not.toBeNull();
  });
});

describe('CapEx line items (phased construction spending)', () => {
  it('sums the default CapEx line items to $11.75M across categories', () => {
    const scenario = createDefaultScenario();
    const byCategory = computeCapexByCategory(scenario);
    expect(byCategory.hardCapex).toBeCloseTo(10_000_000, 6);
    expect(byCategory.softCosts).toBeCloseTo(1_000_000, 6);
    expect(byCategory.contingency).toBeCloseTo(750_000, 6);
    expect(computeTotalCapex(scenario)).toBeCloseTo(11_750_000, 6);
  });

  it('spreads a CapEx item across the years given in yearOverrides, prorated by period within each year', () => {
    const scenario = createDefaultScenario();
    const periods = computeModelPeriods(scenario);
    const year1Periods = periods.filter((p) => p.year === 1);
    const year2Periods = periods.filter((p) => p.year === 2);

    // Default hard CapEx item: $8.5M in Year 1, $1.5M in Year 2, each spread
    // evenly across that year's 4 quarters.
    const year1CapexSpend = sum(year1Periods.map((p) => p.capexSpend));
    const year2CapexSpend = sum(year2Periods.map((p) => p.capexSpend));
    expect(year1CapexSpend).toBeCloseTo(8_500_000 + 1_000_000 + 750_000, 6);
    expect(year2CapexSpend).toBeCloseTo(1_500_000, 6);
  });

  it('does not affect EBITDA — CapEx is capitalized, not expensed', () => {
    const withCapex = createDefaultScenario();
    const withoutCapex = { ...withCapex, capexLineItems: [] };
    const periodsWith = computeModelPeriods(withCapex);
    const periodsWithout = computeModelPeriods(withoutCapex);
    for (let i = 0; i < periodsWith.length; i++) {
      expect(periodsWith[i].ebitda).toBeCloseTo(periodsWithout[i].ebitda, 6);
      expect(periodsWith[i].netCash).toBeCloseTo(periodsWithout[i].netCash, 6);
    }
  });

  it('accumulates cumulativeCapexSpend up to the total once all CapEx years have passed', () => {
    const scenario = createDefaultScenario();
    const periods = computeModelPeriods(scenario);
    const annual = computeAnnualSummary(scenario, periods);
    const totalCapex = computeTotalCapex(scenario);
    for (const a of annual) {
      expect(a.cumulativeCapexSpend).toBeLessThanOrEqual(totalCapex + 1e-6);
    }
    expect(annual[annual.length - 1].cumulativeCapexSpend).toBeCloseTo(totalCapex, 6);
  });
});

describe('Employee Roles (headcount-based payroll)', () => {
  const role: EmployeeRole = {
    id: 'r1',
    title: 'Plant Manager',
    baseSalaryYear: 2,
    baseAnnualSalary: 100_000,
    salaryEscalation: { type: 'flat' },
    salaryYearOverrides: {},
    benefitsPct: 0.2,
    headcountByYear: { 2: 1, 3: 2 },
  };

  it('computes a role\'s fully-loaded annual cost as headcount × salary × (1 + benefits%)', () => {
    expect(computeRoleAnnualCost(role, 2)).toBeCloseTo(1 * 100_000 * 1.2, 6);
    expect(computeRoleAnnualCost(role, 3)).toBeCloseTo(2 * 100_000 * 1.2, 6);
  });

  it('treats a year with no headcount entry as zero cost', () => {
    expect(computeRoleAnnualCost(role, 1)).toBe(0);
    expect(computeRoleAnnualCost(role, 10)).toBe(0);
  });

  it('sums fully-loaded cost across all roles for a given year', () => {
    const role2: EmployeeRole = { ...role, id: 'r2', baseAnnualSalary: 60_000, benefitsPct: 0.1, headcountByYear: { 2: 3 } };
    const total = computePayrollFromRoles([role, role2], 2);
    expect(total).toBeCloseTo(1 * 100_000 * 1.2 + 3 * 60_000 * 1.1, 6);
  });

  it('rolls headcount-based payroll into the payroll expense category, additive with manual payroll line items', () => {
    const scenario = createDefaultScenario();
    scenario.employeeRoles = [role];
    const periods = computeModelPeriods(scenario);
    const annual = computeAnnualSummary(scenario, periods);

    const year2 = annual.find((a) => a.year === 2)!;
    const manualPayrollY2 = scenario.expenseLineItems
      .filter((i) => i.category === 'payroll')
      .reduce((acc, item) => acc + resolveLineItemAnnualAmount(item, 2, year2.revenue), 0);
    const expectedPayroll = manualPayrollY2 + computeRoleAnnualCost(role, 2);
    expect(year2.expensesByCategory.payroll).toBeCloseTo(expectedPayroll, 6);
  });

  it('applies role-based payroll even inside a construction period, same as other expense line items', () => {
    const scenario = createDefaultScenario();
    scenario.employeeRoles = [{ ...role, headcountByYear: { 1: 1 } }];
    const periods = computeModelPeriods(scenario);
    const y1q1 = periods.find((p) => p.label === 'Y1Q1')!;
    expect(y1q1.isConstruction).toBe(true);
    expect(y1q1.expensesByCategory.payroll).toBeCloseTo((100_000 * 1.2) / 4, 6);
  });

  describe('salary escalation', () => {
    it('grows salary at the configured % rate per year from baseSalaryYear, compounding', () => {
      const growingRole: EmployeeRole = {
        ...role,
        salaryEscalation: { type: 'percentGrowth', growthRate: 0.05 },
        headcountByYear: { 2: 1, 3: 1, 4: 1 },
      };
      expect(computeRoleAnnualSalary(growingRole, 2)).toBeCloseTo(100_000, 6);
      expect(computeRoleAnnualSalary(growingRole, 3)).toBeCloseTo(100_000 * 1.05, 6);
      expect(computeRoleAnnualSalary(growingRole, 4)).toBeCloseTo(100_000 * 1.05 * 1.05, 6);
    });

    it('does not zero out salary before baseSalaryYear — headcount alone gates cost', () => {
      const earlyHireRole: EmployeeRole = {
        ...role,
        baseSalaryYear: 5,
        salaryEscalation: { type: 'percentGrowth', growthRate: 0.05 },
        headcountByYear: { 1: 1 },
      };
      // Year 1 is before baseSalaryYear (5), but the role IS staffed in Year 1 —
      // salary must still resolve to a sensible (back-projected) amount, not 0.
      expect(computeRoleAnnualSalary(earlyHireRole, 1)).toBeCloseTo(100_000 * Math.pow(1.05, -4), 6);
      expect(computeRoleAnnualCost(earlyHireRole, 1)).toBeGreaterThan(0);
    });

    it('uses an exact manually-entered salary for a given year, falling back to the base elsewhere', () => {
      const manualRole: EmployeeRole = {
        ...role,
        salaryEscalation: { type: 'manual' },
        salaryYearOverrides: { 3: 130_000 },
        headcountByYear: { 2: 1, 3: 1 },
      };
      expect(computeRoleAnnualSalary(manualRole, 2)).toBeCloseTo(100_000, 6);
      expect(computeRoleAnnualSalary(manualRole, 3)).toBeCloseTo(130_000, 6);
      expect(computeRoleAnnualCost(manualRole, 3)).toBeCloseTo(130_000 * 1.2, 6);
    });

    it('lets a yearOverride win even when escalation is percentGrowth', () => {
      const overriddenGrowthRole: EmployeeRole = {
        ...role,
        salaryEscalation: { type: 'percentGrowth', growthRate: 0.05 },
        salaryYearOverrides: { 3: 999_999 },
        headcountByYear: { 2: 1, 3: 1 },
      };
      expect(computeRoleAnnualSalary(overriddenGrowthRole, 3)).toBe(999_999);
    });
  });
});

describe('computeDebtPayoffQuarter', () => {
  it('pays off the loan sooner with the ITC applied to debt than without it', () => {
    const scenario = createDefaultScenario();
    const withITC = computeDebtPayoffQuarter(scenario);
    const withoutITC = computeDebtPayoffQuarter(scenario, 0);
    expect(withITC).not.toBeNull();
    expect(withoutITC).not.toBeNull();
    const toIndex = (yq: { year: number; quarter: number }) => (yq.year - 1) * 4 + (yq.quarter - 1);
    expect(toIndex(withITC!)).toBeLessThan(toIndex(withoutITC!));
  });

  it('returns null when the loan never amortizes', () => {
    const scenario = createDefaultScenario();
    scenario.capital.gracePeriod = scenario.capital.loanTenor;
    expect(computeDebtPayoffQuarter(scenario)).toBeNull();
  });
});

describe('production helpers', () => {
  it('reports the plant nameplate capacity as a direct input', () => {
    const scenario = createDefaultScenario();
    expect(computeMaxDailyCapacityKg(scenario)).toBe(scenario.plant.maxDailyCapacityKg);
  });

  it('computes a break-even $/kg above the raw production cost', () => {
    const scenario = createDefaultScenario();
    const periods = computeModelPeriods(scenario);
    const breakEven = computeBreakEvenPricePerKg(periods);
    expect(breakEven).toBeGreaterThan(scenario.revenueStreams[0].h2ProductionCostPerKg);
  });
});

describe('validateScenario', () => {
  it('produces no errors for the well-funded default scenario', () => {
    const scenario = createDefaultScenario();
    const periods = computeModelPeriods(scenario);
    const annual = computeAnnualSummary(scenario, periods);
    const su = computeSourcesAndUses(scenario);
    const irr = computeEquityIRRFromScenario(scenario, annual);
    const validation = validateScenario(scenario, annual, su, irr);
    expect(validation.isOvercapitalized).toBe(false);
    expect(validation.fundingGap).toBeNull();
    expect(validation.errors).toHaveLength(0);
  });

  it('never flags Year 1 (construction) as a DSCR warning/danger year', () => {
    const scenario = createDefaultScenario();
    const periods = computeModelPeriods(scenario);
    const annual = computeAnnualSummary(scenario, periods);
    const su = computeSourcesAndUses(scenario);
    const irr = computeEquityIRRFromScenario(scenario, annual);
    const validation = validateScenario(scenario, annual, su, irr);
    expect(validation.dscrWarningYears).not.toContain(1);
    expect(validation.dscrDangerYears).not.toContain(1);
  });

  it('flags overcapitalization when debt exceeds total uses', () => {
    const scenario = createDefaultScenario();
    scenario.capital.totalDebt = 500_000_000;
    const periods = computeModelPeriods(scenario);
    const annual = computeAnnualSummary(scenario, periods);
    const su = computeSourcesAndUses(scenario);
    const irr = computeEquityIRRFromScenario(scenario, annual);
    const validation = validateScenario(scenario, annual, su, irr);
    expect(validation.isOvercapitalized).toBe(true);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('warns when construction duration exceeds the quarterly modeling window', () => {
    const scenario = createDefaultScenario();
    scenario.modelSettings.quarterlyYears = 1; // only 4 quarter-equivalents available
    scenario.construction.constructionDurationMonths = 24; // 8 quarter-equivalents needed
    const periods = computeModelPeriods(scenario);
    const annual = computeAnnualSummary(scenario, periods);
    const su = computeSourcesAndUses(scenario);
    const irr = computeEquityIRRFromScenario(scenario, annual);
    const validation = validateScenario(scenario, annual, su, irr);
    expect(validation.warnings.some((w) => w.includes('quarterly modeling window'))).toBe(true);
  });
});

describe('runModel (full integration, default 15-year scenario)', () => {
  const scenario = createDefaultScenario();
  const outputs = runModel(scenario);

  it('produces internally consistent totals across all 15 years', () => {
    expect(outputs.periods).toHaveLength(30);
    expect(outputs.annual).toHaveLength(15);
    expect(outputs.totalRevenueAllYears).toBeCloseTo(sum(outputs.annual.map((a) => a.revenue)), 6);
  });

  it('is fully funded and has a healthy, well-formed set of headline metrics', () => {
    expect(outputs.sourcesAndUses.isFullyFunded).toBe(true);
    expect(outputs.validation.isOvercapitalized).toBe(false);
    expect(outputs.totalRevenueAllYears).toBeGreaterThan(0);
    expect(outputs.equityIRR).not.toBeNull();
    expect(outputs.equityIRR!).toBeGreaterThan(0);
    expect(outputs.minDSCR).not.toBeNull();
    expect(outputs.minDSCR!).toBeGreaterThanOrEqual(1.0);
    expect(outputs.minDSCRYear).toBe(3);
  });

  it('fully amortizes the debt well within the 15-year horizon thanks to the ITC paydown', () => {
    const lastPeriod = outputs.periods[outputs.periods.length - 1];
    expect(lastPeriod.closingDebtBalance).toBe(0);
    expect(outputs.netDebtAfterITC).toBe(0);
    expect(outputs.interestSavedFromITC).toBeGreaterThan(0);
  });
});

describe('ITC: percent-of-eligible-CapEx mode', () => {
  it('in fixed mode, ignores percentOfEligibleCapex/eligibility tags and just returns the raw amount', () => {
    const scenario = createDefaultScenario();
    expect(computeITCAmount(scenario)).toBe(scenario.itc.amount);
  });

  it('computes the eligible base as the sum of itcEligible-tagged CapEx line items plus the additional amount', () => {
    const scenario = createDefaultScenario();
    // Defaults: hard CapEx ($8.5M Y1 + $1.5M Y2, eligible) + soft costs ($1M, eligible)
    // + contingency ($750k, NOT eligible).
    expect(computeITCEligibleBase(scenario)).toBeCloseTo(11_000_000, 6);

    scenario.itc.additionalEligibleCostAmount = 500_000;
    expect(computeITCEligibleBase(scenario)).toBeCloseTo(11_500_000, 6);
  });

  it('excludes a CapEx item from the eligible base once itcEligible is turned off', () => {
    const scenario = createDefaultScenario();
    const softCostItem = scenario.capexLineItems.find((i) => i.category === 'softCosts')!;
    softCostItem.itcEligible = false;
    expect(computeITCEligibleBase(scenario)).toBeCloseTo(10_000_000, 6);
  });

  it('in percent mode, computes the ITC as percentOfEligibleCapex * eligible base', () => {
    const scenario = createDefaultScenario();
    scenario.itc.mode = 'percentOfEligibleCapex';
    scenario.itc.percentOfEligibleCapex = 0.3;
    scenario.itc.additionalEligibleCostAmount = 0;
    expect(computeITCAmount(scenario)).toBeCloseTo(0.3 * 11_000_000, 6);
  });

  it('flows the percent-mode computed amount through to the sources & uses and annual periods', () => {
    const scenario = createDefaultScenario();
    scenario.itc.mode = 'percentOfEligibleCapex';
    scenario.itc.percentOfEligibleCapex = 0.25;
    const expectedAmount = 0.25 * computeITCEligibleBase(scenario);

    const su = computeSourcesAndUses(scenario);
    expect(su.sources.itc).toBeCloseTo(expectedAmount, 6);

    const outputs = runModel(scenario);
    const totalItcReceived = sum(outputs.periods.map((p) => p.itcReceived));
    expect(totalItcReceived).toBeCloseTo(expectedAmount, 6);
  });

  it('zeroing the ITC for a "without ITC" comparison must also force fixed mode, or percent mode ignores the zeroed amount', () => {
    const scenario = createDefaultScenario();
    scenario.itc.mode = 'percentOfEligibleCapex';
    scenario.itc.percentOfEligibleCapex = 0.4;

    const brokenOverride = { ...scenario.itc, amount: 0 };
    expect(computeITCAmount({ ...scenario, itc: brokenOverride })).toBeGreaterThan(0);

    const correctOverride = { ...scenario.itc, mode: 'fixed' as const, amount: 0 };
    expect(computeITCAmount({ ...scenario, itc: correctOverride })).toBe(0);
  });
});

describe('AnnualResult cash flow statement fields', () => {
  const scenario = createDefaultScenario();
  const periods = computeModelPeriods(scenario);
  const annual = computeAnnualSummary(scenario, periods);

  it('computes netIncome as EBIT minus interest expense', () => {
    for (const a of annual) {
      expect(a.netIncome).toBeCloseTo(a.ebit - a.interest, 6);
    }
  });

  it('computes cashFromOperations as net income plus depreciation add-back', () => {
    for (const a of annual) {
      expect(a.cashFromOperations).toBeCloseTo(a.netIncome + a.depreciation, 6);
    }
  });

  it('computes cashFromInvesting as the negative of CapEx spend for the year', () => {
    for (const a of annual) {
      expect(a.cashFromInvesting).toBeCloseTo(-a.capexSpend, 6);
    }
  });

  it('includes debt draw and equity contribution only in Year 1 of cashFromFinancing', () => {
    const y1 = annual[0];
    const y2 = annual[1];
    const expectedY1Financing =
      scenario.capital.totalDebt +
      (scenario.capital.cashEquity + scenario.capital.founderSweatEquity + scenario.capital.landContribution) -
      y1.principal -
      y1.extraPrincipalFromITC +
      (scenario.itc.appliedTo === 'debt' ? 0 : y1.itcReceived);
    expect(y1.cashFromFinancing).toBeCloseTo(expectedY1Financing, 6);

    const expectedY2Financing =
      -y2.principal - y2.extraPrincipalFromITC + (scenario.itc.appliedTo === 'debt' ? 0 : y2.itcReceived);
    expect(y2.cashFromFinancing).toBeCloseTo(expectedY2Financing, 6);
  });

  it('sums the three activities into netChangeInCash', () => {
    for (const a of annual) {
      expect(a.netChangeInCash).toBeCloseTo(a.cashFromOperations + a.cashFromInvesting + a.cashFromFinancing, 6);
    }
  });

  it('accumulates endingCashBalance as a running total of netChangeInCash across years', () => {
    let running = 0;
    for (const a of annual) {
      running += a.netChangeInCash;
      expect(a.endingCashBalance).toBeCloseTo(running, 6);
    }
  });
});
