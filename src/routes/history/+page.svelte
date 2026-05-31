<script lang="ts">

  import { onMount } from 'svelte';
  import WorkoutCard from '$lib/components/WorkoutCard.svelte';
  import { getAllWorkouts } from '$lib/db';
  import type { Workout, WorkoutSet } from '$lib/types';
  import { unitPreference, initUnitPreference, timeFormatPreference, initTimeFormatPreference } from '$lib/stores/userStore';
  import { formatWorkoutLocation } from '$lib/location';

  let workouts = $state<Workout[]>([]);
  let loading = $state(true);
  let filterQuery = $state('');
  let fromDate = $state('');
  let toDate = $state('');
  let sortMode = $state<'newest' | 'oldest' | 'duration-desc' | 'duration-asc' | 'volume-desc' | 'volume-asc'>('newest');
  let onlyWithLocation = $state(false);
  let compactness = $state<'card' | 'compact'>('card');
  const unit = $derived($unitPreference);
  const timeFormat = $derived($timeFormatPreference);

  onMount(async () => {
    initUnitPreference();
    initTimeFormatPreference();
    const savedCompactness = localStorage.getItem('history-compactness');
    if (savedCompactness === 'card' || savedCompactness === 'compact') {
      compactness = savedCompactness;
    }
    workouts = await getAllWorkouts();
    loading = false;
  });

  function setCompactness(mode: 'card' | 'compact') {
    compactness = mode;
    localStorage.setItem('history-compactness', mode);
  }

  function getWorkoutDurationMinutes(workout: Workout) {
    return Math.max(0, Math.round((workout.endTime - workout.startTime) / 60000));
  }

  function getWorkoutVolume(workout: Workout) {
    return computeTotalVolume(workout.sets);
  }

  function matchesFilter(workout: Workout, query: string) {
    if (!query) return true;
    const locationText = workout.location?.label?.toLowerCase() ?? '';
    const notesText = workout.notes?.toLowerCase() ?? '';
    return (
      workout.sets.some((s) => s.exerciseName.toLowerCase().includes(query)) ||
      notesText.includes(query) ||
      locationText.includes(query)
    );
  }

  function compareWorkouts(a: Workout, b: Workout) {
    switch (sortMode) {
      case 'oldest':
        return a.startTime - b.startTime;
      case 'duration-desc':
        return getWorkoutDurationMinutes(b) - getWorkoutDurationMinutes(a) || b.startTime - a.startTime;
      case 'duration-asc':
        return getWorkoutDurationMinutes(a) - getWorkoutDurationMinutes(b) || b.startTime - a.startTime;
      case 'volume-desc':
        return getWorkoutVolume(b) - getWorkoutVolume(a) || b.startTime - a.startTime;
      case 'volume-asc':
        return getWorkoutVolume(a) - getWorkoutVolume(b) || b.startTime - a.startTime;
      case 'newest':
      default:
        return b.startTime - a.startTime;
    }
  }

  const filtered = $derived(() => {
    let result = workouts;
    const q = filterQuery.trim().toLowerCase();
    if (filterQuery.trim()) {
      result = result.filter((w) => matchesFilter(w, q));
    }
    if (fromDate) {
      const from = new Date(fromDate).getTime();
      result = result.filter((w) => w.startTime >= from);
    }
    if (toDate) {
      const to = new Date(toDate).getTime() + 86400000;
      result = result.filter((w) => w.startTime <= to);
    }
    if (onlyWithLocation) {
      result = result.filter((w) => Boolean(w.location));
    }
    return [...result].sort(compareWorkouts);
  });

  // Group by date
  const grouped = $derived(() => {
    const map = new Map<string, Workout[]>();
    for (const w of filtered()) {
      const key = new Date(w.startTime).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    }
    return [...map.entries()];
  });

  function getUniqueExerciseNames(workout: Workout): string[] {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const s of workout.sets) {
      if (!seen.has(s.exerciseName)) {
        seen.add(s.exerciseName);
        names.push(s.exerciseName);
      }
    }
    return names;
  }

  function getCompactPills(workout: Workout) {
    const names = getUniqueExerciseNames(workout);
    const shown = names.slice(0, 2);
    const remaining = Math.max(0, names.length - shown.length);
    return { shown, remaining };
  }

  function getCompactSummary(workout: Workout) {
    const names = getUniqueExerciseNames(workout);
    return { first: names[0] ?? '', remaining: Math.max(0, names.length - 1) };
  }

  function getExerciseNamesString(workout: Workout) {
    return getUniqueExerciseNames(workout).join(', ');
  }

  function formatCompactDateTime(startTime: number): string {
    const time = new Date(startTime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: timeFormat === '12h',
    });
    return `${new Date(startTime).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })}, ${time}`;
  }

  function computeTotalVolume(sets: WorkoutSet[]) {
    let total = 0;
    for (const s of sets) {
      if (typeof s.reps === 'number' && typeof s.weight === 'number' && s.reps > 0 && s.weight > 0) {
        total += s.reps * s.weight;
      }
    }
    return Math.round(total);
  }

  function formatVolume(sets: WorkoutSet[]) {
    const total = computeTotalVolume(sets);
    if (!total) return `0 ${unit === 'kg' ? 'kg' : 'lbs'}`;
    const formatted = new Intl.NumberFormat('en-US').format(total);
    return `${formatted} ${unit === 'kg' ? 'kg' : 'lbs'}`;
  }

  function getWorkoutCountLabel() {
    const count = filtered().length;
    return `${count} workout${count === 1 ? '' : 's'}`;
  }
</script>

<svelte:head>
  <title>Logbook – History</title>
</svelte:head>

<div class="px-4 pt-4">
  <h1 class="text-2xl font-bold text-[hsl(var(--foreground))] mb-4">History</h1>

  <!-- Filters -->
  <div class="mb-4 flex flex-col gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-sm">
    <input
      type="text"
      bind:value={filterQuery}
      placeholder="Search exercise, note, or location..."
      class="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
    />
    <div class="grid gap-2 sm:grid-cols-2">
      <input
        type="date"
        bind:value={fromDate}
        class="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]"
      />
      <input
        type="date"
        bind:value={toDate}
        class="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]"
      />
    </div>
    <div class="grid gap-2 sm:grid-cols-[1fr_auto]">
      <label class="block">
        <span class="sr-only">Sort workouts</span>
        <select
          bind:value={sortMode}
          class="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="duration-desc">Longest duration</option>
          <option value="duration-asc">Shortest duration</option>
          <option value="volume-desc">Highest volume</option>
          <option value="volume-asc">Lowest volume</option>
        </select>
      </label>
      <button
        type="button"
        onclick={() => { onlyWithLocation = !onlyWithLocation; }}
        class="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--muted))]"
        aria-pressed={onlyWithLocation}
      >
        {onlyWithLocation ? 'Locations only' : 'All workouts'}
      </button>
    </div>
    <div class="inline-flex w-fit rounded-xl bg-[hsl(var(--muted))] p-1">
      <button
        type="button"
        onclick={() => setCompactness('card')}
        class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors {compactness === 'card' ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}"
      >
        Card
      </button>
      <button
        type="button"
        onclick={() => setCompactness('compact')}
        class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors {compactness === 'compact' ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}"
      >
        Compact
      </button>
    </div>
    <p class="text-xs text-[hsl(var(--muted-foreground))]">Showing {getWorkoutCountLabel()}</p>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-16">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--foreground))] border-t-transparent"></div>
    </div>
  {:else if grouped().length === 0}
    <div class="flex flex-col items-center gap-3 py-16 text-center">
      <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--muted))]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--muted-foreground))" stroke-width="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
      </div>
      <p class="font-medium text-[hsl(var(--foreground))]">No workouts yet</p>
      <p class="text-sm text-[hsl(var(--muted-foreground))]">Start tracking on the Today tab</p>
    </div>
  {:else if compactness === 'card'}
    {#each grouped() as [dateLabel, dayWorkouts] (dateLabel)}
      <div class="mb-5">
        <h2 class="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{dateLabel}</h2>
        <div class="flex flex-col gap-3">
          {#each dayWorkouts as workout (workout.id)}
            {#if compactness === 'card'}
              <WorkoutCard {workout} />
            {:else}
              <a
                href="/workout/{workout.id}"
                data-sveltekit-preload-data="off"
                class="flex items-center justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 active:scale-[0.99] transition-transform"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
                    {new Date(workout.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: timeFormat === '12h' })}
                  </p>
                  <p class="truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {workout.sets.length} sets
                  </p>
                  {#if workout.location}
                    <p class="truncate text-[11px] text-[hsl(var(--muted-foreground))]">
                      {formatWorkoutLocation(workout.location)}
                    </p>
                  {/if}
                </div>
                <p class="shrink-0 text-xs font-medium text-[hsl(var(--foreground))]">
                  {(() => {
                    const mins = Math.round((workout.endTime - workout.startTime) / 60000);
                    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
                  })()}
                </p>
              </a>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  {:else}
    <div class="flex flex-col divide-y divide-[hsl(var(--border))]">
      {#each filtered() as workout (workout.id)}
        <a href="/workout/{workout.id}" class="py-2 active:scale-[0.995] transition-transform">
          <div class="flex items-start justify-between gap-1.5 text-sm text-[hsl(var(--foreground))]">
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{formatCompactDateTime(workout.startTime)}</p>
              <p class="truncate text-xs text-[hsl(var(--muted-foreground))]">{getExerciseNamesString(workout)}</p>
            </div>
            <div class="flex flex-col items-end shrink-0 ml-3">
              <p class="text-xs font-medium text-[hsl(var(--foreground))]">{(() => { const mins = Math.round((workout.endTime - workout.startTime) / 60000); return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`; })()}</p>
              <p class="text-xs text-[hsl(var(--muted-foreground))]">{formatVolume(workout.sets)}</p>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
