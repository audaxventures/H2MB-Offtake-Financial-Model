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

export interface ITCSettings {
  amount: number;
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
 */
export interface CapexLineItem extends EscalatedLineItem {
  id: string;
  name: string;
  category: CapexCategory;
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
  principal: number;
  itcReceived: number;
  extraPrincipalFromITC: number;
  totalDebtService: number;
  dscr: number | null;
  dscrHeadroom: number | null;
  netCash: number;
  cumulativeCF: number;
  closingDebtBalance: number;
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
