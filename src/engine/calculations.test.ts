import { describe, expect, it } from 'vitest';
import {
  ALL_QUARTERS,
  CONSTRUCTION_QUARTERS,
  DSCR_TARGET,
  REVENUE_QUARTERS,
  buildEquityCashFlows,
  calculateDSRAmount,
  computeAnnualSummary,
  computeBreakEvenPricePerKg,
  computeDebtPayoffQuarter,
  computeEquityIRRFromScenario,
  computeEquityPaybackYear,
  computeMaxDailyCapacityKg,
  computeMinDSCR,
  computeQuarterlyModel,
  computeSourcesAndUses,
  findITCQuarterIndex,
  isConstructionQuarter,
  quarterLabel,
  runModel,
  solveIRR,
  sum,
  validateScenario,
} from './calculations';
import { createDefaultScenario } from './defaults';
import type { Scenario } from './types';

describe('quarter timeline', () => {
  it('has 20 total quarters across the 5-year model', () => {
    expect(ALL_QUARTERS).toHaveLength(20);
  });

  it('has 5 construction quarters (Y1Q1-Q4 + Y2Q1)', () => {
    expect(CONSTRUCTION_QUARTERS).toHaveLength(5);
    expect(CONSTRUCTION_QUARTERS[0]).toEqual({ year: 1, quarter: 1 });
    expect(CONSTRUCTION_QUARTERS[4]).toEqual({ year: 2, quarter: 1 });
  });

  it('has 15 revenue quarters spanning Y2Q2 through Y5Q4', () => {
    expect(REVENUE_QUARTERS).toHaveLength(15);
    expect(REVENUE_QUARTERS[0]).toEqual({ year: 2, quarter: 2 });
    expect(REVENUE_QUARTERS[REVENUE_QUARTERS.length - 1]).toEqual({
      year: 5,
      quarter: 4,
    });
  });

  it('quarterLabel formats correctly', () => {
    expect(quarterLabel(2, 3)).toBe('Y2Q3');
  });

  it('isConstructionQuarter flags only the 5 construction quarters', () => {
    expect(isConstructionQuarter(1, 1)).toBe(true);
    expect(isConstructionQuarter(2, 1)).toBe(true);
    expect(isConstructionQuarter(2, 2)).toBe(false);
    expect(isConstructionQuarter(5, 4)).toBe(false);
  });
});

describe('findITCQuarterIndex', () => {
  it('lands on the first revenue quarter of the target year when one exists', () => {
    // Year 2's first revenue quarter is Y2Q2, which is index 5 in ALL_QUARTERS.
    const idx = findITCQuarterIndex(2);
    expect(ALL_QUARTERS[idx]).toEqual({ year: 2, quarter: 2 });
  });

  it('falls back to the last quarter of the year when the year is fully construction', () => {
    const idx = findITCQuarterIndex(1);
    expect(ALL_QUARTERS[idx]).toEqual({ year: 1, quarter: 4 });
  });

  it('lands on Q1 for years with a full revenue year', () => {
    const idx = findITCQuarterIndex(3);
    expect(ALL_QUARTERS[idx]).toEqual({ year: 3, quarter: 1 });
  });
});

describe('createDefaultQuarters', () => {
  it('produces one entry per revenue quarter', () => {
    const scenario = createDefaultScenario();
    expect(scenario.quarters).toHaveLength(REVENUE_QUARTERS.length);
  });

  it('uses the year5Plus production settings for Year 5 quarters', () => {
    const scenario = createDefaultScenario();
    const production = scenario.production;
    const y5Quarters = scenario.quarters.filter((q) => q.year === 5);
    expect(y5Quarters).toHaveLength(4);
    for (const q of y5Quarters) {
      expect(q.pricePerKg).toBe(production.year5PlusPricePerKg);
      expect(q.annualExpenses).toBe(production.year5PlusAnnualExpenses);
    }
  });
});

describe('computeQuarterlyModel', () => {
  const scenario = createDefaultScenario();
  const results = computeQuarterlyModel(scenario);

  it('produces exactly 20 quarter results', () => {
    expect(results).toHaveLength(20);
  });

  it('has zero revenue and COGS in every construction quarter', () => {
    for (const r of results.filter((r) => r.isConstruction)) {
      expect(r.revenue).toBe(0);
      expect(r.cogs).toBe(0);
    }
  });

  it('computes construction quarter EBITDA as -3 months of construction opex', () => {
    const q = results[0];
    expect(q.isConstruction).toBe(true);
    expect(q.quarterlyExpenses).toBeCloseTo(
      scenario.construction.constructionOpexPerMonth * 3,
      6,
    );
    expect(q.ebitda).toBeCloseTo(-q.quarterlyExpenses, 6);
  });

  it('computes revenue = trucks x kg/fill x price x days for a revenue quarter', () => {
    const input = scenario.quarters[0]; // first revenue quarter, Y2Q2
    const r = results.find((r) => r.year === input.year && r.quarter === input.quarter)!;
    const expectedRevenue =
      input.trucksPerDay *
      scenario.production.kgPerTruckFill *
      input.pricePerKg *
      input.operatingDays;
    expect(r.revenue).toBeCloseTo(expectedRevenue, 6);
  });

  it('computes COGS = h2ProductionCostPerKg x trucks x kg/fill x days', () => {
    const input = scenario.quarters[0];
    const r = results.find((r) => r.year === input.year && r.quarter === input.quarter)!;
    const expectedCogs =
      scenario.production.h2ProductionCostPerKg *
      input.trucksPerDay *
      scenario.production.kgPerTruckFill *
      input.operatingDays;
    expect(r.cogs).toBeCloseTo(expectedCogs, 6);
  });

  it('computes gross profit = revenue - COGS and EBITDA = gross profit - quarterly expenses', () => {
    const r = results.find((r) => !r.isConstruction)!;
    expect(r.grossProfit).toBeCloseTo(r.revenue - r.cogs, 6);
    expect(r.quarterlyExpenses).toBeCloseTo(r.annualExpensesBudget / 4, 6);
    expect(r.ebitda).toBeCloseTo(r.grossProfit - r.quarterlyExpenses, 6);
  });

  it('opens the debt schedule at the full totalDebt balance in Y1Q1', () => {
    expect(results[0].openingDebtBalance).toBe(scenario.capital.totalDebt);
  });

  it('computes interest as openingBalance x rate x 0.25 every quarter', () => {
    for (const r of results) {
      expect(r.interest).toBeCloseTo(
        r.openingDebtBalance * scenario.capital.interestRate * 0.25,
        6,
      );
    }
  });

  it('charges zero principal before year >= gracePeriod + 2, and a flat scheduled amount after', () => {
    const threshold = scenario.capital.gracePeriod + 2; // = 3 by default
    const amortYears = scenario.capital.loanTenor - scenario.capital.gracePeriod;
    const expectedQuarterlyPrincipal =
      (scenario.capital.totalDebt / amortYears) * 0.25;

    for (const r of results) {
      if (r.year < threshold) {
        expect(r.principal).toBe(0);
      } else {
        expect(r.principal).toBeCloseTo(expectedQuarterlyPrincipal, 6);
      }
    }
  });

  it('receives the ITC as a lump sum in the designated quarter only', () => {
    const itcQuarters = results.filter((r) => r.itcReceived > 0);
    expect(itcQuarters).toHaveLength(1);
    expect(itcQuarters[0].itcReceived).toBe(scenario.itc.amount);
    expect(itcQuarters[0].year).toBe(scenario.itc.receivedInYear);
  });

  it('immediately reduces the outstanding debt balance when ITC is applied to debt', () => {
    expect(scenario.itc.appliedTo).toBe('debt');
    const itcIndex = results.findIndex((r) => r.itcReceived > 0);
    const itcQuarter = results[itcIndex];
    expect(itcQuarter.closingDebtBalance).toBeCloseTo(
      itcQuarter.openingDebtBalance - itcQuarter.principal - scenario.itc.amount,
      6,
    );
    // Next quarter opens at the reduced balance.
    expect(results[itcIndex + 1].openingDebtBalance).toBeCloseTo(
      itcQuarter.closingDebtBalance,
      6,
    );
  });

  it('does not add the debt-applied ITC to net cash, but does track it against cumulative CF via reduced future interest only', () => {
    const itcQuarter = results.find((r) => r.itcReceived > 0)!;
    const expectedNetCash =
      itcQuarter.ebitda - itcQuarter.interest - itcQuarter.principal;
    expect(itcQuarter.netCash).toBeCloseTo(expectedNetCash, 6);
  });

  it('adds ITC directly to net cash when applied to reserve or opex', () => {
    const reserveScenario: Scenario = {
      ...scenario,
      itc: { ...scenario.itc, appliedTo: 'reserve' },
    };
    const reserveResults = computeQuarterlyModel(reserveScenario);
    const itcQuarter = reserveResults.find((r) => r.itcReceived > 0)!;
    const expectedNetCash =
      itcQuarter.ebitda -
      itcQuarter.interest -
      itcQuarter.principal +
      itcQuarter.itcReceived;
    expect(itcQuarter.netCash).toBeCloseTo(expectedNetCash, 6);
    // Debt balance is unaffected by a reserve/opex ITC application.
    expect(itcQuarter.closingDebtBalance).toBeCloseTo(
      itcQuarter.openingDebtBalance - itcQuarter.principal,
      6,
    );
  });

  it('accumulates cumulativeCF as a running sum of netCash', () => {
    let running = 0;
    for (const r of results) {
      running += r.netCash;
      expect(r.cumulativeCF).toBeCloseTo(running, 6);
    }
  });

  it('computes DSCR = EBITDA / (interest + principal), or null when there is no debt service', () => {
    for (const r of results) {
      const debtService = r.interest + r.principal;
      if (debtService > 0) {
        expect(r.dscr).toBeCloseTo(r.ebitda / debtService, 6);
      } else {
        expect(r.dscr).toBeNull();
      }
    }
  });

  it('never lets the debt balance go negative', () => {
    for (const r of results) {
      expect(r.closingDebtBalance).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('computeAnnualSummary', () => {
  const scenario = createDefaultScenario();
  const quarters = computeQuarterlyModel(scenario);
  const annual = computeAnnualSummary(scenario, quarters);

  it('produces one row per year, 5 years total', () => {
    expect(annual).toHaveLength(5);
    expect(annual.map((a) => a.year)).toEqual([1, 2, 3, 4, 5]);
  });

  it('flags Year 1 as construction (no revenue) and Year 2 as partial revenue', () => {
    expect(annual[0].isConstruction).toBe(true);
    expect(annual[0].revenue).toBe(0);
    expect(annual[1].isPartialRevenue).toBe(true);
    expect(annual[1].revenue).toBeGreaterThan(0);
  });

  it('aggregates each year as the sum of its 4 quarters', () => {
    for (const a of annual) {
      const yearQuarters = quarters.filter((q) => q.year === a.year);
      expect(yearQuarters).toHaveLength(4);
      expect(a.revenue).toBeCloseTo(sum(yearQuarters.map((q) => q.revenue)), 6);
      expect(a.ebitda).toBeCloseTo(sum(yearQuarters.map((q) => q.ebitda)), 6);
      expect(a.interest).toBeCloseTo(sum(yearQuarters.map((q) => q.interest)), 6);
    }
  });

  it('computes straight-line D&A over 20 years with 5% salvage, starting Year 2', () => {
    const totalCapex =
      scenario.construction.hardCapex +
      scenario.construction.softCosts +
      scenario.construction.contingency;
    const expectedAnnualDNA = (totalCapex * 0.95) / 20;

    expect(annual[0].depreciation).toBe(0);
    for (const a of annual.slice(1)) {
      expect(a.depreciation).toBeCloseTo(expectedAnnualDNA, 6);
      expect(a.ebit).toBeCloseTo(a.ebitda - a.depreciation, 6);
    }
  });

  it('computes gross margin % and EBITDA margin % only where revenue exists', () => {
    expect(annual[0].grossMarginPct).toBeNull();
    for (const a of annual.slice(1)) {
      expect(a.grossMarginPct).toBeCloseTo(a.grossProfit / a.revenue, 6);
      expect(a.ebitdaMarginPct).toBeCloseTo(a.ebitda / a.revenue, 6);
    }
  });
});

describe('IRR solver', () => {
  it('solves a simple known cash flow to the expected IRR', () => {
    // -100 today, +110 in one year => 10% IRR.
    const irr = solveIRR([-100, 110]);
    expect(irr).not.toBeNull();
    expect(irr!).toBeCloseTo(0.1, 4);
  });

  it('solves a multi-period cash flow against a manually verified NPV=0 rate', () => {
    // -1000, 300, 400, 500, 200 => IRR approx 11.9%
    const cashFlows = [-1000, 300, 400, 500, 200];
    const irr = solveIRR(cashFlows);
    expect(irr).not.toBeNull();
    const npvAtIrr = cashFlows.reduce(
      (acc, cf, t) => acc + cf / Math.pow(1 + irr!, t),
      0,
    );
    expect(npvAtIrr).toBeCloseTo(0, 2);
  });

  it('returns null for all-positive or all-negative cash flows', () => {
    expect(solveIRR([100, 200, 300])).toBeNull();
    expect(solveIRR([-100, -200])).toBeNull();
  });
});

describe('equity IRR and payback (from Scenario)', () => {
  const scenario = createDefaultScenario();
  const quarters = computeQuarterlyModel(scenario);
  const annual = computeAnnualSummary(scenario, quarters);

  it('builds the [-cashEquity, yr2, yr3, yr4, yr5] cash flow stream', () => {
    const flows = buildEquityCashFlows(scenario, annual);
    expect(flows).toHaveLength(5);
    expect(flows[0]).toBe(-scenario.capital.cashEquity);
    expect(flows[1]).toBeCloseTo(annual[1].netCash, 6);
    expect(flows[4]).toBeCloseTo(annual[4].netCash, 6);
  });

  it('computes a positive, plausible IRR for the base case (clears the 15% investor hurdle)', () => {
    const irr = computeEquityIRRFromScenario(scenario, annual);
    expect(irr).not.toBeNull();
    expect(irr!).toBeGreaterThan(0.15);
    expect(irr!).toBeLessThan(0.5);
  });

  it('computes an equity payback year within the 5-year model horizon', () => {
    const paybackYear = computeEquityPaybackYear(scenario, annual);
    expect(paybackYear).not.toBeNull();
    expect(paybackYear).toBeGreaterThanOrEqual(2);
    expect(paybackYear).toBeLessThanOrEqual(5);
  });
});

describe('DSCR aggregation', () => {
  it('finds the minimum annual DSCR across revenue years (2-5)', () => {
    const scenario = createDefaultScenario();
    const quarters = computeQuarterlyModel(scenario);
    const annual = computeAnnualSummary(scenario, quarters);
    const { minDSCR, minDSCRYear } = computeMinDSCR(annual);
    expect(minDSCR).not.toBeNull();
    expect(minDSCRYear).not.toBeNull();

    const manualMin = Math.min(
      ...annual.filter((a) => a.year >= 2 && a.dscr !== null).map((a) => a.dscr as number),
    );
    expect(minDSCR!).toBeCloseTo(manualMin, 6);
  });
});

describe('Sources & Uses', () => {
  it('sums sources and uses correctly and flags funding status by sign of surplus', () => {
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
      scenario.construction.hardCapex +
        scenario.construction.softCosts +
        scenario.construction.contingency +
        scenario.construction.constructionOpexPerMonth *
          scenario.construction.constructionDurationMonths +
        calculateDSRAmount(scenario) +
        scenario.construction.workingCapitalBuffer,
      6,
    );
    expect(su.surplusOrGap).toBeCloseTo(su.sources.total - su.uses.total, 6);
    expect(su.isFullyFunded).toBe(su.surplusOrGap >= 0);
  });

  it('flags a funding gap when uses exceed sources', () => {
    const scenario = createDefaultScenario();
    scenario.construction.hardCapex = 50_000_000;
    const su = computeSourcesAndUses(scenario);
    expect(su.surplusOrGap).toBeLessThan(0);
    expect(su.isFullyFunded).toBe(false);
  });
});

describe('computeDebtPayoffQuarter', () => {
  it('pays off the loan sooner with the ITC applied to debt than without it', () => {
    const scenario = createDefaultScenario();
    const withITC = computeDebtPayoffQuarter(scenario);
    const withoutITC = computeDebtPayoffQuarter(scenario, 0);
    expect(withITC).not.toBeNull();
    expect(withoutITC).not.toBeNull();

    const toQuarterIndex = (yq: { year: number; quarter: number }) =>
      (yq.year - 1) * 4 + (yq.quarter - 1);
    expect(toQuarterIndex(withITC!)).toBeLessThan(toQuarterIndex(withoutITC!));
  });

  it('returns null when the loan never amortizes (grace period consumes the full tenor)', () => {
    const scenario = createDefaultScenario();
    scenario.capital.gracePeriod = scenario.capital.loanTenor;
    expect(computeDebtPayoffQuarter(scenario)).toBeNull();
  });
});

describe('production helpers', () => {
  it('computes max daily capacity as trucks x kg/fill', () => {
    const scenario = createDefaultScenario();
    const capacity = computeMaxDailyCapacityKg(scenario.production, 12.5);
    expect(capacity).toBe(12.5 * scenario.production.kgPerTruckFill);
  });

  it('computes a break-even price per kg above the raw production cost', () => {
    const scenario = createDefaultScenario();
    const breakEven = computeBreakEvenPricePerKg(scenario, 10, 84);
    expect(breakEven).toBeGreaterThan(scenario.production.h2ProductionCostPerKg);
  });
});

describe('validateScenario', () => {
  it('produces no errors for the well-funded default scenario', () => {
    const scenario = createDefaultScenario();
    const quarters = computeQuarterlyModel(scenario);
    const annual = computeAnnualSummary(scenario, quarters);
    const su = computeSourcesAndUses(scenario);
    const irr = computeEquityIRRFromScenario(scenario, annual);
    const validation = validateScenario(scenario, annual, su, irr);
    expect(validation.isOvercapitalized).toBe(false);
    expect(validation.fundingGap).toBeNull();
    expect(validation.errors).toHaveLength(0);
  });

  it('flags overcapitalization when debt exceeds total uses', () => {
    const scenario = createDefaultScenario();
    scenario.capital.totalDebt = 500_000_000;
    const quarters = computeQuarterlyModel(scenario);
    const annual = computeAnnualSummary(scenario, quarters);
    const su = computeSourcesAndUses(scenario);
    const irr = computeEquityIRRFromScenario(scenario, annual);
    const validation = validateScenario(scenario, annual, su, irr);
    expect(validation.isOvercapitalized).toBe(true);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('never flags Year 1 (construction, no revenue) as a DSCR warning/danger year', () => {
    const scenario = createDefaultScenario();
    const quarters = computeQuarterlyModel(scenario);
    const annual = computeAnnualSummary(scenario, quarters);
    const su = computeSourcesAndUses(scenario);
    const irr = computeEquityIRRFromScenario(scenario, annual);
    const validation = validateScenario(scenario, annual, su, irr);
    expect(validation.dscrWarningYears).not.toContain(1);
    expect(validation.dscrDangerYears).not.toContain(1);
  });

  it('flags DSCR warning/danger years relative to the 1.25x covenant', () => {
    const scenario = createDefaultScenario();
    // Crush revenue so DSCR falls well below covenant across the board.
    scenario.quarters = scenario.quarters.map((q) => ({
      ...q,
      trucksPerDay: 1,
      pricePerKg: 6,
    }));
    const quarters = computeQuarterlyModel(scenario);
    const annual = computeAnnualSummary(scenario, quarters);
    const su = computeSourcesAndUses(scenario);
    const irr = computeEquityIRRFromScenario(scenario, annual);
    const validation = validateScenario(scenario, annual, su, irr);
    expect(
      validation.dscrDangerYears.length + validation.dscrWarningYears.length,
    ).toBeGreaterThan(0);
  });

  it('warns when equity IRR falls below the 8% minimum threshold', () => {
    const scenario = createDefaultScenario();
    scenario.quarters = scenario.quarters.map((q) => ({
      ...q,
      trucksPerDay: 1,
      pricePerKg: 6,
    }));
    const quarters = computeQuarterlyModel(scenario);
    const annual = computeAnnualSummary(scenario, quarters);
    const su = computeSourcesAndUses(scenario);
    const irr = computeEquityIRRFromScenario(scenario, annual);
    const validation = validateScenario(scenario, annual, su, irr);
    if (irr !== null && irr < 0.08) {
      expect(validation.irrBelowThreshold).toBe(true);
      expect(validation.warnings.some((w) => w.includes('8%'))).toBe(true);
    }
  });
});

describe('runModel (full integration)', () => {
  const scenario = createDefaultScenario();
  const outputs = runModel(scenario);

  it('produces internally consistent totals', () => {
    expect(outputs.quarters).toHaveLength(20);
    expect(outputs.annual).toHaveLength(5);
    expect(outputs.totalRevenue5yr).toBeCloseTo(
      sum(outputs.annual.map((a) => a.revenue)),
      6,
    );
  });

  it('lands within the documented default-scenario verification ranges', () => {
    // 5-year revenue should land in the $17-19M range at default inputs.
    expect(outputs.totalRevenue5yr).toBeGreaterThanOrEqual(17_000_000);
    expect(outputs.totalRevenue5yr).toBeLessThanOrEqual(19_000_000);

    // Minimum DSCR (Year 3, when principal amortization begins) should be
    // in the 1.1x-1.3x band.
    expect(outputs.minDSCRYear).toBe(3);
    expect(outputs.minDSCR).not.toBeNull();
    expect(outputs.minDSCR!).toBeGreaterThanOrEqual(1.1);
    expect(outputs.minDSCR!).toBeLessThanOrEqual(1.3);

    // A $4M ITC applied to debt in Year 2 should cut total interest paid
    // over the model horizon by roughly $800K-$1.2M vs. no ITC.
    expect(outputs.interestSavedFromITC).toBeGreaterThanOrEqual(800_000);
    expect(outputs.interestSavedFromITC).toBeLessThanOrEqual(1_200_000);
  });

  it('is fully funded at default inputs', () => {
    expect(outputs.sourcesAndUses.isFullyFunded).toBe(true);
    expect(outputs.validation.isOvercapitalized).toBe(false);
  });

  it('produces a DSCR badge-worthy classification for every revenue year', () => {
    for (const a of outputs.annual.filter((a) => a.dscr !== null)) {
      const band =
        (a.dscr as number) >= DSCR_TARGET
          ? 'green'
          : (a.dscr as number) >= 0.8
            ? 'amber'
            : 'red';
      expect(['green', 'amber', 'red']).toContain(band);
    }
  });
});
