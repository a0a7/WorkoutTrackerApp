import { openDB, type IDBPDatabase } from 'idb';
import type { WorkoutSet, Workout } from './types';

const DB_NAME = 'workout-tracker';
const DB_VERSION = 1;

interface WorkoutDB {
  sets: {
    key: string;
    value: WorkoutSet;
    indexes: { by_workout: string; by_created_at: number };
  };
  workouts: {
    key: string;
    value: Workout;
    indexes: { by_start_time: number };
  };
  pendingSync: {
    key: string;
    value: { id: string; type: 'set' | 'workout'; operation: 'upsert' | 'delete'; data?: unknown; timestamp: number };
    indexes: { by_timestamp: number };
  };
}

let dbInstance: IDBPDatabase<WorkoutDB> | null = null;
export const WORKOUT_GAP_MS = 90 * 60 * 1000; // 1h 30m

export async function initDB(): Promise<IDBPDatabase<WorkoutDB>> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<WorkoutDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sets')) {
        const setsStore = db.createObjectStore('sets', { keyPath: 'id' });
        setsStore.createIndex('by_workout', 'localWorkoutId');
        setsStore.createIndex('by_created_at', 'createdAt');
      }
      if (!db.objectStoreNames.contains('workouts')) {
        const workoutsStore = db.createObjectStore('workouts', { keyPath: 'id' });
        workoutsStore.createIndex('by_start_time', 'startTime');
      }
      if (!db.objectStoreNames.contains('pendingSync')) {
        const pendingStore = db.createObjectStore('pendingSync', { keyPath: 'id' });
        pendingStore.createIndex('by_timestamp', 'timestamp');
      }
    },
  });
  return dbInstance;
}

export async function getDB(): Promise<IDBPDatabase<WorkoutDB>> {
  return initDB();
}

export async function saveSets(sets: WorkoutSet[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['sets', 'pendingSync'], 'readwrite');
  const setsStore = tx.objectStore('sets');
  const syncStore = tx.objectStore('pendingSync');
  const now = Date.now();
  await Promise.all([
    ...sets.map((s) => setsStore.put(s)),
    ...sets.map((s) => syncStore.put({ id: s.id, type: 'set', operation: 'upsert', data: s, timestamp: now })),
    tx.done,
  ]);
}

export async function deleteSet(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['sets', 'pendingSync'], 'readwrite');
  await Promise.all([
    tx.objectStore('sets').delete(id),
    tx.objectStore('pendingSync').put({ id, type: 'set', operation: 'delete', timestamp: Date.now() }),
    tx.done,
  ]);
}

export async function getSetsByWorkoutId(workoutId: string): Promise<WorkoutSet[]> {
  const db = await getDB();
  return db.getAllFromIndex('sets', 'by_workout', workoutId);
}

export async function getSetsCreatedBetween(start: number, end: number): Promise<WorkoutSet[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('sets', 'by_created_at', IDBKeyRange.bound(start, end));
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getAllSets(): Promise<WorkoutSet[]> {
  const db = await getDB();
  const all = await db.getAll('sets');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getTodaySets(): Promise<WorkoutSet[]> {
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  // Include sets from last 24h to catch late-night sessions
  const windowStart = Math.min(startOfDay.getTime(), now - 24 * 60 * 60 * 1000);
  const inWindow = await getSetsCreatedBetween(windowStart, now + 1000);
  const groups = groupSetsIntoWorkouts(inWindow);
  if (groups.length === 0) return [];
  const latest = groups[groups.length - 1];
  const latestSetTime = latest.sets[latest.sets.length - 1]?.createdAt ?? 0;
  if (now - latestSetTime > WORKOUT_GAP_MS) return [];
  return [...latest.sets].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export function groupSetsIntoWorkouts(sets: WorkoutSet[]): Workout[] {
  if (sets.length === 0) return [];
  const sorted = [...sets].sort((a, b) => a.createdAt - b.createdAt);
  const groups: WorkoutSet[][] = [];
  let current: WorkoutSet[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].createdAt - sorted[i - 1].createdAt;
    // Group them if they are close in time OR if they explicitly share the same localWorkoutId
    if (gap <= WORKOUT_GAP_MS || (sorted[i].localWorkoutId && sorted[i].localWorkoutId === sorted[i - 1].localWorkoutId)) {
      current.push(sorted[i]);
    } else {
      groups.push(current);
      current = [sorted[i]];
    }
  }
  groups.push(current);

  return groups.map((group) => {
    const first = group[0];
    const last = group[group.length - 1];
    return {
      id: first.localWorkoutId || `orphan-${first.createdAt}`,
      startTime: first.createdAt - 10 * 60 * 1000,
      endTime: last.createdAt,
      sets: group,
      synced: false,
    };
  });
}

export async function getAllWorkoutGroups(): Promise<Workout[]> {
  const sets = await getAllSets();
  return groupSetsIntoWorkouts(sets);
}

export async function saveWorkout(workout: Workout, queueSync = true): Promise<void> {
  const db = await getDB();
  if (queueSync) {
    const tx = db.transaction(['workouts', 'pendingSync'], 'readwrite');
    await Promise.all([
      tx.objectStore('workouts').put(workout),
      tx.objectStore('pendingSync').put({ id: workout.id, type: 'workout', operation: 'upsert', data: workout, timestamp: Date.now() }),
      tx.done,
    ]);
  } else {
    await db.put('workouts', workout);
  }
}

export async function deleteWorkout(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['workouts', 'sets', 'pendingSync'], 'readwrite');
  const workoutsStore = tx.objectStore('workouts');
  const setsStore = tx.objectStore('sets');
  const pendingStore = tx.objectStore('pendingSync');
  const workoutSets = await setsStore.index('by_workout').getAll(id);

  await Promise.all([
    workoutsStore.delete(id),
    ...workoutSets.map((s) => setsStore.delete(s.id)),
    pendingStore.put({ id, type: 'workout', operation: 'delete', timestamp: Date.now() }),
    ...workoutSets.map((s) => pendingStore.put({ id: s.id, type: 'set', operation: 'delete', timestamp: Date.now() })),
    tx.done,
  ]);
}

export async function getWorkout(id: string): Promise<Workout | undefined> {
  const db = await getDB();
  const stored = await db.get('workouts', id);
  const sets = await getSetsByWorkoutId(id);
  if (stored) {
    if (sets.length === 0) return undefined;
    const sortedSets = [...sets].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    return { ...stored, sets: sortedSets };
  }
  // Try to reconstruct from sets
  if (sets.length === 0) return undefined;
  const sorted = sets.sort((a, b) => a.createdAt - b.createdAt);
  return {
    id,
    startTime: sorted[0].createdAt - 10 * 60 * 1000,
    endTime: sorted[sorted.length - 1].createdAt,
    sets: sorted,
    synced: false,
  };
}

export async function getAllWorkouts(): Promise<Workout[]> {
  const db = await getDB();
  const stored = await db.getAllFromIndex('workouts', 'by_start_time');
  
  const allSets = await getAllSets();
  const storedIds = new Set(stored.map(w => w.id));

  const explicitWorkouts: Workout[] = [];
  for (const w of stored) {
    const wSets = allSets.filter(s => s.localWorkoutId === w.id)
                         .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    if (wSets.length > 0) {
      explicitWorkouts.push({ ...w, sets: wSets });
    }
  }

  const orphanSets = allSets.filter(s => !storedIds.has(s.localWorkoutId));
  const groupedOrphans = groupSetsIntoWorkouts(orphanSets);

  return [...explicitWorkouts, ...groupedOrphans].sort((a, b) => b.startTime - a.startTime);
}

export async function addPendingSync(
  id: string,
  type: 'set' | 'workout',
  operation: 'upsert' | 'delete',
  data?: unknown
): Promise<void> {
  const db = await getDB();
  await db.put('pendingSync', { id, type, operation, data, timestamp: Date.now() });
}

export async function getPendingSync() {
  const db = await getDB();
  return db.getAllFromIndex('pendingSync', 'by_timestamp');
}

export async function clearPendingSync(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('pendingSync', id);
}
