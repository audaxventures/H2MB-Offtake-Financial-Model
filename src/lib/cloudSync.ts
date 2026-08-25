import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useScenarioStore } from '@/store/scenarioStore';
import { fetchCloudState, saveCloudState, ApiError } from '@/lib/api';
import { migrateScenario } from '@/engine/migration';
import type { Scenario } from '@/engine/types';

const SYNC_DEBOUNCE_MS = 1500;

interface CloudBlob {
  current: unknown;
  savedScenarios: unknown[];
  compareIds: string[];
  darkMode: boolean;
}

export type SyncStatus = 'loading' | 'synced' | 'syncing' | 'error' | 'offline';

/**
 * Pulls the signed-in user's saved data from Neon on login, then keeps it in
 * sync: any change to the scenario store is pushed back up (debounced) so
 * the same account sees current data from any device.
 */
export function useCloudSync(): SyncStatus {
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const [status, setStatus] = useState<SyncStatus>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('offline');
      return;
    }

    let cancelled = false;
    let hydrated = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    setStatus('loading');

    fetchCloudState(token)
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          const cloud = data as CloudBlob;
          useScenarioStore.setState({
            current: migrateScenario(cloud.current) as Scenario,
            savedScenarios: (cloud.savedScenarios ?? []).map(migrateScenario),
            compareIds: cloud.compareIds ?? [],
            darkMode: cloud.darkMode ?? false,
          });
        }
        hydrated = true;
        setStatus('synced');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          logout();
          return;
        }
        console.error('Failed to load cloud data, continuing with local copy:', err);
        hydrated = true;
        setStatus('error');
      });

    const unsubscribe = useScenarioStore.subscribe((state) => {
      if (!hydrated) return;
      if (timer) clearTimeout(timer);
      setStatus('syncing');
      timer = setTimeout(() => {
        const { current, savedScenarios, compareIds, darkMode } = state;
        saveCloudState(token, { current, savedScenarios, compareIds, darkMode })
          .then(() => {
            if (!cancelled) setStatus('synced');
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            if (err instanceof ApiError && err.status === 401) {
              logout();
              return;
            }
            console.error('Failed to sync to cloud:', err);
            setStatus('error');
          });
      }, SYNC_DEBOUNCE_MS);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [token, logout]);

  return status;
}
