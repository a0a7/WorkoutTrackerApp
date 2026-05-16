<script lang="ts">

  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import MuscleMap from '$lib/components/MuscleMap.svelte';
  import SetRow from '$lib/components/SetRow.svelte';
  import NumericKeypad from '$lib/components/NumericKeypad.svelte';
  import { deleteSet, deleteWorkout, getWorkout, saveSets, saveWorkout } from '$lib/db';
  import { EXERCISE_MAP } from '$lib/exercises';
  import { unitPreference, initUnitPreference, userStore } from '$lib/stores/userStore';
  import { syncToServer } from '$lib/sync';
  import type { Workout, MuscleActivation, WorkoutSet } from '$lib/types';

  const workoutId = $derived($page.params.id);

  let workout = $state<Workout | null>(null);
  let loading = $state(true);

  // Reactive unit preference — auto-subscribes and updates when the store changes
  const unit = $derived($unitPreference);

  // Time editing state
  let editingTimes = $state(false);
  let editStartDate = $state('');
  let editStartTime = $state('');
  let editEndDate = $state('');
  let editEndTime = $state('');
  let confirmDelete = $state(false);
  let editingWorkout = $state(false);
  let draftSets = $state<WorkoutSet[]>([]);
  let draftSelected = $state<Set<string>>(new Set());
  let draftDragFromIndex = $state<number | null>(null);
  let draftDragToIndex = $state<number | null>(null);

  function toDateInput(ts: number) {
    const d = new Date(ts);
    return d.toISOString().slice(0, 10);
  }
  function toTimeInput(ts: number) {
    const d = new Date(ts);
    return d.toTimeString().slice(0, 5); // HH:MM
  }
  function fromDateTimeInputs(date: string, time: string): number {
    return new Date(`${date}T${time}:00`).getTime();
  }

  function beginEditTimes() {
    if (!workout) return;
    editStartDate = toDateInput(workout.startTime);
    editStartTime = toTimeInput(workout.startTime);
    editEndDate = toDateInput(workout.endTime);
    editEndTime = toTimeInput(workout.endTime);
    editingTimes = true;
  }

  let timeEditError = $state('');

  function cancelEditTimes() {
    editingTimes = false;
    timeEditError = '';
  }

  async function saveEditedTimes() {
    if (!workout) return;
    const newStart = fromDateTimeInputs(editStartDate, editStartTime);
    const newEnd = fromDateTimeInputs(editEndDate, editEndTime);
    if (isNaN(newStart)) { timeEditError = 'Invalid start date or time.'; return; }
    if (isNaN(newEnd)) { timeEditError = 'Invalid end date or time.'; return; }
    // Prevent zero-duration workouts — end time must be strictly after start time
    if (newEnd <= newStart) { timeEditError = 'End time must be after start time.'; return; }     
    timeEditError = '';
    workout = { ...workout, startTime: newStart, endTime: newEnd };
    await saveWorkout(workout);
    editingTimes = false;
  }

  function beginEditWorkout() {
    if (!workout) return;
    draftSets = workout.sets
      .map((s) => ({ ...s }))
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    draftSelected = new Set();
    editingWorkout = true;
    confirmDelete = false;
  }

  function cancelEditWorkout() {
    editingWorkout = false;
    draftSets = [];
    draftSelected = new Set();
  }

  function persistDraftSets(newSets: WorkoutSet[]) {
    draftSets = newSets.map((s, i) => ({ ...s, order: i }));
  }

  function handleDraftAdd(newSet: WorkoutSet) {
    if (!workout) return;
    persistDraftSets([...draftSets, { ...newSet, localWorkoutId: workout.id }]);
  }

  function handleDraftAddMultiple(newSets: WorkoutSet[]) {
    if (!workout) return;
    if (newSets.length === 0) return;
    const workoutLocalId = workout.id;
    persistDraftSets([
      ...draftSets,
      ...newSets.map((s) => ({ ...s, localWorkoutId: workoutLocalId })),
    ]);
  }

  function handleDraftExerciseUpdate(id: string, exerciseId: string, exerciseName: string) {
    persistDraftSets(draftSets.map((s) => (s.id === id ? { ...s, exerciseId, exerciseName } : s)));
  }

  function handleDraftUpdate(id: string, field: keyof WorkoutSet, value: unknown) {
    const normalizeValue = (f: keyof WorkoutSet, v: unknown) => {
      if (f === 'reps') {
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        if (typeof v === 'string') {
          if (/[xX×*]/.test(v)) return null;
          const parsed = parseInt(v, 10);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      }
      if (f === 'weight') {
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        if (typeof v === 'string') {
          const parsed = parseFloat(v);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      }
      return v;
    };
    const normalizedValue = normalizeValue(field, value);
    const targetIds = draftSelected.has(id) && draftSelected.size > 1 ? [...draftSelected] : [id];
    persistDraftSets(
      draftSets.map((s) => (targetIds.includes(s.id) ? { ...s, [field]: normalizedValue } : s))
    );
  }

  function handleDraftDelete(id: string) {
    if (id.startsWith('empty-')) return;
    persistDraftSets(draftSets.filter((s) => s.id !== id));
    draftSelected.delete(id);
    draftSelected = new Set(draftSelected);
  }

  function handleDraftDeleteSelected() {
    if (draftSelected.size === 0) return;
    const idSet = new Set([...draftSelected].filter((id) => !id.startsWith('empty-')));
    if (idSet.size === 0) return;
    persistDraftSets(draftSets.filter((s) => !idSet.has(s.id)));
    clearDraftSelection();
  }

  function handleDraftSelect(id: string) {
    if (id.startsWith('empty-')) return;
    const next = new Set(draftSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    draftSelected = next;
  }

  function clearDraftSelection() {
    draftSelected = new Set();
  }

  function handleDraftExpandSet(id: string, newSets: WorkoutSet[]) {
    const idx = draftSets.findIndex((s) => s.id === id);
    const before = draftSets.slice(0, idx);
    const after = draftSets.slice(idx + 1);
    persistDraftSets([...before, ...newSets, ...after]);
  }

  function handleDraftDragStart(index: number) {
    draftDragFromIndex = index;
  }

  function handleDraftDragOver(index: number) {
    draftDragToIndex = index;
  }

  function handleDraftDrop() {
    if (
      draftDragFromIndex === null ||
      draftDragToIndex === null ||
      draftDragFromIndex === draftDragToIndex
    ) {
      draftDragFromIndex = null;
      draftDragToIndex = null;
      return;
    }
    const newSets = [...draftSets];
    const [moved] = newSets.splice(draftDragFromIndex, 1);
    newSets.splice(draftDragToIndex, 0, moved);
    draftDragFromIndex = null;
    draftDragToIndex = null;
    persistDraftSets(newSets);
  }

  function handleDraftTouchReorder(fromIndex: number, toIndex: number) {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= draftSets.length ||
      toIndex >= draftSets.length
    ) return;
    const newSets = [...draftSets];
    const [moved] = newSets.splice(fromIndex, 1);
    newSets.splice(toIndex, 0, moved);
    persistDraftSets(newSets);
  }

  async function saveWorkoutEdits() {
    const workoutRef = workout;
    if (!workoutRef) return;
    const normalized = draftSets.map((s, i) => ({
      ...s,
      localWorkoutId: workoutRef.id,
      order: i + 1,
      createdAt: s.createdAt ?? Date.now(),
    }));
    const originalIds = new Set(workoutRef.sets.map((s) => s.id));
    const nextIds = new Set(normalized.map((s) => s.id));
    const removedIds = [...originalIds].filter((id) => !nextIds.has(id));
    for (const id of removedIds) {
      await deleteSet(id);
    }
    if (normalized.length > 0) {
      await saveSets(normalized);
    }
    const updatedWorkout = { ...workoutRef, sets: normalized };
    await saveWorkout(updatedWorkout);
    workout = updatedWorkout;
    editingWorkout = false;
    draftSets = [];
  }

  async function handleDeleteWorkout() {
    if (!workout) return;
    await deleteWorkout(workout.id);
    const user = get(userStore);
    if (user) syncToServer(user).catch(() => {});
    goto('/history');
  }

  onMount(async () => {
    initUnitPreference();
    if (workoutId) {
      workout = await getWorkout(workoutId) ?? null;
    }
    loading = false;
  });

  const durationMs = $derived(workout ? workout.endTime - workout.startTime : 0);
  const durationLabel = $derived(() => {
    const min = Math.round(durationMs / 60000);
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  });

  const ACTIVATION_RANK: Record<string, number> = { primary: 3, secondary: 2, tertiary: 1 };

  const allActivations = $derived(() => {
    if (!workout) return [];
    const sourceSets = editingWorkout ? draftSets : workout.sets;
    const map = new Map<string, 'primary' | 'secondary' | 'tertiary'>();
    for (const s of sourceSets) {
      const ex = EXERCISE_MAP.get(s.exerciseId);
      if (!ex) continue;
      for (const ma of ex.muscleActivations) {
        const existing = map.get(ma.muscle);
        const incomingRank = ACTIVATION_RANK[ma.activation] ?? 0;
        const existingRank = existing ? (ACTIVATION_RANK[existing] ?? 0) : 0;
        if (incomingRank > existingRank) {
          map.set(ma.muscle, ma.activation);
        }
      }
    }
    return [...map.entries()].map(([muscle, activation]) => ({
      muscle: muscle as MuscleActivation['muscle'],
      activation,
    }));
  });

  const muscleDetails = $derived(() => {
    if (!workout) return {};
    const sourceSets = editingWorkout ? draftSets : workout.sets;
    const details = new Map<string, { activation: 'primary' | 'secondary' | 'tertiary'; exercises: Set<string> }>();
    for (const s of sourceSets) {
      const ex = EXERCISE_MAP.get(s.exerciseId);
      if (!ex) continue;
      for (const ma of ex.muscleActivations) {
        const existing = details.get(ma.muscle);
        const incomingRank = ACTIVATION_RANK[ma.activation] ?? 0;
        const existingRank = existing ? (ACTIVATION_RANK[existing.activation] ?? 0) : 0;
        if (!existing) {
          details.set(ma.muscle, { activation: ma.activation, exercises: new Set([s.exerciseName]) });
        } else {
          if (incomingRank > existingRank) existing.activation = ma.activation;
          existing.exercises.add(s.exerciseName);
        }
      }
    }
    return Object.fromEntries(
      [...details.entries()].map(([muscle, value]) => [muscle, { activation: value.activation, exercises: [...value.exercises] }])
    );
  });

  // Group sets by exercise
  const setsByExercise = $derived(() => {
    if (!workout) return [];
    const sourceSets = editingWorkout ? draftSets : workout.sets;
    const map = new Map<string, typeof sourceSets>();
    for (const s of sourceSets) {
      if (!map.has(s.exerciseName)) map.set(s.exerciseName, []);
      map.get(s.exerciseName)!.push(s);
    }
    return [...map.entries()];
  });

  const dateLabel = $derived(
    workout
      ? new Date(workout.startTime).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        })
      : ''
  );

  const timeLabel = $derived(
    workout
      ? `${new Date(workout.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${new Date(workout.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      : ''
  );

  const draftEmptyRows = $derived(
    workout
      ? [
          {
            id: 'empty-0',
            localWorkoutId: workout.id,
            exerciseId: '',
            exerciseName: '',
            reps: null,
            weight: null,
            order: draftSets.length,
            createdAt: Date.now(),
          } as WorkoutSet,
        ]
      : []
  );

  // --- Helpers for compact display and totals
  function computeTotalVolume() {
    if (!workout) return 0;
    let total = 0;
    for (const s of workout.sets) {
      if (typeof s.reps === 'number' && typeof s.weight === 'number' && s.reps > 0 && s.weight > 0) {
        total += s.reps * s.weight;
      }
    }
    return Math.round(total);
  }

  function formatExerciseCompact(exName: string, setsArr: any[]) {
    // Determine if all sets have same reps and same weight (and weight > 0)
    if (!setsArr || setsArr.length === 0) return '';
    const parts = setsArr.map((s) => ({ reps: s.reps, weight: s.weight }));
    const allSameReps = parts.every((p) => p.reps === parts[0].reps);
    const allSameWeight = parts.every((p) => p.weight === parts[0].weight);

    const firstEx = EXERCISE_MAP.get(setsArr[0].exerciseId);
    const isBodyweight = firstEx?.category === 'bodyweight';

    if (isBodyweight) {
      // Count occurrences of identical reps sequences
      const repsCounts = new Map();
      for (const p of parts) {
        const key = String(p.reps ?? '');
        repsCounts.set(key, (repsCounts.get(key) || 0) + 1);
      }
      // Typical output: 3x6 reps if all same
      if (repsCounts.size === 1) {
        const reps = parts[0].reps ?? 0;
        return `${parts.length}x${reps} reps`;
      }
      // Otherwise list each set as NxR
      return parts.map((p) => `${p.reps ?? ''}x${p.weight ?? ''} ${isBodyweight ? 'reps' : ''}`.trim()).join(', ');
    }

    if (allSameReps && allSameWeight && parts[0].reps != null && parts[0].weight != null) {
      return `${parts.length}x${parts[0].reps}x${parts[0].weight}`;
    }

    // Mixed sets: join each as `${reps}x${weight}` skipping nulls
    return parts.map((p) => {
      const r = p.reps != null ? String(p.reps) : '';
      const w = p.weight != null ? String(p.weight) : '';
      if (r && w) return `${r}x${w}`;
      if (r && !w) return `${r} reps`;
      return `${w}`;
    }).filter(Boolean).join(', ');
  }
</script>

<svelte:head>
  <title>Logbook – Workout</title>
</svelte:head>

<div class="px-4 pt-4">
  <!-- Header -->
  <button onclick={() => goto('/history')} class="mb-4 flex items-center gap-1 text-sm text-[hsl(var(--primary))] hover:underline">
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M10 4L6 8l4 4"/>
    </svg>
    History
  </button>

  {#if loading}
    <div class="flex items-center justify-center py-16">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent"></div>
    </div>
  {:else if !workout}
    <div class="py-16 text-center">
      <p class="text-[hsl(var(--muted-foreground))]">Workout not found.</p>
    </div>
  {:else}
    <div class="mb-5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm lg:p-5">
      <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">

        <!-- Mobile-first: Muscle map first (no header above it) -->
        <section class="order-1 lg:order-2">
          <MuscleMap activations={allActivations()} details={muscleDetails()} />
        </section>

        <!-- Info block: name, start time, duration · # sets · total volume, Edit/Delete buttons -->
        <section class="order-2 lg:order-1 min-w-0">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h1 class="text-lg font-bold text-[hsl(var(--foreground))] truncate">{workout.name ?? 'Workout'}</h1>
              <p class="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">at {new Date(workout.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
              <p class="text-sm text-[hsl(var(--foreground))] mt-1">
                {(() => {
                  const mins = Math.round((workout.endTime - workout.startTime) / 60000);
                  const setsCount = workout.sets.length;
                  const vol = computeTotalVolume();
                  const minsLabel = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
                  return `${minsLabel} · ${setsCount} sets · ${vol} total`;
                })()}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <button class="text-sm text-[hsl(var(--primary))]" onclick={beginEditWorkout}>Edit</button>
              <button class="text-sm text-red-500" onclick={() => { confirmDelete = true; }}>Delete</button>
            </div>
          </div>

          <hr class="my-3 border-[hsl(var(--border))]" />

          <!-- Compact exercises list -->
          <div class="flex flex-col gap-3">
            {#each setsByExercise() as [exName, setsArr]}
              <div>
                <div class="flex items-baseline gap-2">
                  <p class="text-sm font-medium text-[hsl(var(--foreground))] truncate">{exName}</p>
                  <span class="text-xs text-[hsl(var(--muted-foreground))]">({setsArr.length})</span>
                </div>
                <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{formatExerciseCompact(exName, setsArr)}</p>
              </div>
            {/each}
          </div>

        </section>

      </div>
    </div>
  {/if}
</div>

<!-- Custom numeric keypad — rendered at root so it sits above all row content -->
<NumericKeypad />
