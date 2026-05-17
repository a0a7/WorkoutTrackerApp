<script lang="ts">

  import { onMount } from 'svelte';
  import WorkoutCard from '$lib/components/WorkoutCard.svelte';
  import { getAllWorkouts } from '$lib/db';
  import type { Workout } from '$lib/types';

  let workouts = $state<Workout[]>([]);
  let loading = $state(true);
  let filterQuery = $state('');
  let fromDate = $state('');
  let toDate = $state('');
  let compactness = $state<'card' | 'compact'>('card');

  onMount(async () => {
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

  const filtered = $derived(() => {
    let result = workouts;
    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      result = result.filter((w) =>
        w.sets.some((s) => s.exerciseName.toLowerCase().includes(q))
      );
    }
    if (fromDate) {
      const from = new Date(fromDate).getTime();
      result = result.filter((w) => w.startTime >= from);
    }
    if (toDate) {
      const to = new Date(toDate).getTime() + 86400000;
      result = result.filter((w) => w.startTime <= to);
    }
    return [...result].sort((a, b) => b.startTime - a.startTime);
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
    return `${new Date(startTime).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })}, ${new Date(startTime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  }
</script>

<svelte:head>
  <title>Logbook – History</title>
</svelte:head>

<div class="px-4 pt-4">
  <h1 class="text-2xl font-bold text-[hsl(var(--foreground))] mb-4">History</h1>

  <!-- Filters -->
  <div class="mb-4 flex flex-col gap-2">
    <input
      type="text"
      bind:value={filterQuery}
      placeholder="Filter by exercise..."
      class="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
    />
    <div class="flex gap-2">
      <input
        type="date"
        bind:value={fromDate}
        class="flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]"
      />
      <span class="flex items-center text-[hsl(var(--muted-foreground))]">–</span>
      <input
        type="date"
        bind:value={toDate}
        class="flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]"
      />
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
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-16">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent"></div>
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
                class="flex items-center justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 active:scale-[0.99] transition-transform"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
                    {new Date(workout.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  <p class="truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {workout.sets.length} sets
                  </p>
                </div>
                <p class="shrink-0 text-xs font-medium text-[hsl(var(--primary))]">
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
              <p class="text-xs font-medium text-[hsl(var(--primary))]">{(() => { const mins = Math.round((workout.endTime - workout.startTime) / 60000); return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`; })()}</p>
              <p class="text-xs text-[hsl(var(--muted-foreground))]">{workout.sets.length} sets</p>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
