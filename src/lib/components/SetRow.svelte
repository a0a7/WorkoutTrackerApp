<script lang="ts">
  import type { WorkoutSet } from '../types';
  import ExerciseAutocomplete from './ExerciseAutocomplete.svelte';
  import type { Exercise } from '../types';

  // UI constants
  const TOUCH_MOVEMENT_THRESHOLD_PX = 10;
  const INPUT_FOCUS_DELAY_MS = 10;

  let {
    set,
    selected = false,
    isEmpty = false,
    onUpdate,
    onDelete,
    onDuplicate,
    onSelect,
    onDragStart,
    onDragOver,
    onDrop,
    index,
  }: {
    set: WorkoutSet;
    selected?: boolean;
    isEmpty?: boolean;
    onUpdate?: (id: string, field: keyof WorkoutSet, value: unknown) => void;
    onDelete?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    onSelect?: (id: string, shiftKey?: boolean) => void;
    onDragStart?: (index: number) => void;
    onDragOver?: (index: number) => void;
    onDrop?: () => void;
    index: number;
  } = $props();

  // Local editing state for filled fields
  let editingReps = $state(false);
  let editingWeight = $state(false);
  let editingExercise = $state(false);
  let repsRef = $state<HTMLInputElement | undefined>(undefined);
  let weightRef = $state<HTMLInputElement | undefined>(undefined);

  function startEditExercise() {
    editingExercise = true;
  }

  function handleExerciseSelect(ex: Exercise) {
    onUpdate?.(set.id, 'exerciseId', ex.id);
    onUpdate?.(set.id, 'exerciseName', ex.name);
    editingExercise = false;
  }

  function handleRepsChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    onUpdate?.(set.id, 'reps', val ? parseInt(val) : null);
  }

  function handleWeightChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    onUpdate?.(set.id, 'weight', val ? parseFloat(val) : null);
  }

  function startEditReps() {
    editingReps = true;
    setTimeout(() => repsRef?.select(), INPUT_FOCUS_DELAY_MS);
  }

  function finishEditReps() {
    editingReps = false;
  }

  function startEditWeight() {
    editingWeight = true;
    setTimeout(() => weightRef?.select(), INPUT_FOCUS_DELAY_MS);
  }

  function finishEditWeight() {
    editingWeight = false;
  }

  let dragging = $state(false);
  let dragOver = $state(false);

  // Touch tap detection for set selection
  let touchStartY = $state(0);
  function handleTouchStart(e: TouchEvent) {
    touchStartY = e.touches[0].clientY;
  }
  function handleTouchEnd(e: TouchEvent) {
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
    if (dy < TOUCH_MOVEMENT_THRESHOLD_PX && !isEmpty) {
      onSelect?.(set.id);
    }
  }
</script>

<tr
  class="group relative transition-colors {selected ? 'bg-[hsl(var(--primary)/0.08)]' : 'hover:bg-[hsl(var(--muted)/0.5)]'} {dragOver ? 'border-t-2 border-[hsl(var(--primary))]' : ''}"
  draggable="false"
  ondragover={(e) => { e.preventDefault(); dragOver = true; onDragOver?.(index); }}
  ondragleave={() => { dragOver = false; }}
  ondrop={(e) => { e.preventDefault(); dragOver = false; onDrop?.(); }}
>
  <!-- Select circle -->
  <td class="w-8 px-1 py-2">
    <button
      type="button"
      class="flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all {selected
        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]'
        : 'border-[hsl(var(--border))] bg-transparent hover:border-[hsl(var(--primary)/0.5)]'}"
      onclick={(e) => onSelect?.(set.id, e.shiftKey)}
      ontouchstart={handleTouchStart}
      ontouchend={handleTouchEnd}
      aria-label="Select set"
    >
      {#if selected}
        <svg class="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      {/if}
    </button>
  </td>

  <!-- Exercise -->
  <td class="min-w-0 flex-1 px-1 py-2">
    {#if isEmpty || !set.exerciseName || editingExercise}
      <ExerciseAutocomplete
        value={set.exerciseName ?? ''}
        exerciseId={set.exerciseId ?? ''}
        onSelect={handleExerciseSelect}
        placeholder="Exercise..."
      />
    {:else}
      <button
        type="button"
        class="w-full text-left text-sm font-medium text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] transition-colors truncate"
        onclick={startEditExercise}
        title="Tap to change exercise"
      >
        {set.exerciseName}
      </button>
    {/if}
  </td>

  <!-- Reps -->
  <td class="w-16 px-1 py-2">
    {#if isEmpty || set.reps === null || editingReps}
      <input
        bind:this={repsRef}
        type="number"
        value={set.reps ?? ''}
        placeholder="Reps"
        min="0"
        max="9999"
        oninput={handleRepsChange}
        onblur={finishEditReps}
        class="w-full rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-center text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
      />
    {:else}
      <button
        type="button"
        class="w-full text-center text-sm font-semibold text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] transition-colors"
        onclick={startEditReps}
        title="Tap to edit"
      >
        {set.reps}
      </button>
    {/if}
  </td>

  <!-- Weight -->
  <td class="w-20 px-1 py-2">
    {#if isEmpty || set.weight === null || editingWeight}
      <input
        bind:this={weightRef}
        type="number"
        value={set.weight ?? ''}
        placeholder="lbs"
        min="0"
        max="9999"
        step="2.5"
        oninput={handleWeightChange}
        onblur={finishEditWeight}
        class="w-full rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-center text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
      />
    {:else}
      <button
        type="button"
        class="w-full text-center text-sm font-semibold text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] transition-colors"
        onclick={startEditWeight}
        title="Tap to edit"
      >
        {set.weight}
      </button>
    {/if}
  </td>

  <!-- Actions -->
  <td class="w-16 px-1 py-2">
    {#if !isEmpty}
      <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onclick={() => onDuplicate?.(set.id)}
          class="flex h-6 w-6 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-colors"
          title="Duplicate"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="5" y="5" width="8" height="8" rx="1.5"/>
            <path d="M3 11V4a1 1 0 011-1h7"/>
          </svg>
        </button>
        <button
          type="button"
          onclick={() => onDelete?.(set.id)}
          class="flex h-6 w-6 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
          title="Delete"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"/>
          </svg>
        </button>
      </div>
    {/if}
  </td>

  <!-- Drag handle -->
  <td class="w-8 px-1 py-2">
    {#if !isEmpty}
      <div
        draggable="true"
        ondragstart={() => { dragging = true; onDragStart?.(index); }}
        ondragend={() => { dragging = false; }}
        class="flex h-6 w-6 cursor-grab items-center justify-center rounded text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100 active:cursor-grabbing transition-opacity"
        role="button"
        tabindex="-1"
        aria-label="Drag to reorder"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <circle cx="5" cy="4" r="1.2"/>
          <circle cx="11" cy="4" r="1.2"/>
          <circle cx="5" cy="8" r="1.2"/>
          <circle cx="11" cy="8" r="1.2"/>
          <circle cx="5" cy="12" r="1.2"/>
          <circle cx="11" cy="12" r="1.2"/>
        </svg>
      </div>
    {/if}
  </td>
</tr>

