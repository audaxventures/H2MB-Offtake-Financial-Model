import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createDefaultScenario } from '@/engine/defaults';
import type {
  CapitalStructure,
  ConstructionCosts,
  ITCSettings,
  ProductionSettings,
  QuarterInput,
  Scenario,
} from '@/engine/types';

export const MAX_SAVED_SCENARIOS = 5;
export const MAX_COMPARE_SCENARIOS = 3;

function cloneScenario(scenario: Scenario): Scenario {
  return {
    ...scenario,
    id: crypto.randomUUID(),
    createdAt: new Date(),
    capital: { ...scenario.capital },
    construction: { ...scenario.construction },
    itc: { ...scenario.itc },
    production: { ...scenario.production },
    quarters: scenario.quarters.map((q) => ({ ...q })),
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
  updateProduction: (patch: Partial<ProductionSettings>) => void;
  updateQuarter: (
    year: number,
    quarter: number,
    patch: Partial<QuarterInput>,
  ) => void;
  setYearAnnualExpenses: (year: number, annualExpenses: number) => void;
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

      updateProduction: (patch) =>
        set((state) => ({
          current: {
            ...state.current,
            production: { ...state.current.production, ...patch },
          },
        })),

      updateQuarter: (year, quarter, patch) =>
        set((state) => ({
          current: {
            ...state.current,
            quarters: state.current.quarters.map((q) =>
              q.year === year && q.quarter === quarter ? { ...q, ...patch } : q,
            ),
          },
        })),

      setYearAnnualExpenses: (year, annualExpenses) =>
        set((state) => ({
          current: {
            ...state.current,
            quarters: state.current.quarters.map((q) =>
              q.year === year ? { ...q, annualExpenses } : q,
            ),
          },
        })),

      setCurrentName: (name) =>
        set((state) => ({ current: { ...state.current, name } })),

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
          id: crypto.randomUUID(),
          createdAt: new Date(),
          name: resolvedName,
        };
        set({ savedScenarios: [...savedScenarios, toSave], current: toSave });
        return { ok: true };
      },

      loadScenario: (id) => {
        const scenario = get().savedScenarios.find((s) => s.id === id);
        if (!scenario) return;
        set({
          current: {
            ...scenario,
            capital: { ...scenario.capital },
            construction: { ...scenario.construction },
            itc: { ...scenario.itc },
            production: { ...scenario.production },
            quarters: scenario.quarters.map((q) => ({ ...q })),
          },
        });
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
          savedScenarios: state.savedScenarios.map((s) =>
            s.id === id ? { ...s, name } : s,
          ),
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
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.current = {
          ...state.current,
          createdAt: new Date(state.current.createdAt),
        };
        state.savedScenarios = state.savedScenarios.map((s) => ({
          ...s,
          createdAt: new Date(s.createdAt),
        }));
      },
    },
  ),
);
