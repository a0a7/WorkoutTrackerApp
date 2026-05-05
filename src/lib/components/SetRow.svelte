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
    setNumber = null,
    onUpdate,
    onDelete,
    onDuplicate,
    onSelect,
    onDragStart,
    onDragOver,
    onDrop,
    onBulkAdd,
    index,
  }: {
    set: WorkoutSet;
    selected?: boolean;
    isEmpty?: boolean;
    setNumber?: number | null;
    onUpdate?: (id: string, field: keyof WorkoutSet, value: unknown) => void;
    onDelete?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    onSelect?: (id: string, shiftKey?: boolean) => void;
    onDragStart?: (index: number) => void;
    onDragOver?: (index: number) => void;
    onDrop?: () => void;
    onBulkAdd?: (sets: WorkoutSet[]) => void;
    index: number;
  } = $props();

  let editingReps = $state(false);
  let editingWeight = $state(false);
  let editingExercise = $state(false);
  let repsRef = $state<HTMLInputElement | undefined>(undefined);
  let weightRef = $state<HTMLInputElement | undefined>(undefined);
  // Track raw text for reps field to support NxRxW shorthand
  let repsRaw = $state('');

  function startEditExercise() {
    editingExercise = true;
  }

  function handleExerciseSelect(ex: Exercise) {
    onUpdate?.(set.id, 'exerciseId', ex.id);
    onUpdate?.(set.id, 'exerciseName', ex.name);
    editingExercise = false;
  }

  // Parse NxRxW shorthand: "3x12x145" → { sets: 3, reps: 12, weight: 145 }
  // Also handles "12x145" (reps x weight) and plain numbers.
  function parseRepsInput(raw: string): { sets: number; reps: number; weight: number | null } | { reps: number } | null {
    const s = raw.trim().toLowerCase().replace(/\s+/g, '');
    if (!s) return null;
    const parts = s.split('x').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 3 && parts[0] > 0 && parts[1] > 0) {
      return { sets: parts[0], reps: parts[1], weight: parts[2] > 0 ? parts[2] : null };
    }
    if (parts.length === 1 && parts[0] > 0) {
      return { reps: parts[0] };
    }
    return null;
  }

  function handleRepsInput(e: Event) {
    repsRaw = (e.target as HTMLInputElement).value;
  }

  function handleRepsKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitReps();
    }
  }

  function commitReps() {
    if (!repsRaw) { editingReps = false; return; }
    const parsed = parseRepsInput(repsRaw);
    if (!parsed) { editingReps = false; return; }

    if ('sets' in parsed && parsed.sets > 1) {
      // Bulk add: create N sets with the given reps/weight
      const newSets: WorkoutSet[] = Array.from({ length: parsed.sets }, (_, i) => ({
        id: crypto.randomUUID(),
        localWorkoutId: set.localWorkoutId,
        exerciseId: set.exerciseId,
        exerciseName: set.exerciseName,
        reps: parsed.reps,
        weight: parsed.weight,
        order: set.order + i,
        createdAt: Date.now() + i,
      }));
      onBulkAdd?.(newSets);
      repsRaw = '';
      editingReps = false;
    } else {
      const reps = 'sets' in parsed ? parsed.reps : parsed.reps;
      onUpdate?.(set.id, 'reps', reps);
      if ('sets' in parsed && parsed.weight !== null) {
        onUpdate?.(set.id, 'weight', parsed.weight);
      }
      repsRaw = '';
      editingReps = false;
    }
  }

  function handleWeightChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    onUpdate?.(set.id, 'weight', val ? parseFloat(val) : null);
  }

  function startEditReps() {
    repsRaw = set.reps !== null ? String(set.reps) : '';
    editingReps = true;
    setTimeout(() => repsRef?.select(), INPUT_FOCUS_DELAY_MS);
  }

  function finishEditReps() {
    commitReps();
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

  // Touch drag for mobile reorder
  let touchStartY = $state(0);
  let touchDragging = $state(false);

  function handleTouchStart(e: TouchEvent) {
    touchStartY = e.touches[0].clientY;
    touchDragging = false;
  }
  function handleTouchMove(e: TouchEvent) {
    if (Math.abs(e.touches[0].clientY - touchStartY) > TOUCH_MOVEMENT_THRESHOLD_PX) {
      touchDragging = true;
    }
  }
  function handleTouchEnd(_e: TouchEvent) {
    if (!touchDragging && !isEmpty) {
      onSelect?.(set.id);
    }
    touchDragging = false;
  }
</script>

<tr
  class="group transition-colors {selected ? 'bg-[hsl(var(--primary)/0.08)]' : 'hover:bg-[hsl(var(--muted)/0.4)]'} {dragOver ? 'outline outline-2 outline-[hsl(var(--primary))] outline-offset-[-1px]' : ''}"
  draggable="false"
  ondragover={(e) => { e.preventDefault(); dragOver = true; onDragOver?.(index); }}
  ondragleave={() => { dragOver = false; }}
  ondrop={(e) => { e.preventDefault(); dragOver = false; onDrop?.(); }}
>
  <!-- Set number / select -->
  <td class="w-8 px-1 py-2 text-center">
    {#if isEmpty}
      <span class="block h-5 w-5 mx-auto"></span>
    {:else if selected}
      <button
        type="button"
        class="flex h-5 w-5 mx-auto items-center justify-center rounded-full bg-[hsl(var(--primary))] transition-all"
        onclick={(e) => onSelect?.(set.id, e.shiftKey)}
        ontouchstart={handleTouchStart}
        ontouchmove={handleTouchMove}
        ontouchend={handleTouchEnd}
        aria-label="Deselect set"
      >
        <svg class="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    {:else}
      <button
        type="button"
        class="flex h-5 w-5 mx-auto items-center justify-center rounded-full text-xs font-bold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--primary)/0.12)] hover:text-[hsl(var(--primary))] transition-all"
        onclick={(e) => onSelect?.(set.id, e.shiftKey)}
        ontouchstart={handleTouchStart}
        ontouchmove={handleTouchMove}
        ontouchend={handleTouchEnd}
        aria-label="Select set"
        title="Click to select"
      >
        {setNumber}
      </button>
    {/if}
  </td>

  <!-- Exercise -->
  <td class="min-w-0 px-1 py-1.5">
    {#if isEmpty || !set.exerciseName || editingExercise}
      <ExerciseAutocomplete
        value={set.exerciseName ?? ''}
        exerciseId={set.exerciseId ?? ''}
        onSelect={handleExerciseSelect}
        placeholder="Exercise…"
      />
    {:else}
      <button
        type="button"
        class="w-full text-left text-sm font-medium text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] transition-colors truncate"
        onclick={startEditExercise}
      >
        {set.exerciseName}
      </button>
    {/if}
  </td>

  <!-- Reps -->
  <td class="w-20 px-1 py-1.5">
    {#if isEmpty || set.reps === null || editingReps}
      <input
        bind:this={repsRef}
        type="text"
        inputmode="decimal"
        value={repsRaw || (set.reps !== null ? String(set.reps) : '')}
        placeholder="Reps"
        oninput={handleRepsInput}
        onkeydown={handleRepsKeydown}
        onblur={finishEditReps}
        class="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-center text-sm outline-none focus:border-[hsl(var(--primary))] focus:ring-1 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground)/0.5)]"
        autocomplete="off"
      />
    {:else}
      <button
        type="button"
        class="w-full text-center text-sm font-semibold text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] transition-colors"
        onclick={startEditReps}
      >
        {set.reps}
      </button>
    {/if}
  </td>

  <!-- Weight -->
  <td class="w-20 px-1 py-1.5">
    {#if isEmpty || set.weight === null || editingWeight}
      <input
        bind:this={weightRef}
        type="number"
        inputmode="decimal"
        value={set.weight ?? ''}
        placeholder="—"
        min="0"
        max="9999"
        step="2.5"
        oninput={handleWeightChange}
        onblur={finishEditWeight}
        class="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-center text-sm outline-none focus:border-[hsl(var(--primary))] focus:ring-1 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground)/0.5)]"
      />
    {:else}
      <button
        type="button"
        class="w-full text-center text-sm font-semibold text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] transition-colors"
        onclick={startEditWeight}
      >
        {set.weight}
      </button>
    {/if}
  </td>

  <!-- Actions (dup / delete) -->
  <td class="w-12 px-0.5 py-1.5">
    {#if !isEmpty}
      <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onclick={() => onDuplicate?.(set.id)}
          class="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-colors"
          title="Duplicate"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="5" y="5" width="8" height="8" rx="1.5"/>
            <path d="M3 11V4a1 1 0 011-1h7"/>
          </svg>
        </button>
        <button
          type="button"
          onclick={() => onDelete?.(set.id)}
          class="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
          title="Delete"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"/>
          </svg>
        </button>
      </div>
    {/if}
  </td>

  <!-- Drag handle – always visible on real rows -->
  <td class="w-7 px-0.5 py-1.5">
    {#if !isEmpty}
      <div
        draggable="true"
        ondragstart={() => { dragging = true; onDragStart?.(index); }}
        ondragend={() => { dragging = false; }}
        class="flex h-6 w-6 cursor-grab items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] active:cursor-grabbing transition-colors"
        role="button"
        tabindex="-1"
        aria-label="Drag to reorder"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" opacity="0.5">
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

