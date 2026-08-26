import { generateId } from '../lib/id';
import type {
  CapexLineItem,
  CapitalStructure,
  ConstructionCosts,
  ExpenseLineItem,
  ITCSettings,
  ModelSettings,
  PeriodRevenueInput,
  PlantSettings,
  RevenueStream,
  Scenario,
} from './types';

export const DEFAULT_CAPITAL: CapitalStructure = {
  cashEquity: 5_000_000,
  founderSweatEquity: 500_000,
  landContribution: 400_000,
  totalDebt: 8_750_000,
  interestRate: 0.07,
  loanTenor: 10,
  gracePeriod: 1,
};

export const DEFAULT_CONSTRUCTION: ConstructionCosts = {
  constructionOpexPerMonth: 30_000,
  constructionDurationMonths: 15,
  debtServiceReserveMonths: 3,
  workingCapitalBuffer: 200_000,
};

export const DEFAULT_ITC: ITCSettings = {
  amount: 4_000_000,
  receivedInYear: 2,
  appliedTo: 'debt',
};

export const DEFAULT_PLANT: PlantSettings = {
  maxDailyCapacityKg: 1_000,
};

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  totalYears: 15,
  quarterlyYears: 5,
};

/**
 * Builds the period template (quarters for years 2..quarterlyYears, one
 * annual period per year for quarterlyYears+1..totalYears) for the default
 * revenue stream, using the same Year 2-5 ramp values validated in earlier
 * releases and a flat steady-state continuation through Year 15.
 */
function createDefaultStreamPeriods(modelSettings: ModelSettings): PeriodRevenueInput[] {
  const { quarterlyYears, totalYears } = modelSettings;
  const quarterlyRamp: Record<
    number,
    { trucks: number; days: number; price: number }
  > = {
    2: { trucks: 11, days: 92, price: 19 },
    3: { trucks: 10, days: 83, price: 13.5 },
    4: { trucks: 12, days: 92, price: 16 },
    5: { trucks: 12, days: 92, price: 12 },
  };

  const periods: PeriodRevenueInput[] = [];

  for (let year = 2; year <= quarterlyYears; year++) {
    const ramp = quarterlyRamp[year] ?? quarterlyRamp[5];
    const quarters = year === 2 ? [2, 3, 4] : [1, 2, 3, 4];
    for (const quarter of quarters) {
      periods.push({
        year,
        quarter,
        trucksPerDay: ramp.trucks,
        dailyQuantityKg: ramp.trucks * 80,
        operatingDays: ramp.days,
        pricePerKg: ramp.price,
      });
    }
  }

  for (let year = quarterlyYears + 1; year <= totalYears; year++) {
    periods.push({
      year,
      quarter: null,
      trucksPerDay: 12,
      dailyQuantityKg: 12 * 80,
      operatingDays: 355,
      pricePerKg: 12,
    });
  }

  return periods;
}

export function createDefaultRevenueStream(modelSettings: ModelSettings): RevenueStream {
  return {
    id: generateId(),
    name: 'Truck Fleet — Class 8 FCET',
    offtakeMode: 'trucks',
    kgPerTruckFill: 80,
    h2ProductionCostPerKg: 2.41,
    startYear: 2,
    periods: createDefaultStreamPeriods(modelSettings),
  };
}

export function createDefaultExpenseLineItems(): ExpenseLineItem[] {
  return [
    {
      id: generateId(),
      name: 'Payroll & Benefits',
      category: 'payroll',
      startYear: 2,
      baseAnnualAmount: 600_000,
      escalation: { type: 'percentGrowth', growthRate: 0.03 },
      yearOverrides: {},
    },
    {
      id: generateId(),
      name: 'General & Administrative',
      category: 'ga',
      startYear: 2,
      baseAnnualAmount: 150_000,
      escalation: { type: 'percentGrowth', growthRate: 0.02 },
      yearOverrides: {},
    },
    {
      id: generateId(),
      name: 'Property & Liability Insurance',
      category: 'insurance',
      startYear: 2,
      baseAnnualAmount: 90_000,
      escalation: { type: 'percentGrowth', growthRate: 0.025 },
      yearOverrides: {},
    },
    {
      id: generateId(),
      name: 'Repairs & Maintenance',
      category: 'maintenance',
      startYear: 2,
      baseAnnualAmount: 0,
      escalation: { type: 'percentOfRevenue', percentOfRevenue: 0.025 },
      yearOverrides: {},
    },
    {
      id: generateId(),
      name: 'Facility Utilities (non-production)',
      category: 'utilities',
      startYear: 2,
      baseAnnualAmount: 60_000,
      escalation: { type: 'percentGrowth', growthRate: 0.02 },
      yearOverrides: {},
    },
    {
      id: generateId(),
      name: 'Sales & Marketing',
      category: 'salesMarketing',
      startYear: 2,
      baseAnnualAmount: 80_000,
      escalation: { type: 'flat' },
      yearOverrides: {},
    },
    {
      id: generateId(),
      name: 'Professional & Legal Fees',
      category: 'professionalFees',
      startYear: 2,
      baseAnnualAmount: 120_000,
      escalation: { type: 'flat' },
      yearOverrides: {},
    },
    {
      id: generateId(),
      name: 'Other Operating Expenses',
      category: 'other',
      startYear: 2,
      baseAnnualAmount: 50_000,
      escalation: { type: 'flat' },
      yearOverrides: {},
    },
  ];
}

/**
 * Detailed CapEx line items replacing the old flat Hard CapEx/Soft
 * Costs/Contingency lump sums — same totals ($10M/$1M/$750k), but now spread
 * across the construction window (most of the equipment spend lands in
 * Year 1, with the balance carrying into Year 2) to show how phased
 * construction spending is entered.
 */
export function createDefaultCapexLineItems(): CapexLineItem[] {
  return [
    {
      id: generateId(),
      name: 'Electrolyzer & Balance of Plant',
      category: 'hardCapex',
      startYear: 1,
      baseAnnualAmount: 0,
      escalation: { type: 'manual' },
      yearOverrides: { 1: 8_500_000, 2: 1_500_000 },
    },
    {
      id: generateId(),
      name: 'Engineering, Permitting & Soft Costs',
      category: 'softCosts',
      startYear: 1,
      baseAnnualAmount: 0,
      escalation: { type: 'manual' },
      yearOverrides: { 1: 1_000_000 },
    },
    {
      id: generateId(),
      name: 'Construction Contingency',
      category: 'contingency',
      startYear: 1,
      baseAnnualAmount: 0,
      escalation: { type: 'manual' },
      yearOverrides: { 1: 750_000 },
    },
  ];
}

export function createDefaultScenario(name = 'Base Case'): Scenario {
  const modelSettings = { ...DEFAULT_MODEL_SETTINGS };
  return {
    id: generateId(),
    name,
    createdAt: new Date(),
    capital: { ...DEFAULT_CAPITAL },
    construction: { ...DEFAULT_CONSTRUCTION },
    itc: { ...DEFAULT_ITC },
    plant: { ...DEFAULT_PLANT },
    modelSettings,
    revenueStreams: [createDefaultRevenueStream(modelSettings)],
    expenseLineItems: createDefaultExpenseLineItems(),
    capexLineItems: createDefaultCapexLineItems(),
  };
}
