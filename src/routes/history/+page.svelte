<script lang="ts">
  export const ssr = false;

  import { onMount } from 'svelte';
  import WorkoutCard from '$lib/components/WorkoutCard.svelte';
  import { getAllWorkouts } from '$lib/db';
  import type { Workout } from '$lib/types';

  let workouts = $state<Workout[]>([]);
  let loading = $state(true);
  let filterQuery = $state('');
  let fromDate = $state('');
  let toDate = $state('');

  onMount(async () => {
    workouts = await getAllWorkouts();
    loading = false;
  });

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
    return result;
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
</script>

<svelte:head>
  <title>WorkOut – History</title>
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
  {:else}
    {#each grouped() as [dateLabel, dayWorkouts]}
      <div class="mb-5">
        <h2 class="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{dateLabel}</h2>
        <div class="flex flex-col gap-3">
          {#each dayWorkouts as workout (workout.id)}
            <WorkoutCard {workout} />
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>
