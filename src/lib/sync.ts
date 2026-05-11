import { writable } from 'svelte/store';
import { getPendingSync, clearPendingSync, saveWorkout, getDB } from './db';
import type { User, WorkoutSet, Workout } from './types';

type SyncState = {
  syncing: boolean;
  lastSync: number | null;
  error: string | null;
  hasPending: boolean;
};

export const syncStore = writable<SyncState>({
  syncing: false,
  lastSync: null,
  error: null,
  hasPending: false,
});

const API_BASE = '/api';
let syncToServerInFlight: Promise<void> | null = null;
let syncToServerNeedsRerun = false;

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

export function markSyncPending(): void {
  syncStore.update((s) => ({ ...s, hasPending: true }));
}

export async function refreshSyncStatus(): Promise<void> {
  try {
    const pending = await getPendingSync();
    syncStore.update((s) => ({ ...s, hasPending: pending.length > 0 }));
  } catch {
    // keep previous state if local db status can't be read
  }
}

export async function syncToServer(user: User): Promise<void> {
  if (!navigator.onLine) return;
  if (syncToServerInFlight) {
    syncToServerNeedsRerun = true;
    return syncToServerInFlight;
  }
  syncToServerInFlight = (async () => {
  syncStore.update((s) => ({ ...s, syncing: true, error: null }));
  try {
    do {
      syncToServerNeedsRerun = false;
      const pending = await getPendingSync();
      for (const item of pending) {
        try {
          if (item.type === 'set') {
            if (item.operation === 'upsert') {
              const res = await apiFetch('/sets', user, {
                method: 'POST',
                body: JSON.stringify({ sets: [item.data] }),
              });
              if (!res.ok) throw new Error(`Sync failed (${res.status})`);
            } else if (item.operation === 'delete') {
              const res = await apiFetch(`/sets/${item.id}`, user, { method: 'DELETE' });
              if (!res.ok) throw new Error(`Sync failed (${res.status})`);
            }
          } else if (item.type === 'workout') {
            if (item.operation === 'upsert') {
              const res = await apiFetch('/workouts', user, {
                method: 'POST',
                body: JSON.stringify(item.data),
              });
              if (!res.ok) throw new Error(`Sync failed (${res.status})`);
            } else if (item.operation === 'delete') {
              const res = await apiFetch(`/workouts/${item.id}`, user, { method: 'DELETE' });
              if (!res.ok) throw new Error(`Sync failed (${res.status})`);
            }
          }
          await clearPendingSync(item.id);
        } catch {
          // Continue with next item
        }
      }
    } while (syncToServerNeedsRerun);
    syncStore.update((s) => ({ ...s, lastSync: Date.now() }));
  } catch (e) {
    syncStore.update((s) => ({ ...s, error: e instanceof Error ? e.message : 'Sync failed' }));
  } finally {
    await refreshSyncStatus();
    syncStore.update((s) => ({ ...s, syncing: false }));
    syncToServerInFlight = null;
  }
  })();
  return syncToServerInFlight;
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
        // saveSetsLocal skips pendingSync to avoid re-uploading what we just downloaded
        const db = await (await import('./db')).getDB();
        const tx = db.transaction('sets', 'readwrite');
        await Promise.all([...sets.map((s) => tx.objectStore('sets').put(s)), tx.done]);
      }
    }
    if (workoutsRes.ok) {
      const { workouts }: { workouts: Workout[] } = await workoutsRes.json();
      if (workouts?.length) {
        // queueSync=false — don't re-queue data we just downloaded
        for (const w of workouts) await saveWorkout(w, false);
      }
    }
    syncStore.update((s) => ({ ...s, lastSync: Date.now() }));
  } catch (e) {
    syncStore.update((s) => ({ ...s, error: e instanceof Error ? e.message : 'Sync failed' }));
  } finally {
    await refreshSyncStatus();
    syncStore.update((s) => ({ ...s, syncing: false }));
  }
}

export function setupSyncListeners(user: User): () => void {
  const handleOnline = async () => {
    try {
      await syncToServer(user);
      await syncFromServer(user);
    } catch {
      // ignored
    }
  };
  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}
