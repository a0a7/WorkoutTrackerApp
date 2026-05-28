<script lang="ts">
  import { untrack } from 'svelte';
  import type { WorkoutSet } from '../types';
  import ExerciseAutocomplete from './ExerciseAutocomplete.svelte';
  import type { Exercise } from '../types';
  import { EXERCISE_MAP } from '../exercises';
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
  let draftRevision = $state(0);

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

  function dismissNativeKeyboard() {
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement) {
      activeEl.blur();
    }
  }

  // ── Exercise ─────────────────────────────────────────────────────────────

  function handleExerciseSelected(ex: Exercise) {
    if (isEmpty) {
      draftExerciseId = ex.id;
      draftExerciseName = ex.name;
    } else {
      onExerciseUpdate?.(set.id, ex.id, ex.name);
      editingExercise = false;
    }
    const repsValue = isEmpty ? draftReps : localReps;
    // Move focus to reps only if reps is currently empty.
    if (!repsValue) {
      setTimeout(() => doOpenRepsKeypad(), 15);
    }
  }

  function getWeightedVariant(exerciseId: string, exerciseName: string): Exercise | null {
    const byId = EXERCISE_MAP.get(`weighted-${exerciseId}`);
    if (byId) return byId;
    const weightedName = `Weighted ${exerciseName.trim()}`.toLowerCase();
    for (const ex of EXERCISE_MAP.values()) {
      if (ex.name.toLowerCase() === weightedName) return ex;
    }
    return null;
  }

  function maybeConvertBodyweightToWeighted(weightText: string, emptyRow: boolean) {
    const parsed = parseFloat(weightText);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    const currentExerciseId = emptyRow ? draftExerciseId : set.exerciseId;
    const currentExerciseName = emptyRow ? draftExerciseName : set.exerciseName;
    if (!currentExerciseId || !currentExerciseName) return;

    const currentExercise = EXERCISE_MAP.get(currentExerciseId);
    if (!currentExercise || currentExercise.category !== 'bodyweight') return;

    const weightedVariant = getWeightedVariant(currentExerciseId, currentExerciseName);
    if (!weightedVariant) return;

    if (emptyRow) {
      draftExerciseId = weightedVariant.id;
      draftExerciseName = weightedVariant.name;
    } else {
      onExerciseUpdate?.(set.id, weightedVariant.id, weightedVariant.name);
    }
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
    dismissNativeKeyboard();
    const initialValue = isEmpty ? draftWeight : localWeight;
    let captured = '';
    const revisionAtOpen = draftRevision;
    openKeypad({
      id: `${set.id}:weight`,
      value: '',
      allowDecimal: true,
      allowShorthand: false,
      label: 'Weight',
      onInput: (v) => {
        const previousWeight = parseFloat(captured);
        captured = v;
        const nextWeight = parseFloat(v);
        if (isEmpty) {
          draftWeight = v;
        } else {
          localWeight = v;
          onUpdate?.(set.id, 'weight', v !== '' ? (parseFloat(v) || null) : null);
        }
        if ((!Number.isFinite(previousWeight) || previousWeight <= 0) && Number.isFinite(nextWeight) && nextWeight > 0) {
          maybeConvertBodyweightToWeighted(v, isEmpty);
        }
      },
      onDone: async () => {
        if (isEmpty) {
          await flushEmptyRow();
        }
      },
      onCancel: () => {
        if (isEmpty) {
          if (revisionAtOpen !== draftRevision) return;
          draftWeight = initialValue;
          return;
        }
        localWeight = set.weight !== null ? String(set.weight) : '';
      },
    });
    scrollRowIntoView();
  }

  function doOpenRepsKeypad() {
    dismissNativeKeyboard();
    const initialValue = isEmpty ? draftReps : localReps;
    let captured = '';
    const revisionAtOpen = draftRevision;
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
      value: '',
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
          if (revisionAtOpen !== draftRevision) return;
          draftReps = initialValue;
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
      const el = trEl;
      if (!el) return;
      // Prefer visualViewport when available (mobile keyboards change visualViewport)
      const vv = (window as any).visualViewport;
      if (vv) {
        // Element rect relative to layout viewport
        const rect = el.getBoundingClientRect();
        const margin = 12; // small padding above/below
        const viewTop = vv.offsetTop || 0;
        const viewBottom = viewTop + vv.height;
        const elemTop = rect.top;
        const elemBottom = rect.bottom;

        if (elemTop < viewTop + margin || elemBottom > viewBottom - margin) {
          // center the element within the visual viewport
          const targetScroll = window.scrollY + (elemTop - (viewTop + (vv.height / 2 - rect.height / 2)));
          window.scrollTo({ top: Math.max(0, Math.round(targetScroll)), behavior: 'smooth' });
        }
      } else {
        // Fallback
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
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

  function clearDraftRow() {
    draftExerciseId = '';
    draftExerciseName = '';
    draftReps = '';
    draftWeight = '';
    draftRevision += 1;
  }

  function hasDraftContent() {
    return Boolean(draftExerciseName || draftReps || draftWeight);
  }

  function isBodyweightExercise(exerciseId: string) {
    const exercise = EXERCISE_MAP.get(exerciseId);
    return exercise?.category === 'bodyweight';
  }

  async function flushEmptyRow() {
    if (!isEmpty) return;

    const nextDraft = {
      exerciseId: draftExerciseId,
      exerciseName: draftExerciseName,
      repsText: draftReps,
      weightText: draftWeight,
    };

    const resolveExerciseForWeight = (exerciseId: string, exerciseName: string, weight: number | null) => {
      if (weight === null || weight <= 0) return { exerciseId, exerciseName };
      const currentExercise = EXERCISE_MAP.get(exerciseId);
      if (!currentExercise || currentExercise.category !== 'bodyweight') return { exerciseId, exerciseName };
      const weightedVariant = getWeightedVariant(exerciseId, exerciseName);
      if (!weightedVariant) return { exerciseId, exerciseName };
      return { exerciseId: weightedVariant.id, exerciseName: weightedVariant.name };
    };

    // Parse "NxRepxWeight" shorthand — e.g. "3x12x200" creates 3 sets of 12 reps @ 200 lbs.
    const multi = nextDraft.repsText.match(MULTI_SET_RE);
    if (multi) {
      const count = parseInt(multi[1], 10);
      const reps = parseInt(multi[2], 10);
      const weight = parseFloat(multi[3]);
      if (count >= 1 && count <= MAX_MULTI_SET_COUNT && (nextDraft.exerciseName || reps > 0 || weight > 0)) {
        const resolvedExercise = resolveExerciseForWeight(nextDraft.exerciseId, nextDraft.exerciseName, weight);
        const now = Date.now();
        const newSets: WorkoutSet[] = Array.from({ length: count }, (_, i) => ({
          id: crypto.randomUUID(),
          localWorkoutId: set.localWorkoutId,
          exerciseId: resolvedExercise.exerciseId,
          exerciseName: resolvedExercise.exerciseName,
          reps,
          weight,
          order: set.order + i,
          createdAt: now + i,
        }));
        clearDraftRow();
        try {
          if (onAddMultiple) {
            await onAddMultiple(newSets);
          } else {
            for (const s of newSets) await onAdd?.(s);
          }
        } catch (error) {
          draftExerciseId = nextDraft.exerciseId;
          draftExerciseName = nextDraft.exerciseName;
          draftReps = nextDraft.repsText;
          draftWeight = nextDraft.weightText;
          throw error;
        }
        return;
      }
    }

    // 2-part RxW shorthand — "12x150" creates one set with reps=12 and weight=150
    const pair = nextDraft.repsText.match(SINGLE_PAIR_RE);
    if (pair) {
      const reps = parseInt(pair[1], 10) || null;
      const weight = parseFloat(pair[2]) || null;
      if (nextDraft.exerciseName || reps !== null || weight !== null) {
        const resolvedExercise = resolveExerciseForWeight(nextDraft.exerciseId, nextDraft.exerciseName, weight);
        const newSet = {
          id: crypto.randomUUID(),
          localWorkoutId: set.localWorkoutId,
          exerciseId: resolvedExercise.exerciseId,
          exerciseName: resolvedExercise.exerciseName,
          reps,
          weight,
          order: set.order,
          createdAt: Date.now(),
        };
        clearDraftRow();
        try {
          await onAdd?.(newSet);
        } catch (error) {
          draftExerciseId = nextDraft.exerciseId;
          draftExerciseName = nextDraft.exerciseName;
          draftReps = nextDraft.repsText;
          draftWeight = nextDraft.weightText;
          throw error;
        }
        return;
      }
      clearDraftRow();
      return;
    }

    const reps = nextDraft.repsText !== '' ? (parseInt(nextDraft.repsText, 10) || null) : null;
    const weight = nextDraft.weightText !== '' ? (parseFloat(nextDraft.weightText) || null) : null;
    if (nextDraft.exerciseName || reps !== null || weight !== null) {
      const resolvedExercise = resolveExerciseForWeight(nextDraft.exerciseId, nextDraft.exerciseName, weight);
      const newSet = {
        id: crypto.randomUUID(),
        localWorkoutId: set.localWorkoutId,
        exerciseId: resolvedExercise.exerciseId,
        exerciseName: resolvedExercise.exerciseName,
        reps,
        weight,
        order: set.order,
        createdAt: Date.now(),
      };
      clearDraftRow();
      try {
        await onAdd?.(newSet);
      } catch (error) {
        draftExerciseId = nextDraft.exerciseId;
        draftExerciseName = nextDraft.exerciseName;
        draftReps = nextDraft.repsText;
        draftWeight = nextDraft.weightText;
        throw error;
      }
      return;
    }
    clearDraftRow();
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
  const DRAG_ACTIVATION_THRESHOLD_PX = 6;

  let swipeStartX = $state<number | null>(null);
  let swipeStartY = $state<number | null>(null);
  let swipeOffsetX = $state(0);
  let swipingToDelete = $state(false);
  let swipeActive = $state(false);
  const SWIPE_DELETE_THRESHOLD_PX = 180;
  const SWIPE_MAX_OFFSET_PX = 240;
  const SWIPE_ACTIVATION_PX = 14;
  const SWIPE_DAMPING = 0.85;
  const SWIPE_SMOOTHING = 0.35;
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
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragPointerId = e.pointerId;
    dragStartIndex = index;
    dragCurrentIndex = index;
    dragStartY = e.clientY;
    dragOffsetY = 0;
    handleDragging = false;
  }

  function handleDragHandlePointerMove(e: PointerEvent) {
    if (!maybeActivateDrag(e)) return;
    e.preventDefault();
    const targetEl = document
      .elementsFromPoint(e.clientX, e.clientY)
      .map((el) => el.closest('tr[data-set-row-index]'))
      .find((row): row is HTMLElement =>
        row instanceof HTMLElement
          && row.dataset.emptyRow !== 'true'
          && row.dataset.setRowIndex !== String(dragStartIndex)
      );
    const targetIndex = targetEl ? Number(targetEl.dataset.setRowIndex) : NaN;
    if (!Number.isNaN(targetIndex)) {
      dragCurrentIndex = targetIndex;
      onDragOver?.(targetIndex);
    }
  }

  async function handleDragHandlePointerEnd(e: PointerEvent) {
    if (dragPointerId === null || dragStartIndex === null || e.pointerId !== dragPointerId) return;
    const handleEl = e.currentTarget as HTMLElement;
    if (handleEl.hasPointerCapture(dragPointerId)) {
      handleEl.releasePointerCapture(dragPointerId);
    }
    const didDrag = handleDragging;
    const fromIndex = dragStartIndex;
    const toIndex = dragCurrentIndex ?? fromIndex;
    handleDragging = false;
    dragStartIndex = null;
    dragCurrentIndex = null;
    dragPointerId = null;
    dragOffsetY = 0;
    if (didDrag && toIndex !== fromIndex) {
      await onTouchReorder?.(fromIndex, toIndex);
    }
  }

  function maybeActivateDrag(e: PointerEvent) {
    if (dragPointerId === null || e.pointerId !== dragPointerId || dragStartIndex === null) return false;
    const nextOffsetY = e.clientY - dragStartY;
    if (!handleDragging) {
      if (Math.abs(nextOffsetY) < DRAG_ACTIVATION_THRESHOLD_PX) return false;
      handleDragging = true;
      onDragStart?.(dragStartIndex);
    }
    dragOffsetY = nextOffsetY;
    return true;
  }

  function isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('input, textarea, select, a, [data-no-swipe]'));
  }

  function handleRowSwipeStart(e: TouchEvent) {
    if (isEmpty || handleDragging || isInteractiveTarget(e.target) || e.touches.length !== 1) return;
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
    swipeOffsetX = 0;
    swipingToDelete = false;
    swipeActive = false;
  }

  function handleRowSwipeMove(e: TouchEvent) {
    if (swipeStartX === null || swipeStartY === null) return;
    const dx = e.touches[0].clientX - swipeStartX;
    const dy = e.touches[0].clientY - swipeStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (!swipeActive) {
      if (absDx < SWIPE_ACTIVATION_PX && absDy < SWIPE_ACTIVATION_PX) return;
      if (absDy > absDx) {
        handleRowSwipeEnd();
        return;
      }
      swipeActive = true;
    }
    e.preventDefault();
    const damped = dx * SWIPE_DAMPING;
    const targetOffset = Math.max(-SWIPE_MAX_OFFSET_PX, Math.min(0, damped));
    swipeOffsetX += (targetOffset - swipeOffsetX) * SWIPE_SMOOTHING;
    swipingToDelete = Math.abs(targetOffset) >= SWIPE_DELETE_THRESHOLD_PX;
  }

  function handleRowSwipeEnd() {
    if (swipeStartX !== null && swipeActive && swipingToDelete && !isEmpty) {
      onDelete?.(set.id);
    }
    swipeStartX = null;
    swipeStartY = null;
    swipeOffsetX = 0;
    swipingToDelete = false;
    swipeActive = false;
  }
</script>

<tr
  bind:this={trEl}
  data-set-row-index={index}
  data-empty-row={isEmpty ? 'true' : 'false'}
  class="group relative border-b border-[hsl(var(--border)/0.5)] last:border-b-0 transition-[background-color,transform,box-shadow] duration-150
    {selected ? 'bg-[hsl(var(--primary)/0.06)]' : 'hover:bg-[hsl(var(--muted)/0.25)]'}
  {dragOver ? 'outline-2 outline-[hsl(var(--primary))] -outline-offset-1' : ''}
    {handleDragging ? 'z-20 bg-[hsl(var(--card))] shadow-2xl ring-2 ring-[hsl(var(--primary)/0.45)] scale-[1.01]' : ''}
    {isEmpty || editingExercise ? 'z-10' : ''}"
  draggable="false"
  style:transition-duration={(handleDragging || swipeActive) ? '0ms' : undefined}
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
  <td class="w-10 py-0 align-middle">
    <div class="h-[100%] w-[calc(100%+16px)] -ml-6">
    {#if isEmpty}
      {#if hasDraftContent()}
        <button
          type="button"
          class="cursor-pointer flex h-full min-h-8 w-full items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          onclick={clearDraftRow}
          aria-label="Clear draft set row"
          title="Clear"
        >
          <svg class="translate-x-4" viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M4 4l8 8M12 4l-8 8"/>
          </svg>
        </button>
      {:else}
        <span class="block h-full min-h-10 w-full"></span>
      {/if}
    {:else if selected}
      <button
        type="button"
        class="flex h-full min-h-8 w-full items-center justify-center cursor-pointer"
        onclick={(e) => onSelect?.(set.id, e.shiftKey)}
        ontouchstart={handleTouchStart}
        ontouchmove={handleTouchMove}
        ontouchend={handleTouchEnd}
        aria-label="Deselect set"
      >
        <svg class="h-3 w-3 text-[hsl(var(--foreground))] translate-x-4" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    {:else}
      <button
        type="button"
        class="flex h-full cursor-pointer min-h-8 w-full items-center justify-center right text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors"
        onclick={(e) => onSelect?.(set.id, e.shiftKey)}
        ontouchstart={handleTouchStart}
        ontouchmove={handleTouchMove}
        ontouchend={handleTouchEnd}
        aria-label="Select set"
      >
        <span class="translate-x-4">{setNumber ?? ''}</span>
      </button>
    {/if}
    </div>
  </td>

  <!-- Exercise -->
  <td class="min-w-0 py-0.5 px-0" onfocusin={closeKeypad}>
    <div class={`min-w-0 ${isEmpty ? 'px-4' : ''}`}>
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
        class="w-full text-left text-sm font-medium text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] py-1.5 px-0 transition-colors truncate block"
        onclick={() => { closeKeypad(); editingExercise = true; }}
      >
        {set.exerciseName || '—'}
      </button>
    {/if}
    </div>
  </td>

  <!-- Reps – tap to open custom keypad -->
  <td class="w-12 py-0.5 px-0.5">
    <div class={isEmpty ? 'px-4' : ''}>
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
      style="font-size:16px; min-height: 2rem;"
      aria-label="Reps"
    >
      {#if (isEmpty ? draftReps : localReps)}
        {isEmpty ? draftReps : localReps}
      {:else}
        <span class="text-[hsl(var(--muted-foreground)/0.35)]">—</span>
      {/if}
    </button>
    </div>
  </td>

  <!-- Weight – tap to open custom keypad -->
  <td class="w-14 py-0.5 px-0.5">
    <div class={isEmpty ? 'px-4' : ''}>
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
      style="font-size:16px; min-height: 2rem;"
      aria-label="Weight"
    >
      {#if (isEmpty ? draftWeight : localWeight)}
        {isEmpty ? draftWeight : localWeight}
      {:else if isBodyweightExercise(isEmpty ? draftExerciseId : set.exerciseId)}
        <span class="text-[hsl(var(--muted-foreground)/0.55)]">body</span>
      {:else}
        <span class="text-[hsl(var(--muted-foreground)/0.35)]">—</span>
      {/if}
    </button>
    </div>
  </td>

  <!-- Delete / commit -->
  <td class="w-12 py-0 align-middle">
      <div class={isEmpty ? 'px-4 h-full min-h-[2rem]' : 'h-full min-h-[2rem] w-[calc(100%+32px)]'}>
    {#if !isEmpty}
      <div class="flex h-full items-center justify-center">
        <button
          type="button"
          data-no-swipe
          onpointerdown={handleDragHandlePointerDown}
          onpointermove={handleDragHandlePointerMove}
          onpointerup={handleDragHandlePointerEnd}
          onpointercancel={handleDragHandlePointerEnd}
          oncontextmenu={(e) => e.preventDefault()}
          class="flex h-full min-h-8 w-full items-center justify-center text-[hsl(var(--muted-foreground))]  transition-colors cursor-grab active:cursor-grabbing touch-none select-none rounded-r-xl"
          title="Drag to reorder"
          aria-label="Drag to reorder set"
        >
          <svg class="-translate-x-4" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M3 4h10M3 8h10M3 12h10" />
          </svg>
        </button>
      </div>
    {:else if hasDraftContent()}
      <button
        type="button"
        onclick={() => flushEmptyRow()}
        class="flex h-8 w-8 mx-auto mt-1 items-center justify-center rounded-xl text-[hsl(var(--background))] hover:opacity-90 transition-all cursor-pointer"
        title="Add set"
        aria-label="Add set"
      >
        <svg class="h-3 w-3 text-[hsl(var(--foreground))]" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    {/if}
    </div>
  </td>
</tr>

{#if isEmpty}
  <tr class="h-0.5 bg-[hsl(var(--border)/0.5)]">
    <td colspan="5" class="p-0"></td>
  </tr>
{/if}

<style>
  /* Custom styles for SetRow component */
  tr[data-set-row-index] {
    position: relative;
  }

  /* Extend interactive targets into the visual margins on desktop */
  @media (min-width: 640px) {
    tr[data-set-row-index] td {
      position: relative;
      z-index: 1;
    }

    tr[data-set-row-index] td::before {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: -1;
      border-radius: inherit;
    }
  }
</style>
