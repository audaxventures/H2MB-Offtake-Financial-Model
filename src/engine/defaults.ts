import { createDefaultQuarters } from './calculations';
import type {
  CapitalStructure,
  ConstructionCosts,
  ITCSettings,
  ProductionSettings,
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
  hardCapex: 10_000_000,
  softCosts: 1_000_000,
  contingency: 750_000,
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

export const DEFAULT_PRODUCTION: ProductionSettings = {
  kgPerTruckFill: 80,
  h2ProductionCostPerKg: 2.41,
  expenseEscalationRate: 0.025,
  year5PlusPricePerKg: 12.0,
  year5PlusAnnualExpenses: 1_000_000,
};

export function createDefaultScenario(name = 'Base Case'): Scenario {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date(),
    capital: { ...DEFAULT_CAPITAL },
    construction: { ...DEFAULT_CONSTRUCTION },
    itc: { ...DEFAULT_ITC },
    production: { ...DEFAULT_PRODUCTION },
    quarters: createDefaultQuarters(DEFAULT_PRODUCTION),
  };
}
