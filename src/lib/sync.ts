import { writable } from 'svelte/store';
import { getPendingSync, clearPendingSync, getAllSets, saveWorkout } from './db';
import type { User, WorkoutSet, Workout } from './types';

export const syncStore = writable<{ syncing: boolean; lastSync: number | null; error: string | null }>({
  syncing: false,
  lastSync: null,
  error: null,
});

const API_BASE = '/api';

async function apiFetch(path: string, user: User, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.token}`,
      ...(options.headers as Record<string, string>),
    },
  });
}

export async function syncToServer(user: User): Promise<void> {
  if (!navigator.onLine) return;
  syncStore.update((s) => ({ ...s, syncing: true, error: null }));
  try {
    const pending = await getPendingSync();
    for (const item of pending) {
      try {
        if (item.type === 'set') {
          if (item.operation === 'upsert') {
            await apiFetch('/sets', user, {
              method: 'POST',
              body: JSON.stringify({ sets: [item.data] }),
            });
          } else if (item.operation === 'delete') {
            await apiFetch(`/sets/${item.id}`, user, { method: 'DELETE' });
          }
        } else if (item.type === 'workout' && item.operation === 'upsert') {
          await apiFetch('/workouts', user, {
            method: 'POST',
            body: JSON.stringify(item.data),
          });
        }
        await clearPendingSync(item.id);
      } catch {
        // Continue with next item
      }
    }
    syncStore.update((s) => ({ ...s, lastSync: Date.now() }));
  } catch (e) {
    syncStore.update((s) => ({ ...s, error: e instanceof Error ? e.message : 'Sync failed' }));
  } finally {
    syncStore.update((s) => ({ ...s, syncing: false }));
  }
}

export async function syncFromServer(user: User): Promise<void> {
  if (!navigator.onLine) return;
  syncStore.update((s) => ({ ...s, syncing: true, error: null }));
  try {
    const [setsRes, workoutsRes] = await Promise.all([
      apiFetch('/sets', user),
      apiFetch('/workouts', user),
    ]);
    if (setsRes.ok) {
      const { sets }: { sets: WorkoutSet[] } = await setsRes.json();
      if (sets?.length) {
        const { saveSets } = await import('./db');
        await saveSets(sets);
      }
    }
    if (workoutsRes.ok) {
      const { workouts }: { workouts: Workout[] } = await workoutsRes.json();
      if (workouts?.length) {
        for (const w of workouts) await saveWorkout(w);
      }
    }
    syncStore.update((s) => ({ ...s, lastSync: Date.now() }));
  } catch (e) {
    syncStore.update((s) => ({ ...s, error: e instanceof Error ? e.message : 'Sync failed' }));
  } finally {
    syncStore.update((s) => ({ ...s, syncing: false }));
  }
}

export function setupSyncListeners(user: User): () => void {
  const handleOnline = () => {
    syncToServer(user);
    syncFromServer(user);
  };
  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}
