<script lang="ts">

  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import MuscleMap from '$lib/components/MuscleMap.svelte';
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

  // New Set Editing State
  let editingSetId = $state<string | null>(null);
  let editSetReps = $state<number | null>(null);
  let editSetWeight = $state<number | null>(null);

  function parseNullableNumber(value: string): number | null {
    if (value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

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

  function beginEditSet(set: WorkoutSet) {
    editingSetId = set.id;
    editSetReps = set.reps;
    editSetWeight = set.weight;
  }

  function cancelEditSet() {
    editingSetId = null;
    editSetReps = null;
    editSetWeight = null;
  }

  async function saveEditedSet() {
    if (!workout || !editingSetId) return;
    const idx = workout.sets.findIndex(s => s.id === editingSetId);
    if (idx !== -1) {
      workout.sets[idx] = { ...workout.sets[idx], reps: editSetReps ?? 0, weight: editSetWeight ?? 0 };
    }
    // We update the local workout
    await saveWorkout(workout);
    editingSetId = null;
    editSetReps = null;
    editSetWeight = null;
  }

  function beginEditWorkout() {
    if (!workout) return;
    draftSets = workout.sets.map((s) => ({ ...s }));
    editingWorkout = true;
    confirmDelete = false;
    cancelEditSet();
  }

  function cancelEditWorkout() {
    editingWorkout = false;
    draftSets = [];
  }

  function updateDraftSetValue(setId: string, field: 'reps' | 'weight', value: string) {
    const parsed = parseNullableNumber(value);
    draftSets = draftSets.map((s) => (s.id === setId ? { ...s, [field]: parsed } : s));
  }

  function removeDraftSet(setId: string) {
    draftSets = draftSets.filter((s) => s.id !== setId);
  }

  function addDraftSet(exerciseId: string, exerciseName: string) {
    if (!workout) return;
    const now = Date.now();
    draftSets = [
      ...draftSets,
      {
        id: crypto.randomUUID(),
        localWorkoutId: workout.id,
        exerciseId,
        exerciseName,
        reps: null,
        weight: null,
        order: draftSets.length + 1,
        createdAt: now,
      },
    ];
  }

  async function saveWorkoutEdits() {
    if (!workout) return;
    const normalized = draftSets.map((s, i) => ({
      ...s,
      localWorkoutId: workout.id,
      order: i + 1,
      createdAt: s.createdAt ?? Date.now(),
    }));
    const originalIds = new Set(workout.sets.map((s) => s.id));
    const nextIds = new Set(normalized.map((s) => s.id));
    const removedIds = [...originalIds].filter((id) => !nextIds.has(id));
    for (const id of removedIds) {
      await deleteSet(id);
    }
    if (normalized.length > 0) {
      await saveSets(normalized);
    }
    const updatedWorkout = { ...workout, sets: normalized };
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
        <section class="lg:order-2">
          <h2 class="mb-3 text-base font-semibold text-[hsl(var(--foreground))]">Muscles Worked</h2>
          <MuscleMap activations={allActivations()} details={muscleDetails()} />
        </section>

        <section class="lg:order-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h1 class="text-xl font-bold text-[hsl(var(--foreground))]">{dateLabel}</h1>
              {#if !editingTimes}
                <button
                  type="button"
                  onclick={beginEditTimes}
                  class="mt-0.5 text-left text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors"
                >
                  {timeLabel}
                </button>
              {/if}
            </div>
            {#if editingTimes}
              <button
                onclick={saveEditedTimes}
                class="shrink-0 rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-medium text-white transition-colors"
              >
                Save
              </button>
            {/if}
          </div>

          {#if editingTimes}
            <div class="mt-3 flex flex-col gap-2">
              <div>
                <p class="mb-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">Start</p>
                <div class="flex gap-2">
                  <input type="date" bind:value={editStartDate} class="flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
                  <input type="time" bind:value={editStartTime} class="w-28 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
                </div>
              </div>
              <div>
                <p class="mb-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">End</p>
                <div class="flex gap-2">
                  <input type="date" bind:value={editEndDate} class="flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
                  <input type="time" bind:value={editEndTime} class="w-28 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
                </div>
              </div>
              <button
                onclick={cancelEditTimes}
                class="mt-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >Cancel</button>
              {#if timeEditError}
                <p class="mt-1 text-xs text-red-500">{timeEditError}</p>
              {/if}
            </div>
          {/if}

          <div class="mt-3 flex flex-wrap gap-4">
            <div class="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" stroke-width="2" stroke-linecap="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span class="text-sm font-medium text-[hsl(var(--foreground))]">{durationLabel()}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" stroke-width="2" stroke-linecap="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              <span class="text-sm font-medium text-[hsl(var(--foreground))]">{workout.sets.length} sets</span>
            </div>
            {#if workout.location}
              <div class="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" stroke-width="2" stroke-linecap="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <span class="text-sm text-[hsl(var(--foreground))]">{workout.location.label ?? 'Location'}</span>
              </div>
            {/if}
          </div>

          <div class="mt-4 border-t border-[hsl(var(--border))] pt-3">
            {#if confirmDelete}
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs text-[hsl(var(--muted-foreground))]">Delete this full workout?</p>
                <div class="flex items-center gap-2">
                  <button
                    onclick={() => { confirmDelete = false; }}
                    class="rounded-lg px-3 py-1.5 text-xs font-medium bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                  >
                    Cancel
                  </button>
                  <button
                    onclick={handleDeleteWorkout}
                    class="rounded-lg px-3 py-1.5 text-xs font-medium bg-red-600 text-white hover:bg-red-500"
                  >
                    Confirm delete
                  </button>
                </div>
              </div>
            {:else}
              <div class="flex items-center gap-3">
                {#if editingWorkout}
                  <button
                    onclick={saveWorkoutEdits}
                    class="text-xs font-medium text-[hsl(var(--primary))] hover:underline"
                  >
                    Save workout edits
                  </button>
                  <button
                    onclick={cancelEditWorkout}
                    class="text-xs font-medium text-[hsl(var(--muted-foreground))] hover:underline"
                  >
                    Cancel
                  </button>
                {:else}
                  <button
                    onclick={beginEditWorkout}
                    class="text-xs font-medium text-[hsl(var(--primary))] hover:underline"
                  >
                    Edit workout
                  </button>
                {/if}
                <button
                  onclick={() => { confirmDelete = true; }}
                  class="text-xs font-medium text-red-500 hover:text-red-400"
                >
                  Delete workout
                </button>
              </div>
            {/if}
          </div>

          <div class="mt-5 border-t border-[hsl(var(--border))] pt-4">
            <h2 class="mb-3 text-base font-semibold text-[hsl(var(--foreground))]">Exercises</h2>
            <div class="flex flex-col divide-y divide-[hsl(var(--border)/0.7)]">
              {#each setsByExercise() as [exerciseName, exSets]}
                <div class="py-3 first:pt-0 last:pb-0">
                  <h3 class="mb-2 font-semibold text-[hsl(var(--foreground))]">{exerciseName}</h3>
                  <div class="flex flex-col gap-1">
                     {#each exSets as s, i}
                      {#if editingWorkout}
                        <div class="flex items-center gap-2 py-2">
                          <span class="w-6 text-center text-xs font-medium text-[hsl(var(--muted-foreground))]">{i + 1}</span>
                          <input
                            type="number"
                            value={s.weight ?? ''}
                            oninput={(e) => updateDraftSetValue(s.id, 'weight', (e.currentTarget as HTMLInputElement).value)}
                            placeholder="Weight"
                            class="w-20 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]"
                          />
                          <span class="text-xs text-[hsl(var(--muted-foreground))]">{unit}</span>
                          <input
                            type="number"
                            value={s.reps ?? ''}
                            oninput={(e) => updateDraftSetValue(s.id, 'reps', (e.currentTarget as HTMLInputElement).value)}
                            placeholder="Reps"
                            class="w-16 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]"
                          />
                          <span class="text-xs text-[hsl(var(--muted-foreground))]">reps</span>
                          <button
                            type="button"
                            onclick={() => removeDraftSet(s.id)}
                            class="ml-auto rounded-lg bg-[hsl(var(--destructive)/0.12)] px-2 py-1 text-xs font-medium text-[hsl(var(--destructive))]"
                          >
                            Remove
                          </button>
                        </div>
                      {:else if editingSetId === s.id}
                        <div class="flex items-center gap-2 py-2">
                          <span class="w-6 text-center text-xs font-medium text-[hsl(var(--muted-foreground))]">{i + 1}</span>
                          <input type="number" bind:value={editSetWeight} placeholder="Weight" class="w-20 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
                          <span class="text-xs text-[hsl(var(--muted-foreground))]">{unit}</span>
                          <input type="number" bind:value={editSetReps} placeholder="Reps" class="w-16 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
                          <span class="text-xs text-[hsl(var(--muted-foreground))]">reps</span>
                          <div class="ml-auto flex gap-1">
                            <button onclick={cancelEditSet} class="rounded-lg bg-[hsl(var(--muted))] px-2 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">Cancel</button>
                            <button onclick={saveEditedSet} class="rounded-lg bg-[hsl(var(--primary))] px-2 py-1 text-xs font-medium text-white">Save</button>
                          </div>
                        </div>
                      {:else}
                        <div class="group flex items-center gap-3 py-1">
                          <span class="w-6 text-center text-xs font-medium text-[hsl(var(--muted-foreground))]">{i + 1}</span>
                          <span class="flex-1 text-sm text-[hsl(var(--foreground))]">
                            {#if s.reps !== null && s.weight !== null}
                              <span class="font-semibold">{s.reps}</span> reps × <span class="font-semibold">{s.weight}</span> {unit}
                            {:else if s.reps !== null}
                              <span class="font-semibold">{s.reps}</span> reps
                            {:else if s.weight !== null}
                              <span class="font-semibold">{s.weight}</span> {unit}
                            {:else}
                              —
                            {/if}
                          </span>
                          <button onclick={() => beginEditSet(s)} class="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium text-[hsl(var(--primary))] hover:underline px-2 py-1">Edit</button>
                        </div>
                      {/if}
                     {/each}
                    {#if editingWorkout}
                      <button
                        type="button"
                        onclick={() => {
                          const first = exSets[0];
                          if (first) addDraftSet(first.exerciseId, first.exerciseName);
                        }}
                        class="mt-1 w-fit rounded-lg bg-[hsl(var(--muted))] px-2.5 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                      >
                        + Add set
                      </button>
                    {/if}
                   </div>
                 </div>
              {/each}
              {#if editingWorkout && setsByExercise().length === 0}
                <button
                  type="button"
                  onclick={() => addDraftSet('', 'New Exercise')}
                  class="mt-2 w-fit rounded-lg bg-[hsl(var(--muted))] px-2.5 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  + Add set
                </button>
              {/if}
            </div>
          </div>
        </section>
      </div>
    </div>
  {/if}
</div>
