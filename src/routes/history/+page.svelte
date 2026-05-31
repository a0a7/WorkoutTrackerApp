<script lang="ts">

  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import WorkoutCard from '$lib/components/WorkoutCard.svelte';
  import { getAllWorkouts } from '$lib/db';
  import type { Workout, WorkoutSet } from '$lib/types';
  import { unitPreference, initUnitPreference, timeFormatPreference, initTimeFormatPreference } from '$lib/stores/userStore';
  import { formatWorkoutLocation } from '$lib/location';
  import { classifyWorkouts, getEffectiveWorkoutCategory, getWorkoutCategoryLabel, type DayCategory } from '$lib/workoutCategorization';

  let workouts = $state<Workout[]>([]);
  let loading = $state(true);
  let filterQuery = $state('');
  type DateWindow = 'all' | '7d' | '30d' | '90d' | '365d';
  const DATE_WINDOWS: DateWindow[] = ['all', '7d', '30d', '90d', '365d'];
  const DATE_WINDOW_LABELS: Record<DateWindow, string> = {
    all: 'All time',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    '90d': 'Last 90 days',
    '365d': 'Last year',
  };
  const DATE_WINDOW_DAYS: Record<Exclude<DateWindow, 'all'>, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '365d': 365,
  };
  let dateWindow = $state<DateWindow>('all');
  let sortMode = $state<'newest' | 'oldest' | 'duration-desc' | 'duration-asc' | 'volume-desc' | 'volume-asc'>('newest');
  let onlyWithLocation = $state(false);
  let compactness = $state<'card' | 'compact'>('card');
  let queryHydrated = $state(false);
  const unit = $derived($unitPreference);
  const timeFormat = $derived($timeFormatPreference);

  const DAY_TILE_STYLES: Record<DayCategory, string> = {
    rest: 'bg-slate-500 text-white',
    push: 'bg-red-600 text-white',
    pull: 'bg-blue-600 text-white',
    legs: 'bg-black text-white',
    'antagonist pull': 'bg-blue-800 text-white',
    'antagonist push': 'bg-red-800 text-white',
    upper: 'bg-slate-700 text-white',
    abs: 'bg-amber-700 text-white',
    back: 'bg-cyan-700 text-white',
    chest: 'bg-rose-700 text-white',
    arms: 'bg-violet-700 text-white',
    shoulders: 'bg-orange-700 text-white',
    'full body': 'bg-emerald-700 text-white',
  };

  const DAY_TILE_LABELS: Record<DayCategory, string> = {
    rest: 'Rest',
    push: 'Push',
    pull: 'Pull',
    legs: 'Legs',
    'antagonist pull': 'Anti Pull',
    'antagonist push': 'Anti Push',
    upper: 'Upper',
    abs: 'Abs',
    back: 'Back',
    chest: 'Chest',
    arms: 'Arms',
    shoulders: 'Shoulders',
    'full body': 'Full Body',
  };

  onMount(async () => {
    initUnitPreference();
    initTimeFormatPreference();
    const params = new URLSearchParams(window.location.search);

    const q = params.get('q');
    if (q) filterQuery = q;

    const dateParam = params.get('date');
    if (dateParam && DATE_WINDOWS.includes(dateParam as DateWindow)) {
      dateWindow = dateParam as DateWindow;
    }

    const sortParam = params.get('sort');
    if (sortParam && ['newest', 'oldest', 'duration-desc', 'duration-asc', 'volume-desc', 'volume-asc'].includes(sortParam)) {
      sortMode = sortParam as typeof sortMode;
    }

    onlyWithLocation = params.get('loc') === '1';

    const viewParam = params.get('view');
    if (viewParam === 'card' || viewParam === 'compact') {
      compactness = viewParam;
    } else {
      const savedCompactness = localStorage.getItem('history-compactness');
      if (savedCompactness === 'card' || savedCompactness === 'compact') {
        compactness = savedCompactness;
      }
    }

    queryHydrated = true;
    workouts = await getAllWorkouts();
    loading = false;
  });

  function setCompactness(mode: 'card' | 'compact') {
    compactness = mode;
    localStorage.setItem('history-compactness', mode);
  }

  function syncQueryParams() {
    if (!browser || !queryHydrated) return;
    const url = new URL(window.location.href);
    const q = filterQuery.trim();
    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');

    if (dateWindow !== 'all') url.searchParams.set('date', dateWindow);
    else url.searchParams.delete('date');

    if (sortMode !== 'newest') url.searchParams.set('sort', sortMode);
    else url.searchParams.delete('sort');

    if (onlyWithLocation) url.searchParams.set('loc', '1');
    else url.searchParams.delete('loc');

    if (compactness !== 'card') url.searchParams.set('view', compactness);
    else url.searchParams.delete('view');

    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.replaceState(window.history.state, '', next);
    }
  }

  $effect(() => {
    if (!queryHydrated) return;
    filterQuery;
    dateWindow;
    sortMode;
    onlyWithLocation;
    compactness;
    syncQueryParams();
  });

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

  function cycleDateWindow() {
    const current = DATE_WINDOWS.indexOf(dateWindow);
    dateWindow = DATE_WINDOWS[(current + 1) % DATE_WINDOWS.length];
  }

  function passesDateWindow(workout: Workout) {
    if (dateWindow === 'all') return true;
    const cutoff = Date.now() - DATE_WINDOW_DAYS[dateWindow] * 86400000;
    return workout.startTime >= cutoff;
  }

  const filtered = $derived(() => {
    let result = workouts;
    const q = filterQuery.trim().toLowerCase();
    if (filterQuery.trim()) {
      result = result.filter((w) => matchesFilter(w, q));
    }
    result = result.filter(passesDateWindow);
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

  function formatDayKey(ts: number) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const last7Days = $derived(() => {
    const workoutsByDay = new Map<string, Workout[]>();
    for (const workout of workouts) {
      const key = formatDayKey(workout.startTime);
      if (!workoutsByDay.has(key)) workoutsByDay.set(key, []);
      workoutsByDay.get(key)!.push(workout);
    }

    const days: Array<{ key: string; ts: number; dayLabel: string; dateLabel: string; category: DayCategory; categoryLabel: string; count: number }> = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let offset = 6; offset >= 0; offset--) {
      const ts = today.getTime() - offset * 86400000;
      const key = formatDayKey(ts);
      const dayWorkouts = workoutsByDay.get(key) ?? [];
      const category = classifyWorkouts(dayWorkouts);
      days.push({
        key,
        ts,
        dayLabel: new Date(ts).toLocaleDateString('en-US', { weekday: 'short' }),
        dateLabel: new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        category,
        categoryLabel: getWorkoutCategoryLabel(category),
        count: dayWorkouts.length,
      });
    }
    return days;
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

  <section class="mb-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-sm">
    <div class="grid grid-cols-7 gap-2">
      {#each last7Days() as day (day.key)}
        <div class="flex flex-col items-center gap-1">
          <div
            class={`flex aspect-square w-full min-w-0 items-center justify-center rounded-2xl text-center text-[10px] font-bold leading-tight tracking-wide shadow-sm ${DAY_TILE_STYLES[day.category]}`}
            title={`${day.dateLabel}: ${day.categoryLabel}${day.count ? ` (${day.count} workout${day.count === 1 ? '' : 's'})` : ''}`}
          >
            <span class="whitespace-pre-line px-1">{DAY_TILE_LABELS[day.category]}</span>
          </div>
          <p class="text-[10px] text-[hsl(var(--muted-foreground))]">{new Date(day.ts).getDate()}</p>
        </div>
      {/each}
    </div>
  </section>

  <!-- Filters -->
  <div class="mb-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-sm">
    <div class="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <input
        type="text"
        bind:value={filterQuery}
        placeholder="Search exercises, notes, locations"
        class="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
      />
      <div class="flex flex-wrap items-center gap-2 lg:justify-end">
        <button
          type="button"
          onclick={cycleDateWindow}
          title="Tap to cycle date range"
          class="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm font-semibold text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--muted))]"
        >
          Date: {DATE_WINDOW_LABELS[dateWindow]}
        </button>
        <button
          type="button"
          onclick={() => { onlyWithLocation = !onlyWithLocation; }}
          class="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm font-semibold text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--muted))]"
          aria-pressed={onlyWithLocation}
        >
          {onlyWithLocation ? 'Locations only' : 'All workouts'}
        </button>
        <select
          bind:value={sortMode}
          class="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="duration-desc">Longest duration</option>
          <option value="duration-asc">Shortest duration</option>
          <option value="volume-desc">Highest volume</option>
          <option value="volume-asc">Lowest volume</option>
        </select>
        <div class="inline-flex rounded-xl bg-[hsl(var(--muted))] p-1">
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
    </div>
    <p class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Showing {getWorkoutCountLabel()}</p>
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
                  <p class="truncate text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    {getWorkoutCategoryLabel(getEffectiveWorkoutCategory(workout))}
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
