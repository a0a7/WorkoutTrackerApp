<script lang="ts">
  import { onMount } from 'svelte';
  import { getAllWorkouts } from '$lib/db';
  import type { Workout } from '$lib/types';
  import { buildMonthlyBuckets, getChartThemePalette, renderSeriesChartSvg, type AggregateMetric, type ChartFormat, type TimeScale } from '$lib/trends';
  import { downloadSvg, getThemeMode, shareSvg, watchThemeMode } from '$lib/trendsView';
  import { Download, Share2 } from 'lucide-svelte';

  let workouts = $state<Workout[]>([]);
  let loading = $state(true);
  let aggregateScale = $state<TimeScale>('12m');
  let aggregateFormat = $state<ChartFormat>('bar');
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

  const palette = $derived(getChartThemePalette(theme === 'dark'));

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

  const aggregateMonthCount = $derived(() => scaleToMonthCount(aggregateScale));
  const aggregateBuckets = $derived(() => buildMonthlyBuckets(workouts, aggregateMonthCount()));

  function chartForMetric(metric: AggregateMetric) {
    const buckets = aggregateBuckets();
    const values = buckets.map((bucket) => {
      switch (metric) {
        case 'time': return bucket.minutes;
        case 'sets': return bucket.sets;
        case 'reps': return bucket.reps;
        case 'volume': return bucket.volume;
        default: return bucket.minutes;
      }
    });
    const title = metric === 'time' ? 'Gym time' : metric === 'sets' ? 'Sets' : metric === 'reps' ? 'Reps' : 'Volume';
    const legend = metric === 'time'
      ? 'Minutes spent in the gym each month'
      : metric === 'sets'
        ? 'Total sets completed each month'
        : metric === 'reps'
          ? 'Total reps completed each month'
          : 'Total training volume each month';
    const svg = renderSeriesChartSvg({
      title,
      subtitle: `${scaleLabel(aggregateScale)} · ${legend}`,
      labels: buckets.map((bucket) => bucket.label),
      values,
      metric,
      format: aggregateFormat,
      legend: '',
      accent: metric === 'time' ? '#38bdf8' : metric === 'sets' ? '#4ade80' : metric === 'reps' ? '#f472b6' : '#f59e0b',
      theme: palette,
    });
    return { metric, title, legend, svg, filename: `trends-${metric}.svg` };
  }

  const charts = $derived(() => [chartForMetric('time'), chartForMetric('sets'), chartForMetric('reps'), chartForMetric('volume')]);
</script>

<svelte:head>
  <title>Logbook – Aggregate Trends</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 lg:px-6">
  <header class="space-y-2">
    <a href="/trends" class="text-xs font-semibold uppercase tracking-[0.24em] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]">Trends / Aggregate</a>
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">Aggregate charts</h1>
        <p class="text-sm text-[hsl(var(--muted-foreground))]">Time, sets, reps, and volume over the selected range.</p>
      </div>
      <a href="/trends" class="rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]">Back to Trends</a>
    </div>
  </header>

  <section class="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm lg:p-5">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm font-semibold text-[hsl(var(--foreground))]">Aggregate workout data</p>
        <p class="text-xs text-[hsl(var(--muted-foreground))]">Choose time scale and chart style, then export or share any chart.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select bind:value={aggregateScale} class="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-xs font-semibold text-[hsl(var(--foreground))] shadow-sm outline-none">
          <option value="3m">3 months</option>
          <option value="6m">6 months</option>
          <option value="12m">12 months</option>
          <option value="24m">24 months</option>
          <option value="all">All time</option>
        </select>
        <select bind:value={aggregateFormat} class="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-xs font-semibold text-[hsl(var(--foreground))] shadow-sm outline-none">
          <option value="bar">Bar</option>
          <option value="scatter">Scatter</option>
          <option value="moving-average">Moving average</option>
        </select>
      </div>
    </div>

    {#if loading}
      <div class="rounded-2xl border border-dashed border-[hsl(var(--border))] p-8 text-sm text-[hsl(var(--muted-foreground))]">Loading aggregate charts...</div>
    {:else}
      <div class="grid gap-4 lg:grid-cols-2">
        {#each charts() as chart}
          <article class="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 shadow-sm">
            <div class="mb-2 flex items-start justify-between gap-2">
              <div>
                <h3 class="text-sm font-semibold text-[hsl(var(--foreground))]">{chart.title}</h3>
                <p class="text-xs text-[hsl(var(--muted-foreground))]">{chart.legend}</p>
              </div>
              <div class="flex items-center gap-1">
                <button class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]" onclick={() => downloadSvg(chart.svg, chart.filename)}>
                  <Download class="h-3.5 w-3.5" />
                </button>
                <button class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]" onclick={() => shareSvg(chart.svg, chart.filename, chart.title)}>
                  <Share2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div class="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              {@html chart.svg}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</div>
