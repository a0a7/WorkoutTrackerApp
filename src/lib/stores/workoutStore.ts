import { writable, derived } from 'svelte/store';
import type { WorkoutSet, UndoState } from '../types';

export const setsStore = writable<WorkoutSet[]>([]);
export const selectedIds = writable<Set<string>>(new Set());
export const undoStack = writable<UndoState[]>([]);
export const redoStack = writable<UndoState[]>([]);

export const hasUndo = derived(undoStack, ($s) => $s.length > 0);
export const hasRedo = derived(redoStack, ($s) => $s.length > 0);
export const selectedCount = derived(selectedIds, ($s) => $s.size);

export function pushUndo(description: string, sets: WorkoutSet[]) {
  undoStack.update((stack) => [...stack, { description, sets: sets.map((s) => ({ ...s })) }]);
  redoStack.set([]);
}

export function undo(currentSets: WorkoutSet[]): WorkoutSet[] | null {
  let result: WorkoutSet[] | null = null;
  undoStack.update((stack) => {
    if (stack.length === 0) return stack;
    const last = stack[stack.length - 1];
    result = last.sets;
    redoStack.update((r) => [...r, { description: last.description, sets: currentSets.map((s) => ({ ...s })) }]);
    return stack.slice(0, -1);
  });
  return result;
}

export function redo(currentSets: WorkoutSet[]): WorkoutSet[] | null {
  let result: WorkoutSet[] | null = null;
  redoStack.update((stack) => {
    if (stack.length === 0) return stack;
    const last = stack[stack.length - 1];
    result = last.sets;
    undoStack.update((u) => [...u, { description: last.description, sets: currentSets.map((s) => ({ ...s })) }]);
    return stack.slice(0, -1);
  });
  return result;
}
