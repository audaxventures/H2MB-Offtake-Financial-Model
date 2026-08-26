import type {
  AnnualResult,
  AnnualStreamResult,
  CapexCategory,
  EmployeeRole,
  EscalatedLineItem,
  EscalationConfig,
  ExpenseCategory,
  ModelOutputs,
  ModelPeriod,
  ModelSettings,
  PeriodResult,
  PeriodRevenueInput,
  RevenueStream,
  Scenario,
  SourcesAndUses,
  StreamPeriodResult,
  ValidationResult,
} from './types';

export const DSCR_TARGET = 1.25;
export const DSCR_DANGER = 0.8;
export const IRR_MIN_THRESHOLD = 0.08;
export const IRR_INVESTOR_HURDLE = 0.15;
export const DEPRECIATION_LIFE_YEARS = 20;
export const DEPRECIATION_SALVAGE_PCT = 0.05;

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function periodLabel(year: number, quarter: number | null): string {
  return quarter === null ? `Y${year}` : `Y${year}Q${quarter}`;
}

/**
 * Builds the raw period timeline (no construction flag yet): quarterly
 * periods for years 1..quarterlyYears, then one annual period per year
 * from quarterlyYears+1..totalYears.
 */
export function generatePeriods(modelSettings: ModelSettings): ModelPeriod[] {
  const { totalYears, quarterlyYears } = modelSettings;
  const periods: ModelPeriod[] = [];
  let index = 0;

  for (let year = 1; year <= quarterlyYears; year++) {
    for (let quarter = 1; quarter <= 4; quarter++) {
      periods.push({
        index,
        year,
        quarter,
        label: periodLabel(year, quarter),
        periodsPerYear: 4,
        periodFraction: 0.25,
        isConstruction: false,
      });
      index++;
    }
  }
  for (let year = quarterlyYears + 1; year <= totalYears; year++) {
    periods.push({
      index,
      year,
      quarter: null,
      label: periodLabel(year, null),
      periodsPerYear: 1,
      periodFraction: 1,
      isConstruction: false,
    });
    index++;
  }
  return periods;
}

/**
 * Marks the leading periods as construction (no revenue), based on
 * constructionDurationMonths converted to quarter-equivalents (e.g. 15
 * months = 5 quarter-equivalents = Y1Q1-Q4 + Y2Q1 at the default
 * quarterly granularity). Generalizes correctly even if construction
 * spills into an annual period (each annual period = 4 quarter-equivalents).
 */
export function markConstructionPeriods(
  periods: ModelPeriod[],
  constructionDurationMonths: number,
): ModelPeriod[] {
  const constructionQuarterEquivalents = Math.round(constructionDurationMonths / 3);
  let elapsed = 0;
  return periods.map((p) => {
    const isConstruction = elapsed < constructionQuarterEquivalents;
    elapsed += p.periodsPerYear === 4 ? 1 : 4;
    return { ...p, isConstruction };
  });
}

export function buildPeriods(scenario: Scenario): ModelPeriod[] {
  return markConstructionPeriods(
    generatePeriods(scenario.modelSettings),
    scenario.construction.constructionDurationMonths,
  );
}

/** First year with any non-construction period (when the plant first has revenue). */
export function firstOperatingYear(periods: ModelPeriod[]): number {
  return periods.find((p) => !p.isConstruction)?.year ?? 2;
}

export function findQuarterlyPeriodInput(
  stream: RevenueStream,
  year: number,
  quarter: number | null,
): PeriodRevenueInput | undefined {
  return stream.periods.find((p) => p.year === year && p.quarter === quarter);
}

/** The daily H2 volume (kg/day) a stream's period input resolves to, per its offtake mode. */
export function streamPeriodDailyKg(stream: RevenueStream, input: PeriodRevenueInput): number {
  return stream.offtakeMode === 'direct'
    ? input.dailyQuantityKg
    : input.trucksPerDay * stream.kgPerTruckFill;
}

function computeStreamPeriodResult(
  stream: RevenueStream,
  period: ModelPeriod,
): StreamPeriodResult {
  const zero: StreamPeriodResult = {
    streamId: stream.id,
    streamName: stream.name,
    product: stream.product,
    revenue: 0,
    cogs: 0,
    dailyQuantityKg: 0,
    operatingDays: 0,
    pricePerKg: 0,
  };
  if (period.isConstruction || period.year < stream.startYear) return zero;

  const input = findQuarterlyPeriodInput(stream, period.year, period.quarter);
  if (!input) return zero;

  const dailyKg = streamPeriodDailyKg(stream, input);
  const revenue = dailyKg * input.pricePerKg * input.operatingDays;
  const cogs = stream.h2ProductionCostPerKg * dailyKg * input.operatingDays;

  return {
    streamId: stream.id,
    streamName: stream.name,
    product: stream.product,
    revenue,
    cogs,
    dailyQuantityKg: dailyKg,
    operatingDays: input.operatingDays,
    pricePerKg: input.pricePerKg,
  };
}

/**
 * Resolves the ANNUAL dollar amount for a line item in a given year.
 * yearOverrides always take precedence; otherwise the escalation config
 * is applied against baseAnnualAmount (or, for 'percentOfRevenue', against
 * that year's total revenue across all streams). Works for both operating
 * expense line items and CapEx line items, since both share the
 * EscalatedLineItem shape.
 */
export function resolveLineItemAnnualAmount(
  item: EscalatedLineItem,
  year: number,
  totalRevenueForYear: number,
): number {
  if (year < item.startYear) return 0;
  if (item.yearOverrides[year] !== undefined) return item.yearOverrides[year];

  const escalation: EscalationConfig = item.escalation;
  switch (escalation.type) {
    case 'flat':
      return item.baseAnnualAmount;
    case 'percentGrowth': {
      const yearsElapsed = year - item.startYear;
      const rate = escalation.growthRate ?? 0;
      return item.baseAnnualAmount * Math.pow(1 + rate, yearsElapsed);
    }
    case 'percentOfRevenue':
      return (escalation.percentOfRevenue ?? 0) * totalRevenueForYear;
    case 'manual':
      return 0;
    default:
      return item.baseAnnualAmount;
  }
}

/** Headcount for a role in a given year (0 where not yet hired / not entered). */
export function roleHeadcountForYear(role: EmployeeRole, year: number): number {
  return role.headcountByYear[year] ?? 0;
}

/**
 * A role's per-FTE salary in a given year: flat, growing at
 * salaryEscalation.growthRate per year from baseSalaryYear, or an exact
 * manually-entered salary for that year. Unlike resolveLineItemAnnualAmount,
 * this never zeroes out based on year — headcountByYear alone controls
 * which years this role costs anything, so a role hired before its
 * baseSalaryYear (or with a growth rate referencing a later year) still
 * resolves a sensible salary.
 */
export function computeRoleAnnualSalary(role: EmployeeRole, year: number): number {
  if (role.salaryYearOverrides[year] !== undefined) return role.salaryYearOverrides[year];

  switch (role.salaryEscalation.type) {
    case 'percentGrowth': {
      const yearsElapsed = year - role.baseSalaryYear;
      const rate = role.salaryEscalation.growthRate ?? 0;
      return role.baseAnnualSalary * Math.pow(1 + rate, yearsElapsed);
    }
    case 'manual':
      return role.baseAnnualSalary;
    case 'flat':
    default:
      return role.baseAnnualSalary;
  }
}

/** A role's fully-loaded annual cost in a given year: headcount × resolved salary × (1 + benefits%). */
export function computeRoleAnnualCost(role: EmployeeRole, year: number): number {
  return roleHeadcountForYear(role, year) * computeRoleAnnualSalary(role, year) * (1 + role.benefitsPct);
}

/** Total fully-loaded payroll cost across all employee roles in a given year. */
export function computePayrollFromRoles(roles: EmployeeRole[], year: number): number {
  return sum(roles.map((r) => computeRoleAnnualCost(r, year)));
}

/**
 * The period (in timeline order) in which the ITC is received. When
 * receivedInQuarter is set and receivedInYear falls within the quarterly
 * window, targets that exact quarter; otherwise falls back to the first
 * non-construction quarter of the year, or its last quarter if the whole
 * year is construction (receivedInQuarter has no effect on an annual period,
 * since annual periods don't have quarters).
 */
export function findITCPeriodIndex(
  periods: ModelPeriod[],
  receivedInYear: number,
  receivedInQuarter: number | null,
): number {
  if (receivedInQuarter !== null) {
    const exactIndex = periods.findIndex(
      (p) => p.year === receivedInYear && p.quarter === receivedInQuarter,
    );
    if (exactIndex !== -1) return exactIndex;
  }

  const firstRevenueInYear = periods.findIndex(
    (p) => p.year === receivedInYear && !p.isConstruction,
  );
  if (firstRevenueInYear !== -1) return firstRevenueInYear;

  let lastIndexInYear = -1;
  periods.forEach((p, idx) => {
    if (p.year === receivedInYear) lastIndexInYear = idx;
  });
  return lastIndexInYear !== -1 ? lastIndexInYear : 0;
}

/**
 * Total revenue per year (all streams), needed up-front for
 * 'percentOfRevenue' expense/CapEx line items.
 */
export function computeRevenueByYear(scenario: Scenario): Map<number, number> {
  const periods = buildPeriods(scenario);
  const revenueByYear = new Map<number, number>();
  for (const period of periods) {
    const periodRevenue = sum(
      scenario.revenueStreams.map((s) => computeStreamPeriodResult(s, period).revenue),
    );
    revenueByYear.set(period.year, (revenueByYear.get(period.year) ?? 0) + periodRevenue);
  }
  return revenueByYear;
}

/** Total CapEx booked in each category (summed across all years) — used for Sources & Uses and the depreciation base. */
export function computeCapexByCategory(scenario: Scenario): Partial<Record<CapexCategory, number>> {
  const revenueByYear = computeRevenueByYear(scenario);
  const totals: Partial<Record<CapexCategory, number>> = {};
  for (const item of scenario.capexLineItems) {
    for (let year = 1; year <= scenario.modelSettings.totalYears; year++) {
      const amount = resolveLineItemAnnualAmount(item, year, revenueByYear.get(year) ?? 0);
      if (amount === 0) continue;
      totals[item.category] = (totals[item.category] ?? 0) + amount;
    }
  }
  return totals;
}

export function computeTotalCapex(scenario: Scenario): number {
  return sum(Object.values(computeCapexByCategory(scenario)));
}

/** Total Project CapEx minus the Contingency category — i.e. what construction is budgeted to cost before the contingency buffer. */
export function computeBaseCapexBeforeContingency(scenario: Scenario): number {
  const byCategory = computeCapexByCategory(scenario);
  return computeTotalCapex(scenario) - (byCategory.contingency ?? 0);
}

/** Sum of all CapEx tagged itcEligible (across all years) plus any additionalEligibleCostAmount — the base the ITC % is applied to in 'percentOfEligibleCapex' mode. */
export function computeITCEligibleBase(scenario: Scenario): number {
  const revenueByYear = computeRevenueByYear(scenario);
  let total = scenario.itc.additionalEligibleCostAmount;
  for (const item of scenario.capexLineItems) {
    if (!item.itcEligible) continue;
    for (let year = 1; year <= scenario.modelSettings.totalYears; year++) {
      total += resolveLineItemAnnualAmount(item, year, revenueByYear.get(year) ?? 0);
    }
  }
  return total;
}

/** Resolves the actual ITC dollar amount from ITCSettings, regardless of mode. */
export function computeITCAmount(scenario: Scenario): number {
  if (scenario.itc.mode === 'percentOfEligibleCapex') {
    return scenario.itc.percentOfEligibleCapex * computeITCEligibleBase(scenario);
  }
  return scenario.itc.amount;
}

/**
 * Runs the full period-by-period cash flow / debt schedule across the
 * scenario's whole model horizon (quarterly through quarterlyYears, then
 * annual through totalYears).
 * @param itcOverrideAmount optional override, used internally to compute the "no ITC" counterfactual.
 */
export function computeModelPeriods(
  scenario: Scenario,
  itcOverrideAmount?: number,
): PeriodResult[] {
  const { capital, construction, itc, revenueStreams, expenseLineItems, capexLineItems, employeeRoles } = scenario;
  const periods = buildPeriods(scenario);
  const itcAmount = itcOverrideAmount ?? computeITCAmount(scenario);
  const itcPeriodIndex = findITCPeriodIndex(periods, itc.receivedInYear, itc.receivedInQuarter);

  const amortYears = Math.max(capital.loanTenor - capital.gracePeriod, 0);
  const annualScheduledPrincipal = amortYears > 0 ? capital.totalDebt / amortYears : 0;
  const principalStartYear = capital.gracePeriod + 2;

  const revenueByYear = computeRevenueByYear(scenario);

  let openingDebtBalance = capital.totalDebt;
  let cumulativeCF = 0;
  const results: PeriodResult[] = [];

  for (const period of periods) {
    const streamBreakdown = revenueStreams.map((s) => computeStreamPeriodResult(s, period));
    const streamRevenue = sum(streamBreakdown.map((s) => s.revenue));
    const streamCogs = sum(streamBreakdown.map((s) => s.cogs));

    // Construction-phase overhead (constructionOpexPerMonth) is an optional,
    // additive lump sum for pre-revenue months — separate from categorized
    // expense line items, which apply in every year they're eligible for
    // (per their own startYear) regardless of construction status. A user
    // who'd rather model pre-revenue costs as explicit line items can leave
    // constructionOpexPerMonth at $0 without losing anything.
    let preRevenueOpex = 0;
    if (period.isConstruction) {
      const monthsInPeriod = period.periodsPerYear === 4 ? 3 : 12;
      preRevenueOpex = construction.constructionOpexPerMonth * monthsInPeriod;
    }

    const expensesByCategory: Partial<Record<ExpenseCategory, number>> = {};
    const annualRevenueForYear = revenueByYear.get(period.year) ?? 0;
    for (const item of expenseLineItems) {
      const annualAmount = resolveLineItemAnnualAmount(item, period.year, annualRevenueForYear);
      if (annualAmount === 0) continue;
      const periodAmount = annualAmount * period.periodFraction;
      expensesByCategory[item.category] = (expensesByCategory[item.category] ?? 0) + periodAmount;
    }
    // Headcount-based payroll (from Employee Roles) adds to the 'payroll'
    // category alongside any manual payroll expense line items.
    const roleAnnualPayroll = computePayrollFromRoles(employeeRoles, period.year);
    if (roleAnnualPayroll !== 0) {
      const periodAmount = roleAnnualPayroll * period.periodFraction;
      expensesByCategory.payroll = (expensesByCategory.payroll ?? 0) + periodAmount;
    }

    const cogsFromLineItems = expensesByCategory.cogs ?? 0;
    const revenue = streamRevenue;
    const cogs = streamCogs + cogsFromLineItems;
    const grossProfit = revenue - cogs;
    const totalOperatingExpenses = sum(
      Object.entries(expensesByCategory)
        .filter(([category]) => category !== 'cogs')
        .map(([, amount]) => amount ?? 0),
    );
    const ebitda = grossProfit - totalOperatingExpenses - preRevenueOpex;

    // CapEx is capitalized, not expensed — it funds Sources & Uses and the
    // depreciation base (see computeAnnualSummary), not EBITDA. Tracked here
    // purely so the timing of capital spend can be shown to the user.
    const capexByCategory: Partial<Record<CapexCategory, number>> = {};
    let capexSpend = 0;
    {
      const annualRevenueForYear = revenueByYear.get(period.year) ?? 0;
      for (const item of capexLineItems) {
        const annualAmount = resolveLineItemAnnualAmount(item, period.year, annualRevenueForYear);
        if (annualAmount === 0) continue;
        const periodAmount = annualAmount * period.periodFraction;
        capexByCategory[item.category] = (capexByCategory[item.category] ?? 0) + periodAmount;
        capexSpend += periodAmount;
      }
    }

    const interest = openingDebtBalance * capital.interestRate * period.periodFraction;
    let principal =
      period.year >= principalStartYear ? annualScheduledPrincipal * period.periodFraction : 0;
    principal = Math.min(principal, openingDebtBalance);

    const isITCPeriod = period.index === itcPeriodIndex;
    const itcReceived = isITCPeriod ? itcAmount : 0;
    let itcAppliedToDebt = 0;
    if (itcReceived > 0 && itc.appliedTo === 'debt') {
      itcAppliedToDebt = Math.min(itcReceived, openingDebtBalance - principal);
    }

    const closingDebtBalance = Math.max(openingDebtBalance - principal - itcAppliedToDebt, 0);
    const itcToCash = itc.appliedTo === 'debt' ? 0 : itcReceived;
    const netCash = ebitda - interest - principal + itcToCash;
    cumulativeCF += netCash;

    const debtService = interest + principal;
    const dscr = debtService > 0 ? ebitda / debtService : null;

    results.push({
      ...period,
      isITCPeriod,
      revenue,
      cogs,
      grossProfit,
      streamBreakdown,
      preRevenueOpex,
      expensesByCategory,
      totalOperatingExpenses,
      capexSpend,
      capexByCategory,
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
  }

  return results;
}

export function computeAnnualSummary(
  scenario: Scenario,
  periods: PeriodResult[],
): AnnualResult[] {
  const totalCapex = computeTotalCapex(scenario);
  const annualDepreciation =
    (totalCapex * (1 - DEPRECIATION_SALVAGE_PCT)) / DEPRECIATION_LIFE_YEARS;
  const firstOpYear = firstOperatingYear(periods);

  const years: number[] = [];
  for (let y = 1; y <= scenario.modelSettings.totalYears; y++) years.push(y);

  let cumulativeCapexSpend = 0;
  let endingCashBalance = 0;

  return years.map((year) => {
    const yearPeriods = periods.filter((p) => p.year === year);
    const revenue = sum(yearPeriods.map((p) => p.revenue));
    const cogs = sum(yearPeriods.map((p) => p.cogs));
    const grossProfit = revenue - cogs;

    const streamBreakdownMap = new Map<string, AnnualStreamResult>();
    for (const p of yearPeriods) {
      for (const s of p.streamBreakdown) {
        const existing = streamBreakdownMap.get(s.streamId);
        if (existing) {
          existing.revenue += s.revenue;
          existing.cogs += s.cogs;
        } else {
          streamBreakdownMap.set(s.streamId, { streamId: s.streamId, streamName: s.streamName, revenue: s.revenue, cogs: s.cogs });
        }
      }
    }
    const streamBreakdown = Array.from(streamBreakdownMap.values());
    const ebitda = sum(yearPeriods.map((p) => p.ebitda));
    const interest = sum(yearPeriods.map((p) => p.interest));
    const principal = sum(yearPeriods.map((p) => p.principal));
    const itcReceived = sum(yearPeriods.map((p) => p.itcReceived));
    const extraPrincipalFromITC = scenario.itc.appliedTo === 'debt' ? itcReceived : 0;

    const expensesByCategory: Partial<Record<ExpenseCategory, number>> = {};
    for (const p of yearPeriods) {
      for (const [category, amount] of Object.entries(p.expensesByCategory)) {
        const key = category as ExpenseCategory;
        expensesByCategory[key] = (expensesByCategory[key] ?? 0) + (amount ?? 0);
      }
    }
    const totalOperatingExpenses = sum(yearPeriods.map((p) => p.totalOperatingExpenses));
    const preRevenueOpex = sum(yearPeriods.map((p) => p.preRevenueOpex));

    const capexByCategory: Partial<Record<CapexCategory, number>> = {};
    for (const p of yearPeriods) {
      for (const [category, amount] of Object.entries(p.capexByCategory)) {
        const key = category as CapexCategory;
        capexByCategory[key] = (capexByCategory[key] ?? 0) + (amount ?? 0);
      }
    }
    const capexSpend = sum(yearPeriods.map((p) => p.capexSpend));
    cumulativeCapexSpend += capexSpend;

    const totalDebtService = interest + principal + extraPrincipalFromITC;
    const depreciation = year >= firstOpYear ? annualDepreciation : 0;
    const ebit = ebitda - depreciation;
    const netIncome = ebit - interest;
    const netIncomeMarginPct = revenue > 0 ? netIncome / revenue : null;

    // Full 3-section Cash Flow Statement (indirect method). Debt/equity are
    // modeled as fully drawn/contributed at financial close (Year 1),
    // matching how Sources & Uses funds the project — this engine doesn't
    // model a phased capital draw schedule separate from that.
    const itcToCashFinancing = scenario.itc.appliedTo === 'debt' ? 0 : itcReceived;
    const debtDrawnThisYear = year === 1 ? scenario.capital.totalDebt : 0;
    const equityContributedThisYear =
      year === 1
        ? scenario.capital.cashEquity +
          scenario.capital.founderSweatEquity +
          scenario.capital.landContribution
        : 0;
    const cashFromOperations = netIncome + depreciation;
    const cashFromInvesting = -capexSpend;
    const cashFromFinancing =
      debtDrawnThisYear + equityContributedThisYear - principal - extraPrincipalFromITC + itcToCashFinancing;
    const netChangeInCash = cashFromOperations + cashFromInvesting + cashFromFinancing;
    endingCashBalance += netChangeInCash;

    const netCash = sum(yearPeriods.map((p) => p.netCash));
    const closingDebtBalance =
      yearPeriods.length > 0
        ? yearPeriods[yearPeriods.length - 1].closingDebtBalance
        : scenario.capital.totalDebt;
    const cumulativeCF = yearPeriods.length > 0 ? yearPeriods[yearPeriods.length - 1].cumulativeCF : 0;
    const debtServiceForDscr = interest + principal;
    const dscr = debtServiceForDscr > 0 ? ebitda / debtServiceForDscr : null;

    const isConstruction = yearPeriods.length > 0 && yearPeriods.every((p) => p.isConstruction);
    const isPartialRevenue =
      yearPeriods.some((p) => p.isConstruction) && yearPeriods.some((p) => !p.isConstruction);

    return {
      year,
      isConstruction,
      isPartialRevenue,
      revenue,
      cogs,
      streamBreakdown,
      grossProfit,
      grossMarginPct: revenue > 0 ? grossProfit / revenue : null,
      preRevenueOpex,
      expensesByCategory,
      totalOperatingExpenses,
      capexSpend,
      capexByCategory,
      cumulativeCapexSpend,
      ebitda,
      ebitdaMarginPct: revenue > 0 ? ebitda / revenue : null,
      depreciation,
      ebit,
      interest,
      netIncome,
      netIncomeMarginPct,
      principal,
      itcReceived,
      extraPrincipalFromITC,
      totalDebtService,
      dscr,
      dscrHeadroom: dscr !== null ? dscr - DSCR_TARGET : null,
      netCash,
      cumulativeCF,
      closingDebtBalance,
      cashFromOperations,
      cashFromInvesting,
      cashFromFinancing,
      netChangeInCash,
      endingCashBalance,
    };
  });
}

/** Builds the equity cash flow stream used for IRR/payback: [-cashEquity, yr2Net, yr3Net, ..., yrNNet]. */
export function buildEquityCashFlows(scenario: Scenario, annual: AnnualResult[]): number[] {
  const sorted = [...annual].sort((a, b) => a.year - b.year);
  return [-scenario.capital.cashEquity, ...sorted.slice(1).map((a) => a.netCash)];
}

function npv(rate: number, cashFlows: number[]): number {
  return cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}

function npvDerivative(rate: number, cashFlows: number[]): number {
  return cashFlows.reduce(
    (acc, cf, t) => (t === 0 ? acc : acc - (t * cf) / Math.pow(1 + rate, t + 1)),
    0,
  );
}

/** Solves for IRR via Newton-Raphson with a bisection fallback for robustness. */
export function solveIRR(cashFlows: number[], guess = 0.1): number | null {
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
  return solveIRR(buildEquityCashFlows(scenario, annual));
}

export function computeEquityPaybackYear(
  scenario: Scenario,
  annual: AnnualResult[],
): number | null {
  const cashFlows = buildEquityCashFlows(scenario, annual);
  const sorted = [...annual].sort((a, b) => a.year - b.year);
  let cumulative = cashFlows[0];
  for (let i = 0; i < sorted.length - 1; i++) {
    cumulative += cashFlows[i + 1];
    if (cumulative > 0) return sorted[i + 1].year;
  }
  return null;
}

export function computeMinDSCR(
  annual: AnnualResult[],
): { minDSCR: number | null; minDSCRYear: number | null } {
  const revenueYears = annual.filter((a) => !a.isConstruction && a.dscr !== null);
  if (revenueYears.length === 0) return { minDSCR: null, minDSCRYear: null };
  const min = revenueYears.reduce((best, a) =>
    (a.dscr as number) < (best.dscr as number) ? a : best,
  );
  return { minDSCR: min.dscr, minDSCRYear: min.year };
}

export function computeSourcesAndUses(scenario: Scenario): SourcesAndUses {
  const { capital, construction } = scenario;
  const sources = {
    cashEquity: capital.cashEquity,
    founderSweatEquity: capital.founderSweatEquity,
    landContribution: capital.landContribution,
    debt: capital.totalDebt,
    itc: computeITCAmount(scenario),
    total: 0,
  };
  sources.total =
    sources.cashEquity +
    sources.founderSweatEquity +
    sources.landContribution +
    sources.debt +
    sources.itc;

  const preRevenueOpex =
    construction.constructionOpexPerMonth * construction.constructionDurationMonths;
  const debtServiceReserve = calculateDSRAmount(scenario);
  const capexByCategory = computeCapexByCategory(scenario);

  const uses = {
    hardCapex: capexByCategory.hardCapex ?? 0,
    softCosts: capexByCategory.softCosts ?? 0,
    contingency: capexByCategory.contingency ?? 0,
    otherCapex: capexByCategory.other ?? 0,
    preRevenueOpex,
    debtServiceReserve,
    workingCapitalBuffer: construction.workingCapitalBuffer,
    total: 0,
  };
  uses.total =
    uses.hardCapex +
    uses.softCosts +
    uses.contingency +
    uses.otherCapex +
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
  const annualPrincipal = amortYears > 0 ? capital.totalDebt / amortYears : 0;
  const annualInterest = capital.totalDebt * capital.interestRate;
  const monthlyDebtService = (annualInterest + annualPrincipal) / 12;
  return monthlyDebtService * construction.debtServiceReserveMonths;
}

/** Plant nameplate capacity — a direct input, shared across all offtake streams. */
export function computeMaxDailyCapacityKg(scenario: Scenario): number {
  return scenario.plant.maxDailyCapacityKg;
}

/**
 * Operating break-even $/kg across the modeled revenue horizon: the
 * average price that would exactly cover total COGS + operating expenses
 * at the modeled volumes (ignores debt service, D&A, and taxes).
 */
/**
 * Break-even $/kg of HYDROGEN specifically — total costs recovered per kg of
 * the core product. Other products (e.g. byproduct oxygen) are excluded from
 * the kg denominator so their volume doesn't dilute/mislead this figure,
 * even though their revenue still reduces costs elsewhere in the model.
 */
export function computeBreakEvenPricePerKg(periods: PeriodResult[]): number {
  const revenuePeriods = periods.filter((p) => !p.isConstruction);
  const totalKg = sum(
    revenuePeriods.map((p) =>
      sum(
        p.streamBreakdown
          .filter((s) => s.product === 'hydrogen')
          .map((s) => s.dailyQuantityKg * s.operatingDays),
      ),
    ),
  );
  if (totalKg === 0) return 0;
  const totalCosts = sum(revenuePeriods.map((p) => p.cogs + p.totalOperatingExpenses));
  return totalCosts / totalKg;
}

/**
 * Projects the debt schedule (independent of revenue) in quarters until the
 * balance reaches zero, returning the year/quarter of payoff — used to
 * compare payoff timing with vs. without the ITC. This always simulates at
 * quarterly resolution regardless of the scenario's modelSettings, since it
 * is a standalone debt-only projection. Returns null if the debt never
 * fully amortizes within a generous 50-year cap.
 */
export function computeDebtPayoffQuarter(
  scenario: Scenario,
  itcOverrideAmount?: number,
): { year: number; quarter: number } | null {
  const { capital, construction, itc } = scenario;
  const itcAmount = itcOverrideAmount ?? computeITCAmount(scenario);
  const constructionQuarters = Math.round(construction.constructionDurationMonths / 3);
  const itcQuarterIndex = (() => {
    const yearStartIndex = (itc.receivedInYear - 1) * 4;
    if (itc.receivedInQuarter !== null) return yearStartIndex + (itc.receivedInQuarter - 1);
    for (let q = 0; q < 4; q++) {
      const idx = yearStartIndex + q;
      if (idx >= constructionQuarters) return idx; // first non-construction quarter in that year
    }
    return yearStartIndex + 3; // entirely construction: fall back to the last quarter of the year
  })();
  const amortYears = Math.max(capital.loanTenor - capital.gracePeriod, 0);
  const scheduledQuarterlyPrincipal = amortYears > 0 ? (capital.totalDebt / amortYears) * 0.25 : 0;
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

export function validateScenario(
  scenario: Scenario,
  annual: AnnualResult[],
  sourcesAndUses: SourcesAndUses,
  equityIRR: number | null,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const isOvercapitalized = scenario.capital.totalDebt > sourcesAndUses.uses.total;
  if (isOvercapitalized) {
    errors.push(
      'Overcapitalised — reduce debt or increase CapEx. Total debt exceeds total uses.',
    );
  }

  const fundingGap =
    sourcesAndUses.surplusOrGap < 0 ? Math.abs(sourcesAndUses.surplusOrGap) : null;
  if (fundingGap !== null) {
    warnings.push(
      `Funding gap of ${Math.round(fundingGap).toLocaleString()} — cannot close as structured.`,
    );
  }

  const dscrWarningYears: number[] = [];
  const dscrDangerYears: number[] = [];
  for (const a of annual) {
    if (a.dscr === null || a.isConstruction) continue;
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

  const constructionQuarterEquivalents = Math.round(
    scenario.construction.constructionDurationMonths / 3,
  );
  if (constructionQuarterEquivalents > scenario.modelSettings.quarterlyYears * 4) {
    warnings.push(
      'Construction duration extends beyond the quarterly modeling window; increase "quarterly years" in Model Settings for accurate construction-period detail.',
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
  const periods = computeModelPeriods(scenario);
  const annual = computeAnnualSummary(scenario, periods);
  const sourcesAndUses = computeSourcesAndUses(scenario);
  const equityIRR = computeEquityIRRFromScenario(scenario, annual);
  const equityPaybackYear = computeEquityPaybackYear(scenario, annual);
  const { minDSCR, minDSCRYear } = computeMinDSCR(annual);

  const totalInterestPaid = sum(periods.map((p) => p.interest));
  const noItcPeriods = computeModelPeriods(scenario, 0);
  const totalInterestPaidNoITC = sum(noItcPeriods.map((p) => p.interest));
  const interestSavedFromITC = totalInterestPaidNoITC - totalInterestPaid;

  const netDebtAfterITC = periods.length > 0 ? periods[periods.length - 1].closingDebtBalance : 0;

  const validation = validateScenario(scenario, annual, sourcesAndUses, equityIRR);

  return {
    periods,
    annual,
    sourcesAndUses,
    totalRevenueAllYears: sum(annual.map((a) => a.revenue)),
    totalNetCashAllYears: sum(annual.map((a) => a.netCash)),
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
