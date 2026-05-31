<script lang="ts">
  import { onMount } from 'svelte';
  import { getAllWorkouts } from '$lib/db';
  import type { Workout } from '$lib/types';
  import * as trends from '$lib/trends';
  import { getThemeMode, watchThemeMode } from '$lib/trendsView';
  import { ChevronRight } from 'lucide-svelte';

  let workouts = $state<Workout[]>([]);
  let loading = $state(true);
  let theme = $state<'light' | 'dark'>(getThemeMode());

  onMount(() => {
    const stopWatching = watchThemeMode((nextTheme) => {
      theme = nextTheme;
    });
    (async () => {
      workouts = await getAllWorkouts();
      loading = false;
    })().catch(() => {});
    return stopWatching;
  });

  const palette = $derived(trends.getChartThemePalette(theme === 'dark'));
  const calendarView = $derived(() => trends.buildCalendarView(workouts, 'past365', new Date().getFullYear()));
  const calendarSvg = $derived(() => {
    const view = calendarView();
    return trends.renderCalendarSvg({
      title: 'Past 365 days',
      subtitle: '',
      cells: view.cells,
      theme: palette,
      includeBackground: false,
      compact: true,
    });
  });

  const aggregatePreviewSvg = $derived(() => {
    const buckets = trends.buildMonthlyBuckets(workouts, 12);
    return trends.renderSeriesChartSvg({
      title: 'Gym time',
      subtitle: 'Past 12 months · Minutes spent in the gym each month',
      labels: buckets.map((bucket) => bucket.label),
      values: buckets.map((bucket) => bucket.minutes),
      metric: 'time',
      format: 'bar',
      legend: '',
      accent: '#38bdf8',
      theme: palette,
      includeBackground: false,
      compact: true,
    });
  });
</script>

<svelte:head>
  <title>Logbook – Trends</title>
  <meta name="description" content="Workout trends overview" />
</svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 lg:px-6">
  <span class="sr-only">Trends</span>

  <div class="grid gap-4">
    <a href="/trends/calendar" class="group rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm no-underline transition-transform hover:-translate-y-0.5 hover:shadow-md">
      <div class="mb-2 flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-[hsl(var(--foreground))]">Calendar</h2>
        <ChevronRight class="h-5 w-5 text-[hsl(var(--foreground))] opacity-80 group-hover:opacity-100" />
      </div>
      <div class="mb-2 h-0.5 w-full bg-[hsl(var(--foreground))] opacity-35"></div>
      {#if loading}
        <p class="text-sm text-[hsl(var(--foreground))] opacity-75">Loading preview...</p>
      {:else}
        {@html calendarSvg()}
      {/if}
    </a>

    <a href="/trends/aggregate" class="group rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm no-underline transition-transform hover:-translate-y-0.5 hover:shadow-md">
      <div class="mb-2 flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-[hsl(var(--foreground))]">General</h2>
        <ChevronRight class="h-5 w-5 text-[hsl(var(--foreground))] opacity-80 group-hover:opacity-100" />
      </div>
      <div class="mb-2 h-0.5 w-full bg-[hsl(var(--foreground))] opacity-35"></div>
      {#if loading}
        <p class="text-sm text-[hsl(var(--foreground))] opacity-75">Loading preview...</p>
      {:else}
        {@html aggregatePreviewSvg()}
      {/if}
    </a>

    <a href="/trends/exercise" class="group rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 pb-3 shadow-sm no-underline transition-transform hover:-translate-y-0.5 hover:shadow-md">
      <div class="mb-0 flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-[hsl(var(--foreground))]">By Movement</h2>
        <ChevronRight class="h-5 w-5 text-[hsl(var(--foreground))] opacity-80 group-hover:opacity-100" />
      </div>
    </a>
  </div>
</div>
