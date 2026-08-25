import { describe, it, expect } from 'vitest';
import { migrateScenario } from './migration';
import { runModel } from './calculations';

describe('legacy migration', () => {
  it('converts an old quarters/production scenario into revenueStreams + expenseLineItems with equivalent results', () => {
    const legacy = {
      id: 'old-1',
      name: 'Old Scenario',
      createdAt: '2024-01-01T00:00:00.000Z',
      capital: { cashEquity: 5000000, founderSweatEquity: 500000, landContribution: 400000, totalDebt: 8750000, interestRate: 0.07, loanTenor: 10, gracePeriod: 1 },
      construction: { hardCapex: 10000000, softCosts: 1000000, contingency: 750000, constructionOpexPerMonth: 30000, constructionDurationMonths: 15, debtServiceReserveMonths: 3, workingCapitalBuffer: 200000 },
      itc: { amount: 4000000, receivedInYear: 2, appliedTo: 'debt' },
      production: { offtakeMode: 'trucks', kgPerTruckFill: 80, maxDailyCapacityKg: 1000, h2ProductionCostPerKg: 2.41 },
      quarters: [
        { year: 2, quarter: 2, trucksPerDay: 11, dailyQuantityKg: 880, operatingDays: 92, pricePerKg: 19, annualExpenses: 850000 },
        { year: 2, quarter: 3, trucksPerDay: 11, dailyQuantityKg: 880, operatingDays: 92, pricePerKg: 19, annualExpenses: 850000 },
        { year: 2, quarter: 4, trucksPerDay: 11, dailyQuantityKg: 880, operatingDays: 92, pricePerKg: 19, annualExpenses: 850000 },
        { year: 3, quarter: 1, trucksPerDay: 10, dailyQuantityKg: 800, operatingDays: 83, pricePerKg: 13.5, annualExpenses: 1345000 },
        { year: 3, quarter: 2, trucksPerDay: 10, dailyQuantityKg: 800, operatingDays: 83, pricePerKg: 13.5, annualExpenses: 1345000 },
        { year: 3, quarter: 3, trucksPerDay: 10, dailyQuantityKg: 800, operatingDays: 83, pricePerKg: 13.5, annualExpenses: 1345000 },
        { year: 3, quarter: 4, trucksPerDay: 10, dailyQuantityKg: 800, operatingDays: 83, pricePerKg: 13.5, annualExpenses: 1345000 },
      ],
    };

    const migrated = migrateScenario(legacy);
    expect(migrated.id).toBe('old-1');
    expect(migrated.name).toBe('Old Scenario');
    expect(migrated.revenueStreams).toHaveLength(1);
    expect(migrated.revenueStreams[0].periods).toHaveLength(7);
    expect(migrated.expenseLineItems).toHaveLength(1);
    expect(migrated.expenseLineItems[0].yearOverrides).toEqual({ 2: 850000, 3: 1345000 });
    expect(migrated.modelSettings.totalYears).toBeGreaterThanOrEqual(5);

    // Should compute without throwing and produce sane, non-zero Year 3 revenue.
    const outputs = runModel(migrated);
    const year3 = outputs.annual.find((a) => a.year === 3)!;
    expect(year3.revenue).toBeCloseTo(800 * 13.5 * 83 * 4, 6);
  });

  it('recovers gracefully (fresh default) from unrecognizable/corrupt data without throwing', () => {
    expect(() => migrateScenario({ garbage: true })).not.toThrow();
    expect(() => migrateScenario(null)).not.toThrow();
    expect(() => migrateScenario(undefined)).not.toThrow();
    const recovered = migrateScenario({ garbage: true });
    expect(recovered.revenueStreams.length).toBeGreaterThan(0);
  });

  it('is a no-op (structurally) on an already-current-shape scenario, just backfilling defensively', () => {
    const legacy = { revenueStreams: [], expenseLineItems: [], modelSettings: { totalYears: 15, quarterlyYears: 5 }, plant: {}, capital: {}, construction: {}, itc: {}, id: 'x', name: 'y', createdAt: new Date().toISOString() };
    const migrated = migrateScenario(legacy);
    expect(migrated.id).toBe('x');
    expect(migrated.plant.maxDailyCapacityKg).toBeGreaterThan(0);
  });
});
