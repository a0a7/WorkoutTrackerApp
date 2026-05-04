<script lang="ts">

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import MuscleMap from '$lib/components/MuscleMap.svelte';
  import { getWorkout, saveWorkout } from '$lib/db';
  import { EXERCISE_MAP } from '$lib/exercises';
  import { unitPreference, initUnitPreference } from '$lib/stores/userStore';
  import type { Workout, MuscleActivation } from '$lib/types';

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
    const map = new Map<string, 'primary' | 'secondary' | 'tertiary'>();
    for (const s of workout.sets) {
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

  // Group sets by exercise
  const setsByExercise = $derived(() => {
    if (!workout) return [];
    const map = new Map<string, typeof workout.sets>();
    for (const s of workout.sets) {
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
  <title>WorkOut – Workout</title>
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
    <!-- Workout metadata -->
    <div class="mb-5 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-4 shadow-sm">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h1 class="text-xl font-bold text-[hsl(var(--foreground))]">{dateLabel}</h1>
          {#if !editingTimes}
            <p class="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">{timeLabel}</p>
          {/if}
        </div>
        <button
          onclick={editingTimes ? saveEditedTimes : beginEditTimes}
          class="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors {editingTimes ? 'bg-[hsl(var(--primary))] text-white' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}"
        >
          {editingTimes ? 'Save' : 'Edit times'}
        </button>
      </div>

      {#if editingTimes}
        <div class="mt-3 flex flex-col gap-2">
          <div>
            <p class="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">Start</p>
            <div class="flex gap-2">
              <input type="date" bind:value={editStartDate} class="flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
              <input type="time" bind:value={editStartTime} class="w-28 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
            </div>
          </div>
          <div>
            <p class="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">End</p>
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
            <p class="text-xs text-red-500 mt-1">{timeEditError}</p>
          {/if}
        </div>
      {/if}

      <div class="mt-3 flex gap-4 flex-wrap">
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
    </div>

    <!-- Muscle Map -->
    <div class="mb-5 rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-4 shadow-sm">
      <h2 class="mb-3 text-base font-semibold text-[hsl(var(--foreground))]">Muscles Worked</h2>
      <MuscleMap activations={allActivations()} />
    </div>

    <!-- Sets by exercise -->
    <div class="mb-5">
      <h2 class="mb-3 text-base font-semibold text-[hsl(var(--foreground))]">Exercises</h2>
      <div class="flex flex-col gap-3">
        {#each setsByExercise() as [exerciseName, exSets]}
          <div class="rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-4 shadow-sm">
            <h3 class="mb-2 font-semibold text-[hsl(var(--foreground))]">{exerciseName}</h3>
            <div class="flex flex-col gap-1">
              {#each exSets as s, i}
                <div class="flex items-center gap-3 py-1">
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
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

