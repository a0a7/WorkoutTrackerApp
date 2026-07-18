<script lang="ts">
  import { onMount } from 'svelte';
  import { getAllWorkouts } from '$lib/db';
  import type { Workout } from '$lib/types';
  import { adjustToSixRepMax, buildExercisePoints, getAvailableExercises, getChartThemePalette, getWorkoutExerciseType, renderSeriesChartSvg, type ChartFormat, type TimeScale } from '$lib/trends';
  import { downloadSvg, getThemeMode, shareSvg, watchThemeMode } from '$lib/trendsView';
  import { ChevronDown, Download, Search, Share2 } from 'lucide-svelte';

  let workouts = $state<Workout[]>([]);
  let loading = $state(true);
  let exerciseScale = $state<TimeScale>('12m');
  let exerciseFormat = $state<ChartFormat>('scatter');
  let exerciseSearch = $state('');
  let selectedExercise = $state('');
  let showExerciseMenu = $state(false);
  let theme = $state<'light' | 'dark'>(getThemeMode());

  onMount(() => {
    const stopWatching = watchThemeMode((nextTheme) => {
      theme = nextTheme;
    });
    (async () => {
      workouts = await getAllWorkouts();
      selectedExercise = getAvailableExercises(workouts)[0] ?? '';
      exerciseSearch = selectedExercise;
      loading = false;
    })().catch(() => {});
    return stopWatching;
  });

  const palette = $derived(getChartThemePalette(theme === 'dark'));
  const availableExercises = $derived(() => getAvailableExercises(workouts));

  function scaleToMonthCount(scale: TimeScale): number {
    if (scale === 'all') {
      if (workouts.length === 0) return 12;
      const earliest = workouts.reduce((min, workout) => Math.min(min, workout.startTime), Date.now());
      const start = new Date(earliest);
      const now = new Date();
      return Math.max(1, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth() + 1);
    }
    return Number(scale.replace('m', ''));
  }

  function scaleLabel(scale: TimeScale): string {
    if (scale === 'all') return 'All time';
    const months = Number(scale.replace('m', ''));
    return `${months} month${months === 1 ? '' : 's'}`;
  }

  const exercisePointSeries = $derived(() => buildExercisePoints(workouts, selectedExercise, exerciseScale));

  const exerciseChartSvg = $derived(() => {
    if (!selectedExercise) return '';
    const legend = 'Each point is normalized to an estimated 6 rep max';
    const points = exercisePointSeries();
    const values = exerciseFormat === 'scatter'
      ? points.map((point) => point.value)
      : points.map((point) => point.value);
    const labels = points.map((point) => point.label);
    return renderSeriesChartSvg({
      title: selectedExercise,
      subtitle: `${scaleLabel(exerciseScale)} · ${legend}`,
      labels,
      values,
      metric: 'weight',
      format: exerciseFormat,
      legend: '',
      accent: '#38bdf8',
      unitLabel: 'lb',
      theme: palette,
    });
  });

  const filteredExercises = $derived(() => {
    const query = exerciseSearch.trim().toLowerCase();
    const items = availableExercises();
    if (!query) return items.slice(0, 12);
    return items.filter((exercise) => exercise.toLowerCase().includes(query)).slice(0, 12);
  });

  function setExerciseFromSearch(exercise: string) {
    selectedExercise = exercise;
    exerciseSearch = exercise;
    showExerciseMenu = false;
  }

  function selectedExerciseType(): string {
    const workout = workouts.find((entry) => entry.sets.some((set) => set.exerciseName === selectedExercise));
    return workout ? getWorkoutExerciseType(workout) : '';
  }
</script>

<svelte:head>
  <title>Logbook – Exercise Trends</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 lg:px-6">
  <header class="space-y-2">
    <a href="/trends" class="text-xs font-semibold uppercase tracking-[0.24em] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]">Trends / Exercises</a>
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">Per-exercise charts</h1>
        <p class="text-sm text-[hsl(var(--muted-foreground))]">Search an exercise and view normalized 6RM progress over time.</p>
      </div>
      <a href="/trends" class="rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]">Back to Trends</a>
    </div>
  </header>

  <section class="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm lg:p-5">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm font-semibold text-[hsl(var(--foreground))]">Per-exercise charts</p>
        <p class="text-xs text-[hsl(var(--muted-foreground))]">Default view is scatter. Change the time scale or chart format to inspect progress.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select bind:value={exerciseScale} class="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-xs font-semibold text-[hsl(var(--foreground))] shadow-sm outline-none">
          <option value="3m">3 months</option>
          <option value="6m">6 months</option>
          <option value="12m">12 months</option>
          <option value="24m">24 months</option>
          <option value="all">All time</option>
        </select>
        <select bind:value={exerciseFormat} class="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-xs font-semibold text-[hsl(var(--foreground))] shadow-sm outline-none">
          <option value="scatter">Scatter</option>
          <option value="bar">Bar</option>
          <option value="moving-average">Moving average</option>
        </select>
      </div>
    </div>

    <div class="relative mb-4 max-w-2xl">
      <label class="sr-only" for="exercise-search">Search exercises</label>
      <div class="flex items-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 shadow-sm">
        <Search class="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
        <input
          id="exercise-search"
          bind:value={exerciseSearch}
          class="w-full bg-transparent text-sm text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))]"
          placeholder="Search exercises you have done"
          onclick={() => showExerciseMenu = true}
          onfocus={() => showExerciseMenu = true}
          onkeydown={(event) => {
            if (event.key === 'Enter' && filteredExercises()[0]) {
              setExerciseFromSearch(filteredExercises()[0]);
            }
          }}
        />
        <button class="inline-flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))]" onclick={() => showExerciseMenu = !showExerciseMenu}>
          <ChevronDown class="h-4 w-4" />
        </button>
      </div>
      {#if showExerciseMenu && filteredExercises().length > 0}
        <div class="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg">
          {#each filteredExercises() as exercise}
            <button class="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-[hsl(var(--accent))]" onclick={() => setExerciseFromSearch(exercise)}>
              <span class="font-medium text-[hsl(var(--foreground))]">{exercise}</span>
              <span class="text-xs text-[hsl(var(--muted-foreground))]">{selectedExerciseType()}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#if loading}
      <div class="rounded-2xl border border-dashed border-[hsl(var(--border))] p-8 text-sm text-[hsl(var(--muted-foreground))]">Loading exercise charts...</div>
    {:else if selectedExercise}
      <article class="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 shadow-sm">
        <div class="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold text-[hsl(var(--foreground))]">{selectedExercise}</h3>
            <p class="text-xs text-[hsl(var(--muted-foreground))]">Scatter, bar, or moving-average view normalized to a 6RM.</p>
          </div>
          <div class="flex items-center gap-1">
            <button class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]" onclick={() => downloadSvg(exerciseChartSvg(), `trends-${selectedExercise.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.svg`)}>
              <Download class="h-3.5 w-3.5" />
            </button>
            <button class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]" onclick={() => shareSvg(exerciseChartSvg(), `trends-${selectedExercise.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.svg`, selectedExercise)}>
              <Share2 class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div class="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          {@html exerciseChartSvg()}
        </div>
        <div class="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Values are adjusted using the Brzycki formula to compare different rep counts on the same scale.</div>
      </article>
    {:else}
      <div class="rounded-2xl border border-dashed border-[hsl(var(--border))] p-8 text-sm text-[hsl(var(--muted-foreground))]">No exercises found yet.</div>
    {/if}
  </section>
</div>
