<script lang="ts">
  import { untrack } from 'svelte';
  import type { WorkoutSet } from '../types';
  import ExerciseAutocomplete from './ExerciseAutocomplete.svelte';
  import type { Exercise } from '../types';

  const TOUCH_MOVEMENT_THRESHOLD_PX = 10;

  let {
    set,
    selected = false,
    isEmpty = false,
    setNumber = null,
    onUpdate,
    onAdd,
    onExerciseUpdate,
    onDelete,
    onSelect,
    onDragStart,
    onDragOver,
    onDrop,
    index,
  }: {
    set: WorkoutSet;
    selected?: boolean;
    isEmpty?: boolean;
    setNumber?: number | null;
    onUpdate?: (id: string, field: keyof WorkoutSet, value: unknown) => void;
    onAdd?: (set: WorkoutSet) => void;
    onExerciseUpdate?: (id: string, exerciseId: string, exerciseName: string) => void;
    onDelete?: (id: string) => void;
    onSelect?: (id: string, shiftKey?: boolean) => void;
    onDragStart?: (index: number) => void;
    onDragOver?: (index: number) => void;
    onDrop?: () => void;
    index: number;
  } = $props();

  // ── Real-row local state (always-editable reps/weight) ───────────────────
  let localReps = $state('');
  let localWeight = $state('');
  let editingExercise = $state(false);
  // Track whether any input in this row has focus (prevents effect from wiping mid-edit)
  let isEditing = $state(false);

  // Keep local values in sync with parent when not actively editing (e.g. undo/redo)
  $effect(() => {
    const r = set.reps;
    const w = set.weight;
    untrack(() => {
      if (!isEmpty && !isEditing) {
        localReps = r !== null ? String(r) : '';
        localWeight = w !== null ? String(w) : '';
      }
    });
  });

  // ── Empty-row draft state (committed as a single set) ────────────────────
  let draftExerciseId = $state('');
  let draftExerciseName = $state('');
  let draftReps = $state('');
  let draftWeight = $state('');

  // Delayed commit timer: necessary because clicking an autocomplete dropdown
  // briefly moves focus to the dropdown button (inside the row) then to body
  // (when the button unmounts), triggering a spurious focusout on the TR.
  // 200ms is enough to span the autocomplete-select focus round-trip while
  // still feeling immediate to the user.
  let commitTimer: ReturnType<typeof setTimeout> | undefined;

  // ── Input refs ───────────────────────────────────────────────────────────
  let repsInput = $state<HTMLInputElement | undefined>(undefined);
  let weightInput = $state<HTMLInputElement | undefined>(undefined);
  let trEl = $state<HTMLTableRowElement | undefined>(undefined);

  // ── Exercise ─────────────────────────────────────────────────────────────

  function handleExerciseSelected(ex: Exercise) {
    if (isEmpty) {
      draftExerciseId = ex.id;
      draftExerciseName = ex.name;
    } else {
      onExerciseUpdate?.(set.id, ex.id, ex.name);
      editingExercise = false;
    }
    // Move focus to reps after a brief pause (allows dropdown to close cleanly)
    setTimeout(() => repsInput?.focus(), 15);
  }

  // ── Reps ─────────────────────────────────────────────────────────────────

  function handleRepsInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    if (isEmpty) {
      draftReps = val;
    } else {
      localReps = val;
      // Save on every keystroke so tab-switching never loses data
      onUpdate?.(set.id, 'reps', val !== '' ? (parseInt(val, 10) || null) : null);
    }
  }

  function handleRepsKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      weightInput?.focus();
    }
  }

  // ── Weight ────────────────────────────────────────────────────────────────

  function handleWeightInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    if (isEmpty) {
      draftWeight = val;
    } else {
      localWeight = val;
      // Save on every keystroke
      onUpdate?.(set.id, 'weight', val !== '' ? (parseFloat(val) || null) : null);
    }
  }

  function handleWeightKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (isEmpty) flushEmptyRow();
      focusNextRow();
    }
  }

  // ── Empty-row commit ──────────────────────────────────────────────────────

  function flushEmptyRow() {
    if (!isEmpty) return;
    const reps = draftReps !== '' ? (parseInt(draftReps, 10) || null) : null;
    const weight = draftWeight !== '' ? (parseFloat(draftWeight) || null) : null;
    if (draftExerciseName || reps !== null || weight !== null) {
      onAdd?.({
        id: crypto.randomUUID(),
        localWorkoutId: set.localWorkoutId,
        exerciseId: draftExerciseId,
        exerciseName: draftExerciseName,
        reps,
        weight,
        order: set.order,
        createdAt: Date.now(),
      });
    }
    draftExerciseId = '';
    draftExerciseName = '';
    draftReps = '';
    draftWeight = '';
  }

  // ── Row focus tracking ────────────────────────────────────────────────────

  function handleRowFocusIn() {
    isEditing = true;
    // Cancel any pending commit caused by a transient focus-leave
    if (commitTimer !== undefined) {
      clearTimeout(commitTimer);
      commitTimer = undefined;
    }
  }

  function handleRowFocusOut(e: FocusEvent) {
    const tr = e.currentTarget as HTMLElement;
    if (!tr.contains(e.relatedTarget as Node)) {
      // Focus has left the row – but wait briefly in case it's a transient
      // departure (e.g. autocomplete dropdown button unmounting)
      isEditing = false;
      if (isEmpty) {
        commitTimer = setTimeout(() => {
          commitTimer = undefined;
          // Only commit if focus truly hasn't returned
          if (trEl && !trEl.contains(document.activeElement)) {
            flushEmptyRow();
          }
        }, 200);
      }
    }
  }

  // ── Cross-row Enter navigation ────────────────────────────────────────────

  function focusNextRow() {
    const tr = weightInput?.closest('tr') ?? repsInput?.closest('tr');
    const nextTr = tr?.nextElementSibling as HTMLElement | null;
    if (!nextTr) return;
    const firstInput = nextTr.querySelector('input') as HTMLInputElement | null;
    firstInput?.focus();
  }

  // ── Drag / touch ──────────────────────────────────────────────────────────

  let dragOver = $state(false);
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
  bind:this={trEl}
  class="group border-b border-[hsl(var(--border)/0.5)] last:border-b-0 transition-colors
    {selected ? 'bg-[hsl(var(--primary)/0.06)]' : 'hover:bg-[hsl(var(--muted)/0.25)]'}
    {dragOver ? 'outline outline-2 outline-[hsl(var(--primary))] outline-offset-[-1px]' : ''}"
  draggable="false"
  onfocusin={handleRowFocusIn}
  onfocusout={handleRowFocusOut}
  ondragover={(e) => { e.preventDefault(); dragOver = true; onDragOver?.(index); }}
  ondragleave={() => { dragOver = false; }}
  ondrop={(e) => { e.preventDefault(); dragOver = false; onDrop?.(); }}
>
  <!-- Set number / select -->
  <td class="w-8 text-center py-0 px-0.5">
    {#if isEmpty}
      <span class="block h-5 w-5 mx-auto"></span>
    {:else if selected}
      <button
        type="button"
        class="flex h-5 w-5 mx-auto items-center justify-center rounded-full bg-[hsl(var(--primary))]"
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
        class="flex h-5 w-5 mx-auto items-center justify-center rounded-full text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--primary)/0.1)] hover:text-[hsl(var(--primary))] transition-colors"
        onclick={(e) => onSelect?.(set.id, e.shiftKey)}
        ontouchstart={handleTouchStart}
        ontouchmove={handleTouchMove}
        ontouchend={handleTouchEnd}
        aria-label="Select set"
      >
        {setNumber}
      </button>
    {/if}
  </td>

  <!-- Exercise -->
  <td class="min-w-0 py-0.5 px-1">
    {#if isEmpty || editingExercise}
      <ExerciseAutocomplete
        value={isEmpty ? draftExerciseName : (set.exerciseName ?? '')}
        exerciseId={isEmpty ? draftExerciseId : (set.exerciseId ?? '')}
        onSelect={handleExerciseSelected}
        placeholder="Exercise…"
      />
    {:else}
      <button
        type="button"
        class="w-full text-left text-sm font-medium text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] py-1.5 px-1 transition-colors truncate block"
        onclick={() => { editingExercise = true; }}
      >
        {set.exerciseName || '—'}
      </button>
    {/if}
  </td>

  <!-- Reps – always-editable, looks like plain text -->
  <td class="w-16 py-0.5 px-0.5">
    <input
      bind:this={repsInput}
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      value={isEmpty ? draftReps : localReps}
      placeholder="—"
      oninput={handleRepsInput}
      onkeydown={handleRepsKeydown}
      class="w-full bg-transparent text-center py-1.5 px-0 rounded outline-none
             focus:bg-[hsl(var(--muted)/0.5)]
             placeholder:text-[hsl(var(--muted-foreground)/0.35)]
             transition-colors"
      style="font-size:16px"
      autocomplete="off"
    />
  </td>

  <!-- Weight – always-editable, looks like plain text -->
  <td class="w-16 py-0.5 px-0.5">
    <input
      bind:this={weightInput}
      type="text"
      inputmode="decimal"
      value={isEmpty ? draftWeight : localWeight}
      placeholder="—"
      oninput={handleWeightInput}
      onkeydown={handleWeightKeydown}
      class="w-full bg-transparent text-center py-1.5 px-0 rounded outline-none
             focus:bg-[hsl(var(--muted)/0.5)]
             placeholder:text-[hsl(var(--muted-foreground)/0.35)]
             transition-colors"
      style="font-size:16px"
      autocomplete="off"
    />
  </td>

  <!-- Delete -->
  <td class="w-8 py-0.5 px-0.5">
    {#if !isEmpty}
      <button
        type="button"
        onclick={() => onDelete?.(set.id)}
        class="flex h-6 w-6 mx-auto items-center justify-center rounded
               text-[hsl(var(--muted-foreground)/0.3)]
               opacity-0 group-hover:opacity-100
               hover:text-red-500 dark:hover:text-red-400
               transition-all"
        title="Delete set"
        aria-label="Delete set"
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"/>
        </svg>
      </button>
    {/if}
  </td>
</tr>

