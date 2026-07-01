import type {
  AnnualResult,
  ModelOutputs,
  ProductionSettings,
  QuarterInput,
  QuarterResult,
  Scenario,
  SourcesAndUses,
  ValidationResult,
} from './types';

/**
 * Model horizon: 5 years x 4 quarters = 20 quarters.
 * Construction: Y1Q1-Q4 + Y2Q1 = 5 quarters (no revenue).
 * Revenue: Y2Q2 through Y5Q4 = the remaining 15 quarters.
 *
 * Note: the product brief describes the revenue phase as "14 quarters"
 * indexed 0-13, but "Y2Q2 through Y5Q4" together with "5 years = 20
 * quarters total" and "5 construction quarters" is only internally
 * consistent at 15 revenue quarters (20 - 5 = 15). That arithmetic is
 * authoritative here so annual aggregates always cover a full 4 quarters
 * per year across all 5 years.
 */
export const DSCR_TARGET = 1.25;
export const DSCR_DANGER = 0.8;
export const IRR_MIN_THRESHOLD = 0.08;
export const IRR_INVESTOR_HURDLE = 0.15;
export const DEPRECIATION_LIFE_YEARS = 20;
export const DEPRECIATION_SALVAGE_PCT = 0.05;

export interface YearQuarter {
  year: number;
  quarter: number;
}

export const CONSTRUCTION_QUARTERS: YearQuarter[] = [
  { year: 1, quarter: 1 },
  { year: 1, quarter: 2 },
  { year: 1, quarter: 3 },
  { year: 1, quarter: 4 },
  { year: 2, quarter: 1 },
];

export const REVENUE_QUARTERS: YearQuarter[] = [
  { year: 2, quarter: 2 },
  { year: 2, quarter: 3 },
  { year: 2, quarter: 4 },
  { year: 3, quarter: 1 },
  { year: 3, quarter: 2 },
  { year: 3, quarter: 3 },
  { year: 3, quarter: 4 },
  { year: 4, quarter: 1 },
  { year: 4, quarter: 2 },
  { year: 4, quarter: 3 },
  { year: 4, quarter: 4 },
  { year: 5, quarter: 1 },
  { year: 5, quarter: 2 },
  { year: 5, quarter: 3 },
  { year: 5, quarter: 4 },
];

export const ALL_QUARTERS: YearQuarter[] = [
  ...CONSTRUCTION_QUARTERS,
  ...REVENUE_QUARTERS,
];

export function quarterLabel(year: number, quarter: number): string {
  return `Y${year}Q${quarter}`;
}

export function isConstructionQuarter(year: number, quarter: number): boolean {
  return CONSTRUCTION_QUARTERS.some(
    (q) => q.year === year && q.quarter === quarter,
  );
}

/**
 * Default quarterly revenue assumptions: an off-take-backed ramp with an
 * elevated cost/utilization dip in Year 3 (when debt amortization begins)
 * before Year 4-5 stabilize toward the steady-state production settings.
 */
export function createDefaultQuarters(
  production: ProductionSettings,
): QuarterInput[] {
  const rampByYear: Record<
    number,
    { trucks: number; days: number; price: number; expenses: number }
  > = {
    2: { trucks: 11, days: 92, price: 19, expenses: 850_000 },
    3: { trucks: 10, days: 83, price: 13.5, expenses: 1_345_000 },
    4: { trucks: 12, days: 92, price: 16, expenses: 1_050_000 },
    5: {
      trucks: 12,
      days: 92,
      price: production.year5PlusPricePerKg,
      expenses: production.year5PlusAnnualExpenses,
    },
  };

  return REVENUE_QUARTERS.map(({ year, quarter }) => {
    const ramp = rampByYear[year];
    return {
      year,
      quarter,
      trucksPerDay: ramp.trucks,
      operatingDays: ramp.days,
      pricePerKg: ramp.price,
      annualExpenses: ramp.expenses,
    };
  });
}

export function findQuarterInput(
  quarters: QuarterInput[],
  year: number,
  quarter: number,
): QuarterInput | undefined {
  return quarters.find((q) => q.year === year && q.quarter === quarter);
}

/** First quarter (in the full 20-quarter timeline) in which the ITC is received. */
export function findITCQuarterIndex(receivedInYear: number): number {
  const firstRevenueInYear = ALL_QUARTERS.findIndex(
    (q) =>
      q.year === receivedInYear &&
      !isConstructionQuarter(q.year, q.quarter),
  );
  if (firstRevenueInYear !== -1) return firstRevenueInYear;

  // The target year is entirely construction (e.g. Year 1): fall back to
  // the last quarter of that year so the credit still lands within it.
  const lastQuarterInYear = ALL_QUARTERS.reduce(
    (lastIdx, q, idx) => (q.year === receivedInYear ? idx : lastIdx),
    -1,
  );
  return lastQuarterInYear !== -1 ? lastQuarterInYear : 0;
}

/**
 * Runs the full 20-quarter cash flow / debt schedule.
 * @param itcOverrideAmount optional override, used internally to compute the "no ITC" counterfactual.
 */
export function computeQuarterlyModel(
  scenario: Scenario,
  itcOverrideAmount?: number,
): QuarterResult[] {
  const { capital, construction, itc, production } = scenario;
  const itcAmount = itcOverrideAmount ?? itc.amount;
  const itcQuarterIndex = findITCQuarterIndex(itc.receivedInYear);
  const amortYears = Math.max(capital.loanTenor - capital.gracePeriod, 0);
  const scheduledQuarterlyPrincipal =
    amortYears > 0 ? (capital.totalDebt / amortYears) * 0.25 : 0;
  const principalStartYear = capital.gracePeriod + 2;

  let openingDebtBalance = capital.totalDebt;
  let cumulativeCF = 0;

  const results: QuarterResult[] = [];

  ALL_QUARTERS.forEach(({ year, quarter }, index) => {
    const isConstruction = isConstructionQuarter(year, quarter);
    const isITCQuarter = index === itcQuarterIndex;

    let revenue = 0;
    let cogs = 0;
    let quarterlyExpenses = 0;
    let annualExpensesBudget = 0;
    let trucksPerDay = 0;
    let operatingDays = 0;
    let pricePerKg = 0;

    if (isConstruction) {
      quarterlyExpenses = construction.constructionOpexPerMonth * 3;
    } else {
      const input = findQuarterInput(scenario.quarters, year, quarter);
      if (input) {
        trucksPerDay = input.trucksPerDay;
        operatingDays = input.operatingDays;
        pricePerKg = input.pricePerKg;
        annualExpensesBudget = input.annualExpenses;
        revenue = trucksPerDay * production.kgPerTruckFill * pricePerKg * operatingDays;
        cogs =
          production.h2ProductionCostPerKg *
          trucksPerDay *
          production.kgPerTruckFill *
          operatingDays;
        quarterlyExpenses = annualExpensesBudget / 4;
      }
    }

    const grossProfit = revenue - cogs;
    const ebitda = grossProfit - quarterlyExpenses;

    const interest = openingDebtBalance * capital.interestRate * 0.25;
    let principal =
      year >= principalStartYear ? scheduledQuarterlyPrincipal : 0;
    principal = Math.min(principal, openingDebtBalance);

    const itcReceived = isITCQuarter ? itcAmount : 0;
    let itcAppliedToDebt = 0;
    if (itcReceived > 0 && itc.appliedTo === 'debt') {
      itcAppliedToDebt = Math.min(itcReceived, openingDebtBalance - principal);
    }

    const closingDebtBalance = Math.max(
      openingDebtBalance - principal - itcAppliedToDebt,
      0,
    );

    const itcToCash = itc.appliedTo === 'debt' ? 0 : itcReceived;
    const netCash = ebitda - interest - principal + itcToCash;
    cumulativeCF += netCash;

    const debtService = interest + principal;
    const dscr = debtService > 0 ? ebitda / debtService : null;

    results.push({
      index,
      year,
      quarter,
      label: quarterLabel(year, quarter),
      isConstruction,
      isITCQuarter,
      trucksPerDay,
      operatingDays,
      pricePerKg,
      revenue,
      cogs,
      grossProfit,
      quarterlyExpenses,
      annualExpensesBudget,
      ebitda,
      openingDebtBalance,
      interest,
      principal,
      itcReceived,
      closingDebtBalance,
      netCash,
      cumulativeCF,
      dscr,
    });

    openingDebtBalance = closingDebtBalance;
  });

  return results;
}

export function computeAnnualSummary(
  scenario: Scenario,
  quarterResults: QuarterResult[],
): AnnualResult[] {
  const totalCapex =
    scenario.construction.hardCapex +
    scenario.construction.softCosts +
    scenario.construction.contingency;
  const annualDepreciation =
    (totalCapex * (1 - DEPRECIATION_SALVAGE_PCT)) / DEPRECIATION_LIFE_YEARS;

  const years = [1, 2, 3, 4, 5];
  return years.map((year) => {
    const yearQuarters = quarterResults.filter((q) => q.year === year);
    const revenue = sum(yearQuarters.map((q) => q.revenue));
    const cogs = sum(yearQuarters.map((q) => q.cogs));
    const grossProfit = revenue - cogs;
    const companyExpenses = sum(yearQuarters.map((q) => q.quarterlyExpenses));
    const ebitda = sum(yearQuarters.map((q) => q.ebitda));
    const interest = sum(yearQuarters.map((q) => q.interest));
    const principal = sum(yearQuarters.map((q) => q.principal));
    const itcReceived = sum(yearQuarters.map((q) => q.itcReceived));
    const extraPrincipalFromITC =
      scenario.itc.appliedTo === 'debt' ? itcReceived : 0;
    const totalDebtService = interest + principal + extraPrincipalFromITC;
    const depreciation = year >= 2 ? annualDepreciation : 0;
    const ebit = ebitda - depreciation;
    const netCash = sum(yearQuarters.map((q) => q.netCash));
    const closingDebtBalance =
      yearQuarters.length > 0
        ? yearQuarters[yearQuarters.length - 1].closingDebtBalance
        : scenario.capital.totalDebt;
    const cumulativeCF =
      yearQuarters.length > 0
        ? yearQuarters[yearQuarters.length - 1].cumulativeCF
        : 0;
    const debtServiceForDscr = interest + principal;
    const dscr = debtServiceForDscr > 0 ? ebitda / debtServiceForDscr : null;

    return {
      year,
      isConstruction: year === 1,
      isPartialRevenue: year === 2,
      revenue,
      cogs,
      grossProfit,
      grossMarginPct: revenue > 0 ? grossProfit / revenue : null,
      companyExpenses,
      ebitda,
      ebitdaMarginPct: revenue > 0 ? ebitda / revenue : null,
      depreciation,
      ebit,
      interest,
      principal,
      itcReceived,
      extraPrincipalFromITC,
      totalDebtService,
      dscr,
      dscrHeadroom: dscr !== null ? dscr - DSCR_TARGET : null,
      netCash,
      cumulativeCF,
      closingDebtBalance,
    };
  });
}

/** Builds the annual equity cash flow stream used for IRR/payback: [-cashEquity, yr2Net, yr3Net, yr4Net, yr5Net]. */
export function buildEquityCashFlows(
  scenario: Scenario,
  annual: AnnualResult[],
): number[] {
  const byYear = new Map(annual.map((a) => [a.year, a]));
  return [
    -scenario.capital.cashEquity,
    byYear.get(2)?.netCash ?? 0,
    byYear.get(3)?.netCash ?? 0,
    byYear.get(4)?.netCash ?? 0,
    byYear.get(5)?.netCash ?? 0,
  ];
}

function npv(rate: number, cashFlows: number[]): number {
  return cashFlows.reduce(
    (acc, cf, t) => acc + cf / Math.pow(1 + rate, t),
    0,
  );
}

function npvDerivative(rate: number, cashFlows: number[]): number {
  return cashFlows.reduce(
    (acc, cf, t) => (t === 0 ? acc : acc - (t * cf) / Math.pow(1 + rate, t + 1)),
    0,
  );
}

/** Solves for IRR via Newton-Raphson with a bisection fallback for robustness. */
export function solveIRR(
  cashFlows: number[],
  guess = 0.1,
): number | null {
  if (cashFlows.length === 0 || cashFlows.every((cf) => cf === 0)) return null;
  const hasPositive = cashFlows.some((cf) => cf > 0);
  const hasNegative = cashFlows.some((cf) => cf < 0);
  if (!hasPositive || !hasNegative) return null;

  let rate = guess;
  const maxIterations = 100;
  const tolerance = 1e-7;

  for (let i = 0; i < maxIterations; i++) {
    const value = npv(rate, cashFlows);
    const derivative = npvDerivative(rate, cashFlows);
    if (Math.abs(derivative) < 1e-12) break;
    const nextRate = rate - value / derivative;
    if (!Number.isFinite(nextRate)) break;
    if (Math.abs(nextRate - rate) < tolerance) {
      return nextRate;
    }
    rate = nextRate;
  }

  if (Number.isFinite(rate) && Math.abs(npv(rate, cashFlows)) < 1) {
    return rate;
  }

  // Bisection fallback across a wide, sane range.
  let low = -0.99;
  let high = 10;
  let lowVal = npv(low, cashFlows);
  const highVal = npv(high, cashFlows);
  if (Number.isNaN(lowVal) || Number.isNaN(highVal) || lowVal * highVal > 0) {
    return null;
  }
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const midVal = npv(mid, cashFlows);
    if (Math.abs(midVal) < 1e-6) return mid;
    if (lowVal * midVal < 0) {
      high = mid;
    } else {
      low = mid;
      lowVal = midVal;
    }
  }
  return (low + high) / 2;
}

export function computeEquityIRRFromScenario(
  scenario: Scenario,
  annual: AnnualResult[],
): number | null {
  const cashFlows = buildEquityCashFlows(scenario, annual);
  return solveIRR(cashFlows);
}

export function computeEquityPaybackYear(
  scenario: Scenario,
  annual: AnnualResult[],
): number | null {
  const cashFlows = buildEquityCashFlows(scenario, annual);
  let cumulative = cashFlows[0];
  const years = [2, 3, 4, 5];
  for (let i = 0; i < years.length; i++) {
    cumulative += cashFlows[i + 1];
    if (cumulative > 0) return years[i];
  }
  return null;
}

export function computeMinDSCR(
  annual: AnnualResult[],
): { minDSCR: number | null; minDSCRYear: number | null } {
  const revenueYears = annual.filter((a) => a.year >= 2 && a.dscr !== null);
  if (revenueYears.length === 0) return { minDSCR: null, minDSCRYear: null };
  const min = revenueYears.reduce((best, a) =>
    (a.dscr as number) < (best.dscr as number) ? a : best,
  );
  return { minDSCR: min.dscr, minDSCRYear: min.year };
}

export function computeSourcesAndUses(scenario: Scenario): SourcesAndUses {
  const { capital, construction, itc } = scenario;
  const sources = {
    cashEquity: capital.cashEquity,
    founderSweatEquity: capital.founderSweatEquity,
    landContribution: capital.landContribution,
    debt: capital.totalDebt,
    itc: itc.amount,
    total: 0,
  };
  sources.total =
    sources.cashEquity +
    sources.founderSweatEquity +
    sources.landContribution +
    sources.debt +
    sources.itc;

  const preRevenueOpex =
    construction.constructionOpexPerMonth *
    construction.constructionDurationMonths;
  const debtServiceReserve = calculateDSRAmount(scenario);

  const uses = {
    hardCapex: construction.hardCapex,
    softCosts: construction.softCosts,
    contingency: construction.contingency,
    preRevenueOpex,
    debtServiceReserve,
    workingCapitalBuffer: construction.workingCapitalBuffer,
    total: 0,
  };
  uses.total =
    uses.hardCapex +
    uses.softCosts +
    uses.contingency +
    uses.preRevenueOpex +
    uses.debtServiceReserve +
    uses.workingCapitalBuffer;

  const surplusOrGap = sources.total - uses.total;

  return {
    sources,
    uses,
    surplusOrGap,
    isFullyFunded: surplusOrGap >= 0,
  };
}

/** Debt Service Reserve sizing: N months of stabilized (interest + straight-line principal) debt service. */
export function calculateDSRAmount(scenario: Scenario): number {
  const { capital, construction } = scenario;
  const amortYears = Math.max(capital.loanTenor - capital.gracePeriod, 0);
  const annualPrincipal =
    amortYears > 0 ? capital.totalDebt / amortYears : 0;
  const annualInterest = capital.totalDebt * capital.interestRate;
  const monthlyDebtService = (annualInterest + annualPrincipal) / 12;
  return monthlyDebtService * construction.debtServiceReserveMonths;
}

export function computeMaxDailyCapacityKg(
  production: ProductionSettings,
  maxTrucksPerDay = 12.5,
): number {
  return maxTrucksPerDay * production.kgPerTruckFill;
}

/** Break-even $/kg price at a reference fleet size (10 trucks/day), assuming default operating days. */
export function computeBreakEvenPricePerKg(
  scenario: Scenario,
  trucksPerDay = 10,
  operatingDays = 84,
): number {
  const { production } = scenario;
  const quarterlyKg = trucksPerDay * production.kgPerTruckFill * operatingDays;
  if (quarterlyKg === 0) return 0;
  const avgAnnualExpenses =
    scenario.quarters.length > 0
      ? sum(scenario.quarters.map((q) => q.annualExpenses)) /
        scenario.quarters.length
      : production.year5PlusAnnualExpenses;
  const quarterlyExpenses = avgAnnualExpenses / 4;
  return production.h2ProductionCostPerKg + quarterlyExpenses / quarterlyKg;
}

export function validateScenario(
  scenario: Scenario,
  annual: AnnualResult[],
  sourcesAndUses: SourcesAndUses,
  equityIRR: number | null,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const isOvercapitalized =
    scenario.capital.totalDebt > sourcesAndUses.uses.total;
  if (isOvercapitalized) {
    errors.push(
      'Overcapitalised — reduce debt or increase CapEx. Total debt exceeds total uses.',
    );
  }

  const fundingGap = sourcesAndUses.surplusOrGap < 0
    ? Math.abs(sourcesAndUses.surplusOrGap)
    : null;
  if (fundingGap !== null) {
    warnings.push(
      `Funding gap of ${Math.round(fundingGap).toLocaleString()} — cannot close as structured.`,
    );
  }

  const dscrWarningYears: number[] = [];
  const dscrDangerYears: number[] = [];
  for (const a of annual) {
    // DSCR covenants are only meaningful once revenue exists; Year 1
    // (construction, no revenue) always shows a negative/undefined ratio.
    if (a.dscr === null || a.year < 2) continue;
    if (a.dscr < DSCR_DANGER) {
      dscrDangerYears.push(a.year);
    } else if (a.dscr < DSCR_TARGET) {
      dscrWarningYears.push(a.year);
    }
  }

  const irrBelowThreshold = equityIRR !== null && equityIRR < IRR_MIN_THRESHOLD;
  if (irrBelowThreshold) {
    warnings.push('Equity IRR is below the minimum 8% investor threshold.');
  }

  const expectedConstructionMonths = 15;
  if (
    scenario.construction.constructionDurationMonths !==
    expectedConstructionMonths
  ) {
    warnings.push(
      `Construction duration is ${scenario.construction.constructionDurationMonths}mo; model assumes Year 1 (12mo) + Y2Q1 (3mo) = 15mo.`,
    );
  }

  return {
    isOvercapitalized,
    fundingGap,
    dscrWarningYears,
    dscrDangerYears,
    irrBelowThreshold,
    errors,
    warnings,
  };
}

export function runModel(scenario: Scenario): ModelOutputs {
  const quarters = computeQuarterlyModel(scenario);
  const annual = computeAnnualSummary(scenario, quarters);
  const sourcesAndUses = computeSourcesAndUses(scenario);
  const equityIRR = computeEquityIRRFromScenario(scenario, annual);
  const equityPaybackYear = computeEquityPaybackYear(scenario, annual);
  const { minDSCR, minDSCRYear } = computeMinDSCR(annual);

  const totalInterestPaid = sum(quarters.map((q) => q.interest));
  const noItcQuarters = computeQuarterlyModel(scenario, 0);
  const totalInterestPaidNoITC = sum(noItcQuarters.map((q) => q.interest));
  const interestSavedFromITC = totalInterestPaidNoITC - totalInterestPaid;

  const netDebtAfterITC =
    quarters.length > 0 ? quarters[quarters.length - 1].closingDebtBalance : 0;

  const validation = validateScenario(scenario, annual, sourcesAndUses, equityIRR);

  return {
    quarters,
    annual,
    sourcesAndUses,
    totalRevenue5yr: sum(annual.map((a) => a.revenue)),
    totalNetCash5yr: sum(annual.map((a) => a.netCash)),
    equityIRR,
    equityPaybackYear,
    minDSCR,
    minDSCRYear,
    interestSavedFromITC,
    totalInterestPaid,
    totalInterestPaidNoITC,
    netDebtAfterITC,
    validation,
  };
}

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/**
 * Projects the debt schedule (independent of revenue) until the balance
 * reaches zero, returning the year/quarter of payoff. Used to compare
 * payoff timing with vs. without the ITC. Returns null if the debt never
 * fully amortizes within a generous 50-year cap (e.g. no principal is
 * ever scheduled).
 */
export function computeDebtPayoffQuarter(
  scenario: Scenario,
  itcOverrideAmount?: number,
): YearQuarter | null {
  const { capital, itc } = scenario;
  const itcAmount = itcOverrideAmount ?? itc.amount;
  const itcQuarterIndex = findITCQuarterIndex(itc.receivedInYear);
  const amortYears = Math.max(capital.loanTenor - capital.gracePeriod, 0);
  const scheduledQuarterlyPrincipal =
    amortYears > 0 ? (capital.totalDebt / amortYears) * 0.25 : 0;
  const principalStartYear = capital.gracePeriod + 2;

  let opening = capital.totalDebt;
  const maxQuarters = 200;

  for (let index = 0; index < maxQuarters; index++) {
    const year = Math.floor(index / 4) + 1;
    const quarter = (index % 4) + 1;

    let principal = year >= principalStartYear ? scheduledQuarterlyPrincipal : 0;
    principal = Math.min(principal, opening);

    const itcReceived = index === itcQuarterIndex ? itcAmount : 0;
    const itcAppliedToDebt =
      itcReceived > 0 && itc.appliedTo === 'debt'
        ? Math.min(itcReceived, opening - principal)
        : 0;

    const closing = Math.max(opening - principal - itcAppliedToDebt, 0);

    if (closing <= 0 && opening > 0) {
      return { year, quarter };
    }

    opening = closing;
  }

  return null;
}
