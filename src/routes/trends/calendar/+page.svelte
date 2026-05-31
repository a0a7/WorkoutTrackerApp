<script lang="ts">
  import { onMount } from 'svelte';
  import { getAllWorkouts } from '$lib/db';
  import type { Workout } from '$lib/types';
  import { buildCalendarView, getChartThemePalette, renderCalendarSvg } from '$lib/trends';
  import { downloadSvg, getThemeMode, shareSvg, watchThemeMode } from '$lib/trendsView';

  let workouts = $state<Workout[]>([]);
  let loading = $state(true);
  let calendarMode = $state<'past365' | 'year'>('past365');
  let selectedCalendarYear = $state(new Date().getFullYear());
  let theme = $state<'light' | 'dark'>(getThemeMode());

  onMount(() => {
    const stopWatching = watchThemeMode((nextTheme) => {
      theme = nextTheme;
    });
    (async () => {
      workouts = await getAllWorkouts();
      const years = [...new Set(workouts.map((workout) => new Date(workout.startTime).getFullYear()))].sort((a, b) => a - b);
      selectedCalendarYear = years.at(-1) ?? new Date().getFullYear();
      loading = false;
    })().catch(() => {});
    return stopWatching;
  });

  const palette = $derived(getChartThemePalette(theme === 'dark'));
  const calendarView = $derived(() => buildCalendarView(workouts, calendarMode, selectedCalendarYear));
  const calendarSvg = $derived(() => {
    const view = calendarView();
    return renderCalendarSvg({
      title: calendarMode === 'past365' ? 'Past 365 days' : `${selectedCalendarYear}`,
      subtitle: '',
      cells: view.cells,
      theme: palette,
    });
  });
</script>

<svelte:head>
  <title>Logbook – Calendar Trends</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 lg:px-6">
  <header class="space-y-2">
    <a href="/trends" class="text-xs font-semibold uppercase tracking-[0.24em] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]">Trends / Calendar</a>
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">Calendar</h1>
        <p class="text-sm text-[hsl(var(--muted-foreground))]">Year-based workout grids with save and share actions.</p>
      </div>
      <a href="/trends" class="rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]">Back to Trends</a>
    </div>
  </header>

  <section class="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm lg:p-5">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm font-semibold text-[hsl(var(--foreground))]">Workout calendar</p>
        <p class="text-xs text-[hsl(var(--muted-foreground))]">Click a year to switch the full calendar into that year.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button class="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors {calendarMode === 'past365' ? 'border-[hsl(var(--foreground))] bg-[hsl(var(--foreground))] text-[hsl(var(--background))]' : 'border-[hsl(var(--border))] bg-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}" onclick={() => calendarMode = 'past365'}>Past 365</button>
        {#each calendarView().years as year}
          <button class="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors {calendarMode === 'year' && selectedCalendarYear === year ? 'border-[hsl(var(--foreground))] bg-[hsl(var(--foreground))] text-[hsl(var(--background))]' : 'border-[hsl(var(--border))] bg-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}" onclick={() => { calendarMode = 'year'; selectedCalendarYear = year; }}>{year}</button>
        {/each}
      </div>
    </div>

    {#if loading}
      <div class="rounded-2xl border border-dashed border-[hsl(var(--border))] p-8 text-sm text-[hsl(var(--muted-foreground))]">Loading calendar...</div>
    {:else}
      <div class="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-inner">
        {@html calendarSvg()}
      </div>
      <div class="mt-4 flex gap-2">
        <button class="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] px-3 py-2 text-xs font-semibold text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]" onclick={() => downloadSvg(calendarSvg(), `trends-calendar-${calendarMode}.svg`)}>Save</button>
        <button class="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] px-3 py-2 text-xs font-semibold text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]" onclick={() => shareSvg(calendarSvg(), `trends-calendar-${calendarMode}.svg`, 'Workout calendar')}>Share</button>
      </div>
    {/if}
  </section>
</div>
