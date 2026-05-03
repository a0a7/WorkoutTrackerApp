<script lang="ts">
  export const ssr = false;

  import { onMount } from 'svelte';
  import SetRow from '$lib/components/SetRow.svelte';
  import { setsStore, selectedIds, pushUndo, undo, redo, hasUndo, hasRedo } from '$lib/stores/workoutStore';
  import { getTodaySets, saveSets, deleteSet as dbDeleteSet } from '$lib/db';
  import type { WorkoutSet } from '$lib/types';

  let sets = $state<WorkoutSet[]>([]);
  let selected = $state<Set<string>>(new Set());
  let dragFromIndex = $state<number | null>(null);
  let dragToIndex = $state<number | null>(null);

  // Today's workout ID - group by calendar day
  const todayWorkoutId = $derived(() => {
    const d = new Date();
    return `local-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  });

  const dateLabel = $derived(
    new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    })
  );

  // 3 empty trailing rows always shown
  const EMPTY_COUNT = 3;
  const emptyRows = $derived(
    Array.from({ length: EMPTY_COUNT }, (_, i) => ({
      id: `empty-${i}`,
      localWorkoutId: todayWorkoutId(),
      exerciseId: '',
      exerciseName: '',
      reps: null,
      weight: null,
      order: sets.length + i,
      createdAt: Date.now(),
    } as WorkoutSet))
  );

  const allRows = $derived([...sets, ...emptyRows]);

  onMount(async () => {
    const loaded = await getTodaySets();
    sets = loaded.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    setsStore.set(sets);
  });

  async function persistSets(newSets: WorkoutSet[]) {
    sets = newSets;
    setsStore.set(newSets);
    await saveSets(newSets);
  }

  function getOrCreateRealSet(emptyId: string): WorkoutSet {
    const emptyIndex = parseInt(emptyId.replace('empty-', ''));
    return {
      id: crypto.randomUUID(),
      localWorkoutId: todayWorkoutId(),
      exerciseId: '',
      exerciseName: '',
      reps: null,
      weight: null,
      order: sets.length + emptyIndex,
      createdAt: Date.now(),
    };
  }

  async function handleUpdate(id: string, field: keyof WorkoutSet, value: unknown) {
    // If editing an empty row, promote to real set
    if (id.startsWith('empty-')) {
      const newSet = getOrCreateRealSet(id);
      (newSet as Record<string, unknown>)[field] = value;
      pushUndo('Add set', sets);
      const newSets = [...sets, newSet];
      await persistSets(newSets);
      return;
    }

    pushUndo('Edit set', sets);
    // Apply to all selected if multiple selected and this one is selected
    let targetIds = selected.has(id) && selected.size > 1 ? [...selected] : [id];
    const newSets = sets.map((s) =>
      targetIds.includes(s.id) ? { ...s, [field]: value } : s
    );
    await persistSets(newSets);
  }

  async function handleDelete(id: string) {
    if (id.startsWith('empty-')) return;
    pushUndo('Delete set', sets);
    const newSets = sets.filter((s) => s.id !== id);
    await persistSets(newSets);
    await dbDeleteSet(id);
    selected.delete(id);
    selected = new Set(selected);
  }

  async function handleDuplicate(id: string) {
    if (id.startsWith('empty-')) return;
    const original = sets.find((s) => s.id === id);
    if (!original) return;
    pushUndo('Duplicate set', sets);
    const dup: WorkoutSet = { ...original, id: crypto.randomUUID(), createdAt: Date.now(), order: original.order + 0.5 };
    const idx = sets.findIndex((s) => s.id === id);
    const newSets = [...sets.slice(0, idx + 1), dup, ...sets.slice(idx + 1)].map((s, i) => ({ ...s, order: i }));
    await persistSets(newSets);
  }

  function handleSelect(id: string, shiftKey = false) {
    if (id.startsWith('empty-')) return;
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    selected = newSelected;
    selectedIds.set(selected);
  }

  function clearSelection() {
    selected = new Set();
    selectedIds.set(selected);
  }

  async function handleUndo() {
    const prev = undo(sets);
    if (prev) await persistSets(prev);
  }

  async function handleRedo() {
    const next = redo(sets);
    if (next) await persistSets(next);
  }

  // Drag reorder
  function handleDragStart(index: number) {
    dragFromIndex = index;
  }

  function handleDragOver(index: number) {
    dragToIndex = index;
  }

  async function handleDrop() {
    if (dragFromIndex === null || dragToIndex === null || dragFromIndex === dragToIndex) {
      dragFromIndex = null; dragToIndex = null; return;
    }
    pushUndo('Reorder', sets);
    const newSets = [...sets];
    const [moved] = newSets.splice(dragFromIndex, 1);
    newSets.splice(dragToIndex, 0, moved);
    const reordered = newSets.map((s, i) => ({ ...s, order: i }));
    dragFromIndex = null; dragToIndex = null;
    await persistSets(reordered);
  }
</script>

<svelte:head>
  <title>WorkOut – Today</title>
</svelte:head>

<div class="px-4 pt-safe-top">
  <!-- Header -->
  <div class="sticky top-0 z-10 bg-[hsl(var(--background)/0.9)] backdrop-blur-sm py-3 flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-[hsl(var(--foreground))]">Today</h1>
      <p class="text-sm text-[hsl(var(--muted-foreground))]">{dateLabel}</p>
    </div>
    <div class="flex items-center gap-2">
      {#if selected.size > 0}
        <span class="text-sm font-medium text-[hsl(var(--primary))]">{selected.size} selected</span>
        <button
          onclick={clearSelection}
          class="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--border))]"
          aria-label="Clear selection"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4l8 8M12 4l-8 8"/>
          </svg>
        </button>
      {/if}
      <button
        onclick={handleUndo}
        disabled={!$hasUndo}
        class="flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-30 {$hasUndo ? 'hover:bg-[hsl(var(--muted))]' : ''}"
        aria-label="Undo"
      >
        <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M2 6h8a4 4 0 010 8H6"/>
          <polyline points="5 3 2 6 5 9"/>
        </svg>
      </button>
      <button
        onclick={handleRedo}
        disabled={!$hasRedo}
        class="flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-30 {$hasRedo ? 'hover:bg-[hsl(var(--muted))]' : ''}"
        aria-label="Redo"
      >
        <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M14 6H6a4 4 0 000 8h4"/>
          <polyline points="11 3 14 6 11 9"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Sets table -->
  {#if sets.length === 0 && emptyRows.length > 0}
    <div class="mt-6 mb-3 flex flex-col items-center gap-2 text-center">
      <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.1)]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" stroke-width="2" stroke-linecap="round">
          <path d="M6.5 6.5h11M6.5 12h11M6.5 17.5h11"/>
        </svg>
      </div>
      <p class="text-sm text-[hsl(var(--muted-foreground))]">Start logging your workout below</p>
    </div>
  {/if}

  <div class="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
    <table class="w-full min-w-[400px] border-collapse">
      <thead>
        <tr class="border-b border-[hsl(var(--border))]">
          <th class="w-8 px-1 py-2 text-center"></th>
          <th class="px-1 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Exercise</th>
          <th class="w-16 px-1 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Reps</th>
          <th class="w-20 px-1 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Weight</th>
          <th class="w-16 px-1 py-2"></th>
          <th class="w-8 px-1 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {#each sets as set, i (set.id)}
          <SetRow
            {set}
            selected={selected.has(set.id)}
            isEmpty={false}
            index={i}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onSelect={handleSelect}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        {/each}
        {#each emptyRows as emptySet, i}
          <SetRow
            set={emptySet}
            selected={false}
            isEmpty={true}
            index={sets.length + i}
            onUpdate={handleUpdate}
            onDelete={() => {}}
            onDuplicate={() => {}}
            onSelect={() => {}}
            onDragStart={() => {}}
            onDragOver={() => {}}
            onDrop={() => {}}
          />
        {/each}
      </tbody>
    </table>
  </div>

  <p class="mt-3 mb-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
    {sets.length} {sets.length === 1 ? 'set' : 'sets'} logged today
  </p>
</div>
