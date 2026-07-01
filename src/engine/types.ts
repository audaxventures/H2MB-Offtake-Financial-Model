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
  hardCapex: number;
  softCosts: number;
  contingency: number;
  constructionOpexPerMonth: number;
  constructionDurationMonths: number;
  debtServiceReserveMonths: number;
  workingCapitalBuffer: number;
}

export type ITCApplication = 'debt' | 'reserve' | 'opex';

export interface ITCSettings {
  amount: number;
  receivedInYear: number;
  appliedTo: ITCApplication;
}

export interface QuarterInput {
  year: number;
  quarter: number;
  trucksPerDay: number;
  operatingDays: number;
  pricePerKg: number;
  annualExpenses: number;
}

export interface ProductionSettings {
  kgPerTruckFill: number;
  h2ProductionCostPerKg: number;
  expenseEscalationRate: number;
  year5PlusPricePerKg: number;
  year5PlusAnnualExpenses: number;
}

export interface Scenario {
  id: string;
  name: string;
  createdAt: Date;
  capital: CapitalStructure;
  construction: ConstructionCosts;
  itc: ITCSettings;
  production: ProductionSettings;
  quarters: QuarterInput[];
}

export interface QuarterResult {
  index: number;
  year: number;
  quarter: number;
  label: string;
  isConstruction: boolean;
  isITCQuarter: boolean;
  trucksPerDay: number;
  operatingDays: number;
  pricePerKg: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  quarterlyExpenses: number;
  annualExpensesBudget: number;
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
  companyExpenses: number;
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
    preRevenueOpex: number;
    debtServiceReserve: number;
    workingCapitalBuffer: number;
    total: number;
  };
  surplusOrGap: number;
  isFullyFunded: boolean;
}

export interface ModelOutputs {
  quarters: QuarterResult[];
  annual: AnnualResult[];
  sourcesAndUses: SourcesAndUses;
  totalRevenue5yr: number;
  totalNetCash5yr: number;
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
