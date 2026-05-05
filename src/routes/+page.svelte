<script lang="ts">

  import { onMount } from 'svelte';
  import SetRow from '$lib/components/SetRow.svelte';
  import { setsStore, selectedIds, pushUndo, undo, redo, hasUndo, hasRedo } from '$lib/stores/workoutStore';
  import { getTodaySets, saveSets, deleteSet as dbDeleteSet, saveWorkout } from '$lib/db';
  import { unitPreference, initUnitPreference } from '$lib/stores/userStore';
  import type { WorkoutSet } from '$lib/types';

  let sets = $state<WorkoutSet[]>([]);
  let selected = $state<Set<string>>(new Set());
  let dragFromIndex = $state<number | null>(null);
  let dragToIndex = $state<number | null>(null);
  let sessionLocation = $state<{ lat: number; lng: number; label?: string } | null>(null);
  let locationDenied = $state(false);
  // sessionId is generated once per component mount — one ID per workout session
  let sessionId = $state('');

  // Reactive unit preference — auto-subscribes and updates when the store changes
  const unit = $derived($unitPreference);

  // Stable session ID — one unique ID per app session (supports multiple sessions/day)
  // Defined inside onMount so each component mount gets a fresh session ID
  // Workout start time is backdated by this offset to account for warmup before the first logged set
  const WORKOUT_START_OFFSET_MS = 10 * 60_000; // 10 minutes

  // Geolocation options
  const GEOLOCATION_CACHE_MS = 5 * 60_000;  // allow cached position up to 5 minutes old
  const GEOLOCATION_TIMEOUT_MS = 10_000;     // give up after 10 seconds

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
      localWorkoutId: sessionId,
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
    // Use a full UUID for session IDs — sufficient entropy for local workout session tracking
    sessionId = crypto.randomUUID();
    initUnitPreference();

    const loaded = await getTodaySets();
    sets = loaded.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    setsStore.set(sets);
  });

  // Capture geolocation once when the first real set is added
  function captureLocation() {
    if (sessionLocation !== null) return; // already captured
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sessionLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Persist workout with location once we have it
        if (sets.length > 0) persistWorkoutMeta();
      },
      () => { locationDenied = true; },
      { maximumAge: GEOLOCATION_CACHE_MS, timeout: GEOLOCATION_TIMEOUT_MS }
    );
  }

  async function persistWorkoutMeta() {
    if (sets.length === 0) return;
    const sorted = [...sets].sort((a, b) => a.createdAt - b.createdAt);
    await saveWorkout({
      id: sessionId,
      startTime: sorted[0].createdAt - WORKOUT_START_OFFSET_MS,
      endTime: sorted[sorted.length - 1].createdAt,
      sets: sorted,
      synced: false,
      ...(sessionLocation ? { location: sessionLocation } : {}),
    });
  }

  async function persistSets(newSets: WorkoutSet[]) {
    sets = newSets;
    setsStore.set(newSets);
    await saveSets(newSets);
    await persistWorkoutMeta();
  }

  async function handleAdd(newSet: WorkoutSet) {
    pushUndo('Add set', sets);
    if (sets.length === 0) captureLocation();
    await persistSets([...sets, newSet]);
  }

  async function handleAddMultiple(newSets: WorkoutSet[]) {
    if (newSets.length === 0) return;
    pushUndo(`Add ${newSets.length} sets`, sets);
    if (sets.length === 0) captureLocation();
    await persistSets([...sets, ...newSets]);
  }

  async function handleExerciseUpdate(id: string, exerciseId: string, exerciseName: string) {
    pushUndo('Edit exercise', sets);
    const newSets = sets.map((s) => s.id === id ? { ...s, exerciseId, exerciseName } : s);
    await persistSets(newSets);
  }

  async function handleUpdate(id: string, field: keyof WorkoutSet, value: unknown) {
    pushUndo('Edit set', sets);
    // Apply to all selected sets if multiple are selected and this one is among them
    const targetIds = selected.has(id) && selected.size > 1 ? [...selected] : [id];
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
    <p class="text-sm font-semibold text-[hsl(var(--muted-foreground))]">{dateLabel}</p>
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
  <div class="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm min-h-[200px]">
    <table class="w-full border-collapse">
      <thead>
        <tr class="border-b border-[hsl(var(--border))]">
          <th class="w-8 px-1 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">#</th>
          <th class="px-1 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Exercise</th>
          <th class="w-16 px-1 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Reps</th>
          <th class="w-16 px-1 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{unit}</th>
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
            setNumber={i + 1}
            onUpdate={handleUpdate}
            onExerciseUpdate={handleExerciseUpdate}
            onDelete={handleDelete}
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
            setNumber={null}
            onAdd={handleAdd}
            onAddMultiple={handleAddMultiple}
            onDragStart={() => {}}
            onDragOver={() => {}}
            onDrop={() => {}}
          />
        {/each}
      </tbody>
    </table>
  </div>

  {#if locationDenied}
    <p class="mt-2 mb-1 text-center text-xs text-[hsl(var(--muted-foreground))]">
      📍 Location access denied — workout won't be geotagged.
    </p>
  {/if}
</div>
