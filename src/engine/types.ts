export interface CapitalStructure {
  cashEquity: number;
  founderSweatEquity: number;
  landContribution: number;
  totalDebt: number;
  interestRate: number;
  loanTenor: number;
  gracePeriod: number;
}

export interface ConstructionCosts {
  constructionOpexPerMonth: number;
  constructionDurationMonths: number;
  debtServiceReserveMonths: number;
  workingCapitalBuffer: number;
}

export type ITCApplication = 'debt' | 'reserve' | 'opex';

/**
 * 'fixed': amount is entered directly.
 * 'percentOfEligibleCapex': amount is computed as percentOfEligibleCapex ×
 * (sum of CapexLineItems tagged itcEligible, across all years, plus
 * additionalEligibleCostAmount) — see computeITCEligibleBase/computeITCAmount.
 */
export type ITCMode = 'fixed' | 'percentOfEligibleCapex';

export interface ITCSettings {
  mode: ITCMode;
  /** Used when mode === 'fixed'. */
  amount: number;
  /** Used when mode === 'percentOfEligibleCapex'. */
  percentOfEligibleCapex: number;
  /**
   * Additional dollars eligible for the ITC that aren't (and shouldn't be)
   * entered as an actual CapEx line item — e.g. costs already captured
   * elsewhere that would double-count if also added to CapEx. Added to the
   * tagged-CapEx total to form the eligible base; only used when
   * mode === 'percentOfEligibleCapex'.
   */
  additionalEligibleCostAmount: number;
  receivedInYear: number;
  /** null = auto (first non-construction quarter of receivedInYear, or its last quarter if the whole year is construction); 1-4 targets a specific quarter — only meaningful when receivedInYear is within the quarterly-detail window. */
  receivedInQuarter: number | null;
  appliedTo: ITCApplication;
}

/** Shared, plant-level (not per-stream) physical constraints. */
export interface PlantSettings {
  maxDailyCapacityKg: number;
}

/**
 * Model horizon. The first `quarterlyYears` years are modeled at quarterly
 * granularity (matching the original construction + ramp detail); the
 * remaining years through `totalYears` are modeled as single annual
 * periods. Internally both are "periods" — see ModelPeriod.
 */
export interface ModelSettings {
  totalYears: number;
  quarterlyYears: number;
}

/**
 * 'trucks': volume is derived from trucksPerDay × kgPerTruckFill (Class 8 FCET
 * offtake, the original H2MB use case).
 * 'direct': volume is a directly-entered daily quantity (e.g. a fixed-volume
 * offtake agreement with a datacentre or other stationary customer).
 */
export type OfftakeMode = 'trucks' | 'direct';

/** One quarter (years 1..quarterlyYears) or one full year (years quarterlyYears+1..totalYears) of a revenue stream's inputs. */
export interface PeriodRevenueInput {
  year: number;
  quarter: number | null;
  trucksPerDay: number;
  dailyQuantityKg: number;
  operatingDays: number;
  pricePerKg: number;
}

/**
 * A single named offtake arrangement (e.g. "Truck Fleet — Carrier A",
 * "Datacentre B Direct Supply"). A scenario can have multiple concurrent
 * streams, each with its own offtake mode, production economics, start
 * year, and per-period volume/price inputs; total revenue is the sum
 * across all streams.
 */
export interface RevenueStream {
  id: string;
  name: string;
  offtakeMode: OfftakeMode;
  kgPerTruckFill: number;
  h2ProductionCostPerKg: number;
  /** First year this stream can generate revenue (still gated by the global construction window). */
  startYear: number;
  periods: PeriodRevenueInput[];
}

export type ExpenseCategory =
  | 'cogs'
  | 'payroll'
  | 'ga'
  | 'salesMarketing'
  | 'rd'
  | 'insurance'
  | 'maintenance'
  | 'utilities'
  | 'professionalFees'
  | 'other';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  cogs: 'Cost of Goods Sold (additional)',
  payroll: 'Payroll & Benefits',
  ga: 'General & Administrative',
  salesMarketing: 'Sales & Marketing',
  rd: 'Research & Development',
  insurance: 'Insurance',
  maintenance: 'Repairs & Maintenance',
  utilities: 'Utilities',
  professionalFees: 'Professional & Legal Fees',
  other: 'Other Operating Expenses',
};

/**
 * 'flat': the same annual amount every year from startYear on.
 * 'percentGrowth': baseAnnualAmount compounding at growthRate per year.
 * 'percentOfRevenue': percentOfRevenue × that year's total revenue (all streams).
 * 'manual': the annual amount must be set per-year via yearOverrides; years
 * without an explicit override are treated as $0 (useful for one-time or
 * irregular items, e.g. a single capital overhaul in Year 8).
 */
export type EscalationType = 'flat' | 'percentGrowth' | 'percentOfRevenue' | 'manual';

export interface EscalationConfig {
  type: EscalationType;
  growthRate?: number;
  percentOfRevenue?: number;
}

/**
 * Shared shape for any line item whose annual dollar amount is resolved by
 * `resolveLineItemAnnualAmount()` from baseAnnualAmount + escalation, with
 * yearOverrides taking precedence when present. Both operating expense line
 * items and CapEx line items are built on this.
 */
export interface EscalatedLineItem {
  startYear: number;
  baseAnnualAmount: number;
  escalation: EscalationConfig;
  yearOverrides: Record<number, number>;
}

/**
 * A single line-item expense (e.g. "Salaries & Benefits", "Property
 * Insurance"). Rolls into the operating P&L under its category.
 */
export interface ExpenseLineItem extends EscalatedLineItem {
  id: string;
  name: string;
  category: ExpenseCategory;
}

export type CapexCategory = 'hardCapex' | 'softCosts' | 'contingency' | 'other';

export const CAPEX_CATEGORY_LABELS: Record<CapexCategory, string> = {
  hardCapex: 'Hard CapEx (Equipment & Construction)',
  softCosts: 'Soft Costs (Engineering, Permitting, etc.)',
  contingency: 'Contingency',
  other: 'Other Capital Costs',
};

/**
 * A single detailed capital cost item (e.g. "Electrolyzer Package", "EPC
 * Contract", "Site Preparation"). Unlike operating expenses, CapEx is
 * capitalized rather than expensed — it funds Sources & Uses and the
 * depreciation base, not EBITDA — but is still spread across whichever
 * year(s) the money is actually spent (typically the construction window),
 * via the same escalation/yearOverrides mechanism as ExpenseLineItem. Most
 * CapEx items use 'manual' escalation with explicit per-year overrides,
 * since capital spending is lumpy rather than a smooth annual run-rate.
 * itcEligible flags whether this item counts toward the ITC-eligible CapEx
 * base when ITCSettings.mode is 'percentOfEligibleCapex' — not every CapEx
 * category qualifies for the credit.
 */
export interface CapexLineItem extends EscalatedLineItem {
  id: string;
  name: string;
  category: CapexCategory;
  itcEligible: boolean;
}

/** How a role's per-FTE salary changes year to year. ('percentOfRevenue' from EscalationType isn't offered for roles — salary isn't naturally revenue-linked.) */
export type SalaryEscalationType = Extract<EscalationType, 'flat' | 'percentGrowth' | 'manual'>;

export interface SalaryEscalationConfig {
  type: SalaryEscalationType;
  growthRate?: number;
}

/**
 * A single headcount role (e.g. "Plant Manager", "Operations Technician")
 * used to build up the Payroll & Benefits cost from an actual hiring plan
 * rather than a single escalating dollar figure. headcountByYear tracks how
 * many FTEs are in this role in each year (0 where not yet hired), so
 * growth and timing are explicit and independent of salary timing.
 *
 * Per-FTE salary is resolved by `computeRoleAnnualSalary()`: flat, growing
 * at salaryEscalation.growthRate per year from baseSalaryYear, or exact
 * salaries entered per year via salaryYearOverrides (a raise). Unlike
 * ExpenseLineItem/CapexLineItem's startYear, baseSalaryYear is only a
 * reference point for the growth calculation — it never zeroes out salary
 * before it, since headcountByYear already fully controls which years this
 * role costs anything.
 *
 * Annual cost per year is headcount × resolvedSalary × (1 + benefitsPct);
 * it rolls into the 'payroll' expense category alongside (additively with)
 * any manual ExpenseLineItems of that category.
 */
export interface EmployeeRole {
  id: string;
  title: string;
  baseSalaryYear: number;
  baseAnnualSalary: number;
  salaryEscalation: SalaryEscalationConfig;
  salaryYearOverrides: Record<number, number>;
  benefitsPct: number;
  headcountByYear: Record<number, number>;
}

export interface Scenario {
  id: string;
  name: string;
  createdAt: Date;
  capital: CapitalStructure;
  construction: ConstructionCosts;
  itc: ITCSettings;
  plant: PlantSettings;
  modelSettings: ModelSettings;
  revenueStreams: RevenueStream[];
  expenseLineItems: ExpenseLineItem[];
  employeeRoles: EmployeeRole[];
  capexLineItems: CapexLineItem[];
}

/** A single quarter (years 1..quarterlyYears) or year (beyond) on the model timeline. */
export interface ModelPeriod {
  index: number;
  year: number;
  quarter: number | null;
  label: string;
  periodsPerYear: number;
  periodFraction: number;
  isConstruction: boolean;
}

export interface StreamPeriodResult {
  streamId: string;
  streamName: string;
  revenue: number;
  cogs: number;
  dailyQuantityKg: number;
  operatingDays: number;
  pricePerKg: number;
}

export interface PeriodResult extends ModelPeriod {
  isITCPeriod: boolean;
  revenue: number;
  cogs: number;
  grossProfit: number;
  streamBreakdown: StreamPeriodResult[];
  preRevenueOpex: number;
  expensesByCategory: Partial<Record<ExpenseCategory, number>>;
  totalOperatingExpenses: number;
  capexSpend: number;
  capexByCategory: Partial<Record<CapexCategory, number>>;
  ebitda: number;
  openingDebtBalance: number;
  interest: number;
  principal: number;
  itcReceived: number;
  closingDebtBalance: number;
  netCash: number;
  cumulativeCF: number;
  dscr: number | null;
}

export interface AnnualResult {
  year: number;
  isConstruction: boolean;
  isPartialRevenue: boolean;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number | null;
  preRevenueOpex: number;
  expensesByCategory: Partial<Record<ExpenseCategory, number>>;
  totalOperatingExpenses: number;
  capexSpend: number;
  capexByCategory: Partial<Record<CapexCategory, number>>;
  cumulativeCapexSpend: number;
  ebitda: number;
  ebitdaMarginPct: number | null;
  depreciation: number;
  ebit: number;
  interest: number;
  /** EBIT − Interest: the P&L bottom line (excludes principal repayment and ITC, neither of which is a P&L item). */
  netIncome: number;
  netIncomeMarginPct: number | null;
  principal: number;
  itcReceived: number;
  extraPrincipalFromITC: number;
  totalDebtService: number;
  dscr: number | null;
  dscrHeadroom: number | null;
  netCash: number;
  cumulativeCF: number;
  closingDebtBalance: number;
  /** Full 3-section Cash Flow Statement (indirect method), independent of the equity-IRR-focused netCash/cumulativeCF above. */
  cashFromOperations: number;
  cashFromInvesting: number;
  cashFromFinancing: number;
  netChangeInCash: number;
  endingCashBalance: number;
}

export interface SourcesAndUses {
  sources: {
    cashEquity: number;
    founderSweatEquity: number;
    landContribution: number;
    debt: number;
    itc: number;
    total: number;
  };
  uses: {
    hardCapex: number;
    softCosts: number;
    contingency: number;
    otherCapex: number;
    preRevenueOpex: number;
    debtServiceReserve: number;
    workingCapitalBuffer: number;
    total: number;
  };
  surplusOrGap: number;
  isFullyFunded: boolean;
}

export interface ModelOutputs {
  periods: PeriodResult[];
  annual: AnnualResult[];
  sourcesAndUses: SourcesAndUses;
  totalRevenueAllYears: number;
  totalNetCashAllYears: number;
  equityIRR: number | null;
  equityPaybackYear: number | null;
  minDSCR: number | null;
  minDSCRYear: number | null;
  interestSavedFromITC: number;
  totalInterestPaid: number;
  totalInterestPaidNoITC: number;
  netDebtAfterITC: number;
  validation: ValidationResult;
}

export interface ValidationResult {
  isOvercapitalized: boolean;
  fundingGap: number | null;
  dscrWarningYears: number[];
  dscrDangerYears: number[];
  irrBelowThreshold: boolean;
  errors: string[];
  warnings: string[];
}
