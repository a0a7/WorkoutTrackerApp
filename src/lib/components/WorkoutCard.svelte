<script lang="ts">
  import type { Workout } from '../types';
  import { EXERCISE_MAP } from '../exercises';
  import { timeFormatPreference } from '$lib/stores/userStore';
  import { formatWorkoutLocation } from '$lib/location';

  let { workout }: { workout: Workout } = $props();

  const durationMs = $derived(workout.endTime - workout.startTime);
  const durationMin = $derived(Math.round(durationMs / 60000));

  const exerciseNames = $derived(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const s of workout.sets) {
      if (!seen.has(s.exerciseId)) {
        seen.add(s.exerciseId);
        names.push(s.exerciseName);
      }
    }
    return names;
  });

  const dateLabel = $derived(
    new Date(workout.startTime).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    })
  );

  const timeLabel = $derived(
    new Date(workout.startTime).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: $timeFormatPreference === '12h',
    })
  );
</script>

<a
  href="/workout/{workout.id}"
  data-sveltekit-preload-data="off"
  class="block rounded-2xl bg-[hsl(var(--card))] p-4 shadow-sm border border-[hsl(var(--border))] active:scale-[0.98] transition-transform"
>
  <div class="flex items-center justify-between mb-2">
    <div>
      <p class="font-semibold text-[hsl(var(--foreground))]">{dateLabel}</p>
      <p class="text-sm text-[hsl(var(--muted-foreground))]">{timeLabel}</p>
      {#if workout.location}
        <p class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          <span class="inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-0.5 font-medium text-[hsl(var(--foreground))]">
            {formatWorkoutLocation(workout.location)}
          </span>
        </p>
      {/if}
    </div>
    <div class="text-right">
      <p class="text-sm font-medium text-[hsl(var(--foreground))]">
        {workout.endTime === null
          ? 'In progress'
          : durationMin >= 60
          ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
          : `${durationMin}m`}
      </p>
      <p class="text-xs text-[hsl(var(--muted-foreground))]">{workout.sets.length} sets</p>
    </div>
  </div>

  <div class="flex flex-wrap gap-1.5 mt-3">
    {#each exerciseNames().slice(0, 4) as name (name)}
      <span class="inline-flex items-center rounded-full bg-[hsl(var(--secondary))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--secondary-foreground))]">
        {name}
      </span>
    {/each}
    {#if exerciseNames().length > 4}
      <span class="inline-flex items-center rounded-full bg-[hsl(var(--muted))] px-2.5 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
        +{exerciseNames().length - 4} more
      </span>
    {/if}
  </div>
</a>
