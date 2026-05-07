<script lang="ts">
  import { untrack } from 'svelte';
  import type { WorkoutSet } from '../types';
  import ExerciseAutocomplete from './ExerciseAutocomplete.svelte';
  import type { Exercise } from '../types';
  import { openKeypad, closeKeypad, keypadConfig } from '$lib/stores/keypadStore';

  const TOUCH_MOVEMENT_THRESHOLD_PX = 10;

  let {
    set,
    selected = false,
    isEmpty = false,
    setNumber = null,
    onUpdate,
    onUpdateMultiple,
    onAdd,
    onAddMultiple,
    onExerciseUpdate,
    onDelete,
    onSelect,
    onExpandSet,
    onDragStart,
    onDragOver,
    onDrop,
    onTouchReorder,
    index,
  }: {
    set: WorkoutSet;
    selected?: boolean;
    isEmpty?: boolean;
    setNumber?: number | null;
    onUpdate?: (id: string, field: keyof WorkoutSet, value: unknown) => void | Promise<void>;
    onUpdateMultiple?: (id: string, updates: Partial<WorkoutSet>) => void | Promise<void>;
    onAdd?: (set: WorkoutSet) => void | Promise<void>;
    onAddMultiple?: (sets: WorkoutSet[]) => void | Promise<void>;
    onExerciseUpdate?: (id: string, exerciseId: string, exerciseName: string) => void | Promise<void>;
    onDelete?: (id: string) => void | Promise<void>;
    onSelect?: (id: string, shiftKey?: boolean) => void;
    onExpandSet?: (id: string, newSets: WorkoutSet[]) => void | Promise<void>;
    onDragStart?: (index: number) => void;
    onDragOver?: (index: number) => void;
    onDrop?: () => void;
    onTouchReorder?: (fromIndex: number, toIndex: number) => void | Promise<void>;
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
  let repsBtnEl = $state<HTMLButtonElement | undefined>(undefined);
  let weightBtnEl = $state<HTMLButtonElement | undefined>(undefined);
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
    setTimeout(() => doOpenRepsKeypad(), 15);
  }

  // ── Reps ─────────────────────────────────────────────────────────────────

  function handleRepsInput(v: string) {
    if (isEmpty) {
      draftReps = v;
    } else {
      localReps = v;
      // If this looks like a shorthand (contains separator), don't save as a number yet —
      // wait until the user commits with Done (handled in onDone callback).
      if (!/[xX×*]/.test(v)) {
        onUpdate?.(set.id, 'reps', v !== '' ? (parseInt(v, 10) || null) : null);
      }
    }
  }

  function doOpenWeightKeypad() {
    let captured = isEmpty ? draftWeight : localWeight;
    openKeypad({
      id: `${set.id}:weight`,
      value: captured,
      allowDecimal: true,
      allowShorthand: false,
      label: 'Weight',
      onInput: (v) => {
        captured = v;
        if (isEmpty) {
          draftWeight = v;
        } else {
          localWeight = v;
          onUpdate?.(set.id, 'weight', v !== '' ? (parseFloat(v) || null) : null);
        }
      },
      onDone: async () => {
        if (isEmpty) {
          await flushEmptyRow();
        }
      },
      onCancel: () => {
        if (isEmpty) {
          draftWeight = captured;
          return;
        }
        localWeight = set.weight !== null ? String(set.weight) : '';
      },
    });
    scrollRowIntoView();
  }

  function doOpenRepsKeypad() {
    let captured = isEmpty ? draftReps : localReps;
    const commitRepsValue = async () => {
      if (isEmpty) {
        await flushEmptyRow();
        captured = '';
        return true;
      }

      // 3-part NxRxW → expand to N sets
      const multi = captured.match(MULTI_SET_RE);
      if (multi && onExpandSet) {
        const count = parseInt(multi[1], 10);
        const reps = parseInt(multi[2], 10);
        const weight = parseFloat(multi[3]);
        if (count >= 1 && count <= MAX_MULTI_SET_COUNT) {
          const now = Date.now();
          const newSets: WorkoutSet[] = Array.from({ length: count }, (_, i) => ({
            id: crypto.randomUUID(),
            localWorkoutId: set.localWorkoutId,
            exerciseId: set.exerciseId,
            exerciseName: set.exerciseName,
            reps,
            weight,
            order: set.order + i,
            createdAt: now + i,
          }));
          await onExpandSet(set.id, newSets);
          return true;
        }
      }

      // 2-part RxW → update this set's reps and weight together
      const pair = captured.match(SINGLE_PAIR_RE);
      if (pair) {
        const reps = parseInt(pair[1], 10) || null;
        const weight = parseFloat(pair[2]) || null;
        if (onUpdateMultiple) {
          await onUpdateMultiple(set.id, { reps, weight });
        } else {
          await onUpdate?.(set.id, 'reps', reps);
          await onUpdate?.(set.id, 'weight', weight);
        }
        localReps = reps !== null ? String(reps) : '';
        localWeight = weight !== null ? String(weight) : '';
        return true;
      }

      return false;
    };

    openKeypad({
      id: `${set.id}:reps`,
      value: captured,
      allowDecimal: false,
      allowShorthand: true,
      label: 'Reps',
      onInput: (v) => {
        captured = v;
        handleRepsInput(v);
      },
      onNext: async () => {
        if (!await commitRepsValue()) doOpenWeightKeypad();
      },
      onDone: async () => {
        if (!await commitRepsValue()) doOpenWeightKeypad();
      },
      onCancel: () => {
        if (isEmpty) {
          draftReps = captured;
          return;
        }
        localReps = set.reps !== null ? String(set.reps) : '';
        localWeight = set.weight !== null ? String(set.weight) : '';
      },
    });
    scrollRowIntoView();
  }

  function scrollRowIntoView() {
    setTimeout(() => {
      trEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
  }

  // ── Weight ────────────────────────────────────────────────────────────────

  // ── Empty-row commit ──────────────────────────────────────────────────────

  // Maximum N for the NxRepsxWeight shorthand (e.g. "99x10x200")
  const MAX_MULTI_SET_COUNT = 99;
  // 3-part shorthand: NxRepsxWeight — expands to N sets (all three parts required)
  const MULTI_SET_RE = /^(\d+)[xX×*](\d+)[xX×*]([\d.]+)$/;
  // 2-part shorthand: RepsxWeight — updates a single set
  const SINGLE_PAIR_RE = /^(\d+)[xX×*]([\d.]+)$/;

  async function flushEmptyRow() {
    if (!isEmpty) return;

    // Parse "NxRepxWeight" shorthand — e.g. "3x12x200" creates 3 sets of 12 reps @ 200 lbs.
    const multi = draftReps.match(MULTI_SET_RE);
    if (multi) {
      const count = parseInt(multi[1], 10);
      const reps = parseInt(multi[2], 10);
      const weight = parseFloat(multi[3]);
      if (count >= 1 && count <= MAX_MULTI_SET_COUNT && (draftExerciseName || reps > 0 || weight > 0)) {
        const now = Date.now();
        const newSets: WorkoutSet[] = Array.from({ length: count }, (_, i) => ({
          id: crypto.randomUUID(),
          localWorkoutId: set.localWorkoutId,
          exerciseId: draftExerciseId,
          exerciseName: draftExerciseName,
          reps,
          weight,
          order: set.order + i,
          createdAt: now + i,
        }));
        if (onAddMultiple) {
          await onAddMultiple(newSets);
        } else {
          for (const s of newSets) await onAdd?.(s);
        }
        draftExerciseId = '';
        draftExerciseName = '';
        draftReps = '';
        draftWeight = '';
        return;
      }
    }

    // 2-part RxW shorthand — "12x150" creates one set with reps=12 and weight=150
    const pair = draftReps.match(SINGLE_PAIR_RE);
    if (pair) {
      const reps = parseInt(pair[1], 10) || null;
      const weight = parseFloat(pair[2]) || null;
      if (draftExerciseName || reps !== null || weight !== null) {
        await onAdd?.({
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
      return;
    }

    const reps = draftReps !== '' ? (parseInt(draftReps, 10) || null) : null;
    const weight = draftWeight !== '' ? (parseFloat(draftWeight) || null) : null;
    if (draftExerciseName || reps !== null || weight !== null) {
      await onAdd?.({
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
      isEditing = false;
      // Empty rows flush when focus truly leaves the row
      // (e.g. user taps another row's exercise field)
      if (isEmpty) {
        commitTimer = setTimeout(() => {
          commitTimer = undefined;
          const rowKeypadOpen = $keypadConfig?.id?.startsWith(`${set.id}:`) ?? false;
          if (trEl && !trEl.contains(document.activeElement) && !rowKeypadOpen) {
            flushEmptyRow();
          }
        }, 200);
      }
    }
  }

  // ── Drag / touch ──────────────────────────────────────────────────────────

  let dragOver = $state(false);
  let touchStartY = $state(0);
  let touchDragging = $state(false);
  let handleDragging = $state(false);
  let dragStartIndex = $state<number | null>(null);
  let dragCurrentIndex = $state<number | null>(null);
  let dragPointerId = $state<number | null>(null);
  let dragStartY = $state(0);
  let dragOffsetY = $state(0);

  let swipeStartX = $state<number | null>(null);
  let swipeStartY = $state<number | null>(null);
  let swipeOffsetX = $state(0);
  let swipingToDelete = $state(false);
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

  function handleDragHandlePointerDown(e: PointerEvent) {
    if (isEmpty) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragPointerId = e.pointerId;
    dragStartIndex = index;
    dragCurrentIndex = index;
    dragStartY = e.clientY;
    dragOffsetY = 0;
    handleDragging = true;
    onDragStart?.(index);
  }

  function handleDragHandlePointerMove(e: PointerEvent) {
    if (!handleDragging || dragPointerId === null || e.pointerId !== dragPointerId) return;
    dragOffsetY = e.clientY - dragStartY;
    const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('tr[data-set-row-index]');
    const targetIndex = targetEl ? Number((targetEl as HTMLElement).dataset.setRowIndex) : NaN;
    if (!Number.isNaN(targetIndex)) {
      dragCurrentIndex = targetIndex;
      onDragOver?.(targetIndex);
    }
  }

  async function handleDragHandlePointerEnd(e: PointerEvent) {
    if (!handleDragging || dragStartIndex === null) return;
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
    const fromIndex = dragStartIndex;
    const toIndex = dragCurrentIndex ?? fromIndex;
    if (toIndex !== fromIndex) {
      await onTouchReorder?.(fromIndex, toIndex);
    }
    handleDragging = false;
    dragStartIndex = null;
    dragCurrentIndex = null;
    dragPointerId = null;
    dragOffsetY = 0;
  }

  function isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('input, textarea, select, a, [data-no-swipe]'));
  }

  function handleRowSwipeStart(e: TouchEvent) {
    if (isEmpty || handleDragging || isInteractiveTarget(e.target)) return;
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
    swipeOffsetX = 0;
    swipingToDelete = false;
  }

  function handleRowSwipeMove(e: TouchEvent) {
    if (swipeStartX === null || swipeStartY === null) return;
    const dx = e.touches[0].clientX - swipeStartX;
    const dy = e.touches[0].clientY - swipeStartY;
    if (Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > 10) {
      e.preventDefault();
      swipeOffsetX = dx;
      swipingToDelete = Math.abs(dx) >= 96;
    }
  }

  function handleRowSwipeEnd() {
    if (swipeStartX !== null && swipingToDelete && !isEmpty) {
      onDelete?.(set.id);
    }
    swipeStartX = null;
    swipeStartY = null;
    swipeOffsetX = 0;
    swipingToDelete = false;
  }
</script>

<tr
  bind:this={trEl}
  data-set-row-index={index}
  class="group border-b border-[hsl(var(--border)/0.5)] last:border-b-0 transition-[background-color,transform,box-shadow] duration-150
    {selected ? 'bg-[hsl(var(--primary)/0.06)]' : 'hover:bg-[hsl(var(--muted)/0.25)]'}
    {dragOver ? 'outline outline-2 outline-[hsl(var(--primary))] outline-offset-[-1px]' : ''}
    {handleDragging ? 'z-20 bg-[hsl(var(--card))] shadow-2xl ring-2 ring-[hsl(var(--primary)/0.45)] scale-[1.01]' : ''}"
  draggable="false"
  style="transform: translateX({handleDragging ? 0 : swipeOffsetX}px) translateY({handleDragging ? dragOffsetY : 0}px) translateZ({handleDragging ? 16 : 0}px);"
  onfocusin={handleRowFocusIn}
  onfocusout={handleRowFocusOut}
  ondragover={(e) => { e.preventDefault(); dragOver = true; onDragOver?.(index); }}
  ondragleave={() => { dragOver = false; }}
  ondrop={(e) => { e.preventDefault(); dragOver = false; onDrop?.(); }}
  ontouchstart={handleRowSwipeStart}
  ontouchmove={handleRowSwipeMove}
  ontouchend={handleRowSwipeEnd}
  ontouchcancel={handleRowSwipeEnd}
>
  <!-- Set number / select -->
  <td class="w-7 text-center py-0 px-0.5">
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
        {setNumber ?? ''}
      </button>
    {/if}
  </td>

  <!-- Exercise -->
  <td class="min-w-0 py-0.5 px-1" onfocusin={closeKeypad}>
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
        onclick={() => { closeKeypad(); editingExercise = true; }}
      >
        {set.exerciseName || '—'}
      </button>
    {/if}
  </td>

  <!-- Reps – tap to open custom keypad -->
  <td class="w-12 py-0.5 px-0.5">
    <button
      bind:this={repsBtnEl}
      type="button"
      onclick={doOpenRepsKeypad}
      class="w-full bg-transparent text-center py-1.5 px-0 rounded
             text-[hsl(var(--foreground))]
             transition-colors select-none touch-manipulation
             {$keypadConfig?.id === `${set.id}:reps`
               ? 'ring-2 ring-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)]'
               : 'focus:bg-[hsl(var(--muted)/0.5)]'}"
      style="font-size:16px; min-height: 2.25rem;"
      aria-label="Reps"
    >
      {#if (isEmpty ? draftReps : localReps)}
        {isEmpty ? draftReps : localReps}
      {:else}
        <span class="text-[hsl(var(--muted-foreground)/0.35)]">—</span>
      {/if}
    </button>
  </td>

  <!-- Weight – tap to open custom keypad -->
  <td class="w-14 py-0.5 px-0.5">
    <button
      bind:this={weightBtnEl}
      type="button"
      onclick={doOpenWeightKeypad}
      class="w-full bg-transparent text-center py-1.5 px-0 rounded
             text-[hsl(var(--foreground))]
             transition-colors select-none touch-manipulation
             {$keypadConfig?.id === `${set.id}:weight`
               ? 'ring-2 ring-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)]'
               : 'focus:bg-[hsl(var(--muted)/0.5)]'}"
      style="font-size:16px; min-height: 2.25rem;"
      aria-label="Weight"
    >
      {#if (isEmpty ? draftWeight : localWeight)}
        {isEmpty ? draftWeight : localWeight}
      {:else}
        <span class="text-[hsl(var(--muted-foreground)/0.35)]">—</span>
      {/if}
    </button>
  </td>

  <!-- Delete / commit -->
  <td class="w-10 py-0.5 px-0.5">
    {#if !isEmpty}
      <div class="flex items-center justify-center">
        <button
          type="button"
          data-no-swipe
          onpointerdown={handleDragHandlePointerDown}
          onpointermove={handleDragHandlePointerMove}
          onpointerup={handleDragHandlePointerEnd}
          onpointercancel={handleDragHandlePointerEnd}
          oncontextmenu={(e) => e.preventDefault()}
          class="flex h-9 w-9 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] transition-colors cursor-grab active:cursor-grabbing touch-none select-none"
          title="Drag to reorder"
          aria-label="Drag to reorder set"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M3 4h10M3 8h10M3 12h10" />
          </svg>
        </button>
      </div>
    {:else if draftExerciseName || draftReps || draftWeight}
      <button
        type="button"
        onclick={() => flushEmptyRow()}
        class="flex h-6 w-6 mx-auto items-center justify-center rounded
               text-[hsl(var(--primary))]
               hover:bg-[hsl(var(--primary)/0.1)]
               transition-all"
        title="Add set"
        aria-label="Add set"
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 8l4 4 8-8"/>
        </svg>
      </button>
    {/if}
  </td>
</tr>
