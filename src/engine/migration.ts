import { generateId } from '../lib/id';
import {
  DEFAULT_CAPITAL,
  DEFAULT_CONSTRUCTION,
  DEFAULT_ITC,
  DEFAULT_PLANT,
  createDefaultScenario,
} from './defaults';
import type {
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

/**
 * A scenario shape from before the multi-stream-revenue / line-item-expense
 * rewrite: a single `production` block + a flat `quarters` array (each
 * quarter carrying its own `annualExpenses`, applied identically to every
 * quarter in that year).
 */
interface LegacyScenario {
  id?: string;
  name?: string;
  createdAt?: string | Date;
  capital?: Partial<CapitalStructure>;
  construction?: Partial<ConstructionCosts>;
  itc?: Partial<ITCSettings>;
  production?: {
    offtakeMode?: 'trucks' | 'direct';
    kgPerTruckFill?: number;
    maxDailyCapacityKg?: number;
    h2ProductionCostPerKg?: number;
  };
  quarters?: Array<{
    year: number;
    quarter: number;
    trucksPerDay?: number;
    dailyQuantityKg?: number;
    operatingDays?: number;
    pricePerKg?: number;
    annualExpenses?: number;
  }>;
}

function isLegacyScenario(raw: unknown): raw is LegacyScenario {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    'quarters' in raw &&
    'production' in raw &&
    !('revenueStreams' in raw)
  );
}

function isCurrentShapeScenario(raw: unknown): raw is Scenario {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    'revenueStreams' in raw &&
    'expenseLineItems' in raw &&
    'modelSettings' in raw
  );
}

/**
 * Converts a pre-rewrite scenario (single production block + flat quarters
 * array) into the current shape: one revenue stream carrying the exact same
 * per-quarter volume/price inputs, and one 'manual' expense line item whose
 * yearOverrides reproduce the old per-year annualExpenses figures exactly —
 * so a migrated scenario computes identical results to what the user saw
 * before, just in the new, more flexible structure.
 */
function convertLegacyScenario(raw: LegacyScenario): Scenario {
  const production = raw.production ?? {};
  const offtakeMode = production.offtakeMode ?? 'trucks';
  const kgPerTruckFill = production.kgPerTruckFill ?? 80;
  const quarters = raw.quarters ?? [];

  const periods: PeriodRevenueInput[] = quarters.map((q) => ({
    year: q.year,
    quarter: q.quarter,
    trucksPerDay: q.trucksPerDay ?? 0,
    dailyQuantityKg: q.dailyQuantityKg ?? (q.trucksPerDay ?? 0) * kgPerTruckFill,
    operatingDays: q.operatingDays ?? 0,
    pricePerKg: q.pricePerKg ?? 0,
  }));

  const years = [...new Set(quarters.map((q) => q.year))];
  const maxYear = years.length > 0 ? Math.max(...years) : 5;

  const yearOverrides: Record<number, number> = {};
  for (const year of years) {
    const match = quarters.find((q) => q.year === year && typeof q.annualExpenses === 'number');
    if (match) yearOverrides[year] = match.annualExpenses as number;
  }

  const revenueStream: RevenueStream = {
    id: generateId(),
    name: 'Primary Offtake (migrated)',
    offtakeMode,
    kgPerTruckFill,
    h2ProductionCostPerKg: production.h2ProductionCostPerKg ?? 2.41,
    startYear: 2,
    periods,
  };

  const expenseLineItem: ExpenseLineItem = {
    id: generateId(),
    name: 'Company Expenses (migrated)',
    category: 'other',
    startYear: 2,
    baseAnnualAmount: 0,
    escalation: { type: 'manual' },
    yearOverrides,
  };

  const modelSettings: ModelSettings = {
    totalYears: Math.max(maxYear, 5),
    quarterlyYears: Math.max(maxYear, 5),
  };

  const plant: PlantSettings = {
    maxDailyCapacityKg: production.maxDailyCapacityKg ?? DEFAULT_PLANT.maxDailyCapacityKg,
  };

  return {
    id: raw.id ?? generateId(),
    name: raw.name ?? 'Migrated Scenario',
    createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
    capital: { ...DEFAULT_CAPITAL, ...raw.capital },
    construction: { ...DEFAULT_CONSTRUCTION, ...raw.construction },
    itc: { ...DEFAULT_ITC, ...raw.itc },
    plant,
    modelSettings,
    revenueStreams: [revenueStream],
    expenseLineItems: [expenseLineItem],
  };
}

/** Defensive backfill for a scenario that's already the current shape, in case future fields get added. */
function backfillCurrentShape(raw: Scenario): Scenario {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    plant: { ...DEFAULT_PLANT, ...raw.plant },
    revenueStreams: (raw.revenueStreams ?? []).map((s) => ({
      ...s,
      periods: (s.periods ?? []).map((p) => ({
        ...p,
        dailyQuantityKg: p.dailyQuantityKg ?? p.trucksPerDay * s.kgPerTruckFill,
      })),
    })),
    expenseLineItems: (raw.expenseLineItems ?? []).map((item) => ({
      ...item,
      yearOverrides: item.yearOverrides ?? {},
    })),
  };
}

/**
 * Migrates any persisted scenario — old shape or current — into a valid,
 * complete current-shape Scenario. Never throws (falls back to a fresh
 * default rather than losing the whole store) and never silently drops a
 * scenario's identity (id/name/createdAt are preserved whenever present).
 */
export function migrateScenario(raw: unknown): Scenario {
  try {
    if (isCurrentShapeScenario(raw)) {
      return backfillCurrentShape(raw);
    }
    if (isLegacyScenario(raw)) {
      return convertLegacyScenario(raw);
    }
  } catch (e) {
    console.error('Failed to migrate a persisted scenario, recovering with defaults:', e);
  }

  const legacyLike = raw as LegacyScenario | undefined;
  const fresh = createDefaultScenario(legacyLike?.name ?? 'Recovered Scenario');
  return {
    ...fresh,
    id: legacyLike?.id ?? fresh.id,
    createdAt: legacyLike?.createdAt ? new Date(legacyLike.createdAt) : fresh.createdAt,
  };
}
