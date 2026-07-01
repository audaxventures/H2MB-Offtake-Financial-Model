import { useMemo } from 'react';
import { runModel } from '@/engine/calculations';
import { useScenarioStore } from '@/store/scenarioStore';

export function useModelOutputs() {
  const current = useScenarioStore((s) => s.current);
  return useMemo(() => runModel(current), [current]);
}
