import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createDefaultScenario } from '@/engine/defaults';
import { generatePeriods } from '@/engine/calculations';
import { migrateScenario } from '@/engine/migration';
import { generateId } from '@/lib/id';
import type {
  CapexLineItem,
  CapitalStructure,
  ConstructionCosts,
  EmployeeRole,
  ExpenseLineItem,
  ITCSettings,
  ModelSettings,
  PeriodRevenueInput,
  PlantSettings,
  RevenueStream,
  Scenario,
} from '@/engine/types';

export const MAX_SAVED_SCENARIOS = 5;
export const MAX_COMPARE_SCENARIOS = 3;

/** Deep-copies a scenario's nested objects/arrays, preserving its id/createdAt/name. */
function deepCopyScenario(scenario: Scenario): Scenario {
  return {
    ...scenario,
    capital: { ...scenario.capital },
    construction: { ...scenario.construction },
    itc: { ...scenario.itc },
    plant: { ...scenario.plant },
    modelSettings: { ...scenario.modelSettings },
    revenueStreams: scenario.revenueStreams.map((s) => ({
      ...s,
      periods: s.periods.map((p) => ({ ...p })),
    })),
    expenseLineItems: scenario.expenseLineItems.map((item) => ({
      ...item,
      escalation: { ...item.escalation },
      yearOverrides: { ...item.yearOverrides },
    })),
    capexLineItems: scenario.capexLineItems.map((item) => ({
      ...item,
      escalation: { ...item.escalation },
      yearOverrides: { ...item.yearOverrides },
    })),
    employeeRoles: scenario.employeeRoles.map((role) => ({
      ...role,
      headcountByYear: { ...role.headcountByYear },
    })),
  };
}

/** Deep-copies a scenario as a distinct new entity (fresh id/createdAt), for duplication. */
function cloneScenario(scenario: Scenario): Scenario {
  return {
    ...deepCopyScenario(scenario),
    id: generateId(),
    createdAt: new Date(),
  };
}

const NEW_PERIOD_DEFAULTS: Omit<PeriodRevenueInput, 'year' | 'quarter'> = {
  trucksPerDay: 5,
  dailyQuantityKg: 400,
  operatingDays: 80,
  pricePerKg: 12,
};

/**
 * Rebuilds a revenue stream's periods to match a (possibly changed) model
 * timeline: existing (year, quarter) entries are kept as-is, entries no
 * longer on the timeline are dropped, and newly-added years/quarters are
 * filled in by carrying the last known values forward (falling back to
 * sensible defaults if the stream had no periods at all).
 */
function reconcileStreamPeriods(stream: RevenueStream, modelSettings: ModelSettings): RevenueStream {
  const timeline = generatePeriods(modelSettings);
  const existingByKey = new Map(stream.periods.map((p) => [`${p.year}-${p.quarter}`, p]));
  let lastKnown: Omit<PeriodRevenueInput, 'year' | 'quarter'> =
    stream.periods[stream.periods.length - 1] ?? NEW_PERIOD_DEFAULTS;

  const periods = timeline.map((p) => {
    const existing = existingByKey.get(`${p.year}-${p.quarter}`);
    if (existing) {
      lastKnown = existing;
      return existing;
    }
    return { ...lastKnown, year: p.year, quarter: p.quarter };
  });

  return { ...stream, periods };
}

function createBlankRevenueStream(modelSettings: ModelSettings, index: number): RevenueStream {
  return {
    id: generateId(),
    name: `Revenue Stream ${index}`,
    offtakeMode: 'trucks',
    kgPerTruckFill: 80,
    h2ProductionCostPerKg: 2.41,
    startYear: 2,
    periods: generatePeriods(modelSettings).map((p) => ({ ...NEW_PERIOD_DEFAULTS, year: p.year, quarter: p.quarter })),
  };
}

function createBlankExpenseLineItem(): ExpenseLineItem {
  return {
    id: generateId(),
    name: 'New Expense',
    category: 'other',
    startYear: 2,
    baseAnnualAmount: 0,
    escalation: { type: 'flat' },
    yearOverrides: {},
  };
}

function createBlankCapexLineItem(): CapexLineItem {
  return {
    id: generateId(),
    name: 'New CapEx Item',
    category: 'hardCapex',
    startYear: 1,
    baseAnnualAmount: 0,
    escalation: { type: 'manual' },
    yearOverrides: { 1: 0 },
  };
}

function createBlankEmployeeRole(): EmployeeRole {
  return {
    id: generateId(),
    title: 'New Role',
    annualSalary: 70_000,
    benefitsPct: 0.2,
    headcountByYear: { 2: 1 },
  };
}

interface ScenarioStoreState {
  current: Scenario;
  savedScenarios: Scenario[];
  compareIds: string[];
  darkMode: boolean;

  updateCapital: (patch: Partial<CapitalStructure>) => void;
  updateConstruction: (patch: Partial<ConstructionCosts>) => void;
  updateITC: (patch: Partial<ITCSettings>) => void;
  updatePlant: (patch: Partial<PlantSettings>) => void;
  updateModelSettings: (patch: Partial<ModelSettings>) => void;

  addRevenueStream: () => void;
  removeRevenueStream: (streamId: string) => void;
  updateRevenueStream: (
    streamId: string,
    patch: Partial<Omit<RevenueStream, 'id' | 'periods'>>,
  ) => void;
  updateStreamPeriod: (
    streamId: string,
    year: number,
    quarter: number | null,
    patch: Partial<PeriodRevenueInput>,
  ) => void;

  addExpenseLineItem: () => void;
  removeExpenseLineItem: (itemId: string) => void;
  updateExpenseLineItem: (
    itemId: string,
    patch: Partial<Omit<ExpenseLineItem, 'id' | 'yearOverrides'>>,
  ) => void;
  setLineItemYearOverride: (itemId: string, year: number, value: number | undefined) => void;

  addCapexLineItem: () => void;
  removeCapexLineItem: (itemId: string) => void;
  updateCapexLineItem: (
    itemId: string,
    patch: Partial<Omit<CapexLineItem, 'id' | 'yearOverrides'>>,
  ) => void;
  setCapexLineItemYearOverride: (itemId: string, year: number, value: number | undefined) => void;

  addEmployeeRole: () => void;
  removeEmployeeRole: (roleId: string) => void;
  updateEmployeeRole: (
    roleId: string,
    patch: Partial<Omit<EmployeeRole, 'id' | 'headcountByYear'>>,
  ) => void;
  setRoleHeadcount: (roleId: string, year: number, headcount: number | undefined) => void;

  setCurrentName: (name: string) => void;
  replaceCurrent: (scenario: Scenario) => void;
  resetCurrent: () => void;

  saveScenario: (name?: string) => { ok: boolean; message?: string };
  loadScenario: (id: string) => void;
  duplicateScenario: (id: string) => void;
  deleteScenario: (id: string) => void;
  renameScenario: (id: string, name: string) => void;

  toggleCompare: (id: string) => void;
  clearCompare: () => void;

  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
}

export const useScenarioStore = create<ScenarioStoreState>()(
  persist(
    (set, get) => ({
      current: createDefaultScenario(),
      savedScenarios: [],
      compareIds: [],
      darkMode: false,

      updateCapital: (patch) =>
        set((state) => ({
          current: { ...state.current, capital: { ...state.current.capital, ...patch } },
        })),

      updateConstruction: (patch) =>
        set((state) => ({
          current: {
            ...state.current,
            construction: { ...state.current.construction, ...patch },
          },
        })),

      updateITC: (patch) =>
        set((state) => ({
          current: { ...state.current, itc: { ...state.current.itc, ...patch } },
        })),

      updatePlant: (patch) =>
        set((state) => ({
          current: { ...state.current, plant: { ...state.current.plant, ...patch } },
        })),

      updateModelSettings: (patch) =>
        set((state) => {
          const modelSettings = { ...state.current.modelSettings, ...patch };
          const revenueStreams = state.current.revenueStreams.map((s) =>
            reconcileStreamPeriods(s, modelSettings),
          );
          return { current: { ...state.current, modelSettings, revenueStreams } };
        }),

      addRevenueStream: () =>
        set((state) => ({
          current: {
            ...state.current,
            revenueStreams: [
              ...state.current.revenueStreams,
              createBlankRevenueStream(
                state.current.modelSettings,
                state.current.revenueStreams.length + 1,
              ),
            ],
          },
        })),

      removeRevenueStream: (streamId) =>
        set((state) => ({
          current: {
            ...state.current,
            revenueStreams: state.current.revenueStreams.filter((s) => s.id !== streamId),
          },
        })),

      updateRevenueStream: (streamId, patch) =>
        set((state) => ({
          current: {
            ...state.current,
            revenueStreams: state.current.revenueStreams.map((s) =>
              s.id === streamId ? { ...s, ...patch } : s,
            ),
          },
        })),

      updateStreamPeriod: (streamId, year, quarter, patch) =>
        set((state) => ({
          current: {
            ...state.current,
            revenueStreams: state.current.revenueStreams.map((s) =>
              s.id !== streamId
                ? s
                : {
                    ...s,
                    periods: s.periods.map((p) =>
                      p.year === year && p.quarter === quarter ? { ...p, ...patch } : p,
                    ),
                  },
            ),
          },
        })),

      addExpenseLineItem: () =>
        set((state) => ({
          current: {
            ...state.current,
            expenseLineItems: [...state.current.expenseLineItems, createBlankExpenseLineItem()],
          },
        })),

      removeExpenseLineItem: (itemId) =>
        set((state) => ({
          current: {
            ...state.current,
            expenseLineItems: state.current.expenseLineItems.filter((i) => i.id !== itemId),
          },
        })),

      updateExpenseLineItem: (itemId, patch) =>
        set((state) => ({
          current: {
            ...state.current,
            expenseLineItems: state.current.expenseLineItems.map((i) =>
              i.id === itemId ? { ...i, ...patch } : i,
            ),
          },
        })),

      setLineItemYearOverride: (itemId, year, value) =>
        set((state) => ({
          current: {
            ...state.current,
            expenseLineItems: state.current.expenseLineItems.map((i) => {
              if (i.id !== itemId) return i;
              const yearOverrides = { ...i.yearOverrides };
              if (value === undefined) {
                delete yearOverrides[year];
              } else {
                yearOverrides[year] = value;
              }
              return { ...i, yearOverrides };
            }),
          },
        })),

      addCapexLineItem: () =>
        set((state) => ({
          current: {
            ...state.current,
            capexLineItems: [...state.current.capexLineItems, createBlankCapexLineItem()],
          },
        })),

      removeCapexLineItem: (itemId) =>
        set((state) => ({
          current: {
            ...state.current,
            capexLineItems: state.current.capexLineItems.filter((i) => i.id !== itemId),
          },
        })),

      updateCapexLineItem: (itemId, patch) =>
        set((state) => ({
          current: {
            ...state.current,
            capexLineItems: state.current.capexLineItems.map((i) =>
              i.id === itemId ? { ...i, ...patch } : i,
            ),
          },
        })),

      setCapexLineItemYearOverride: (itemId, year, value) =>
        set((state) => ({
          current: {
            ...state.current,
            capexLineItems: state.current.capexLineItems.map((i) => {
              if (i.id !== itemId) return i;
              const yearOverrides = { ...i.yearOverrides };
              if (value === undefined) {
                delete yearOverrides[year];
              } else {
                yearOverrides[year] = value;
              }
              return { ...i, yearOverrides };
            }),
          },
        })),

      addEmployeeRole: () =>
        set((state) => ({
          current: {
            ...state.current,
            employeeRoles: [...state.current.employeeRoles, createBlankEmployeeRole()],
          },
        })),

      removeEmployeeRole: (roleId) =>
        set((state) => ({
          current: {
            ...state.current,
            employeeRoles: state.current.employeeRoles.filter((r) => r.id !== roleId),
          },
        })),

      updateEmployeeRole: (roleId, patch) =>
        set((state) => ({
          current: {
            ...state.current,
            employeeRoles: state.current.employeeRoles.map((r) =>
              r.id === roleId ? { ...r, ...patch } : r,
            ),
          },
        })),

      setRoleHeadcount: (roleId, year, headcount) =>
        set((state) => ({
          current: {
            ...state.current,
            employeeRoles: state.current.employeeRoles.map((r) => {
              if (r.id !== roleId) return r;
              const headcountByYear = { ...r.headcountByYear };
              if (headcount === undefined) {
                delete headcountByYear[year];
              } else {
                headcountByYear[year] = headcount;
              }
              return { ...r, headcountByYear };
            }),
          },
        })),

      setCurrentName: (name) => set((state) => ({ current: { ...state.current, name } })),

      replaceCurrent: (scenario) => set({ current: scenario }),

      resetCurrent: () => set({ current: createDefaultScenario() }),

      saveScenario: (name) => {
        const { current, savedScenarios } = get();
        const existing = savedScenarios.find((s) => s.id === current.id);
        const resolvedName = name ?? current.name;

        // Only overwrite in place if this is the very scenario we loaded
        // and its name hasn't changed; otherwise treat it as "Save As" so
        // renaming a tweaked scenario never clobbers the original.
        if (existing && existing.name === resolvedName) {
          const toSave: Scenario = { ...current, name: resolvedName };
          const next = savedScenarios.map((s) => (s.id === toSave.id ? toSave : s));
          set({ savedScenarios: next, current: toSave });
          return { ok: true };
        }

        if (savedScenarios.length >= MAX_SAVED_SCENARIOS) {
          return {
            ok: false,
            message: `You can save up to ${MAX_SAVED_SCENARIOS} scenarios. Delete one before saving a new one.`,
          };
        }

        const toSave: Scenario = {
          ...current,
          id: generateId(),
          createdAt: new Date(),
          name: resolvedName,
        };
        set({ savedScenarios: [...savedScenarios, toSave], current: toSave });
        return { ok: true };
      },

      loadScenario: (id) => {
        const scenario = get().savedScenarios.find((s) => s.id === id);
        if (!scenario) return;
        set({ current: deepCopyScenario(scenario) });
      },

      duplicateScenario: (id) => {
        const { savedScenarios } = get();
        const scenario = savedScenarios.find((s) => s.id === id);
        if (!scenario) return;
        if (savedScenarios.length >= MAX_SAVED_SCENARIOS) return;
        const copy = cloneScenario(scenario);
        copy.name = `${scenario.name} (Copy)`;
        set({ savedScenarios: [...savedScenarios, copy] });
      },

      deleteScenario: (id) =>
        set((state) => ({
          savedScenarios: state.savedScenarios.filter((s) => s.id !== id),
          compareIds: state.compareIds.filter((cid) => cid !== id),
        })),

      renameScenario: (id, name) =>
        set((state) => ({
          savedScenarios: state.savedScenarios.map((s) => (s.id === id ? { ...s, name } : s)),
        })),

      toggleCompare: (id) =>
        set((state) => {
          if (state.compareIds.includes(id)) {
            return { compareIds: state.compareIds.filter((cid) => cid !== id) };
          }
          if (state.compareIds.length >= MAX_COMPARE_SCENARIOS) {
            return state;
          }
          return { compareIds: [...state.compareIds, id] };
        }),

      clearCompare: () => set({ compareIds: [] }),

      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
      setDarkMode: (value) => set({ darkMode: value }),
    }),
    {
      name: 'h2mb-scenario-store',
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          // Corrupt/unreadable persisted state must never crash the app or
          // silently wipe the in-memory default — just log and continue.
          console.error('Failed to rehydrate scenario store from localStorage:', error);
          return;
        }
        if (!state) return;
        try {
          state.current = migrateScenario(state.current);
          state.savedScenarios = state.savedScenarios.map(migrateScenario);
        } catch (e) {
          console.error('Failed to migrate persisted scenarios:', e);
        }
      },
    },
  ),
);
