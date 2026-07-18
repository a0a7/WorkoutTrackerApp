<script lang="ts">

  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import SetRow from '$lib/components/SetRow.svelte';
  import NumericKeypad from '$lib/components/NumericKeypad.svelte';
  import { setsStore, selectedIds, pushUndo, undo, redo, hasUndo, hasRedo } from '$lib/stores/workoutStore';
  import { keypadConfig } from '$lib/stores/keypadStore';
  import { getTodaySets, saveSets, deleteSet as dbDeleteSet, saveWorkout } from '$lib/db';
  import { unitPreference, initUnitPreference, userStore, timeFormatPreference, initTimeFormatPreference } from '$lib/stores/userStore';
  import { syncToServer, syncFromServer, syncStore, markSyncPending, refreshSyncStatus } from '$lib/sync';
  import type { WorkoutSet } from '$lib/types';

  let sets = $state<WorkoutSet[]>([]);
  let selected = $state<Set<string>>(new Set());
  let dragFromIndex = $state<number | null>(null);
  let dragToIndex = $state<number | null>(null);
  let sessionLocation = $state<{ lat: number; lng: number; label?: string } | null>(null);
  let locationDenied = $state(false);
  // sessionId is generated once per component mount — one ID per workout session
  let sessionId = $state('');

  // Reactive unit preference — auto-subscribes and updates when the store changes
  const unit = $derived($unitPreference);
  const timeFormat = $derived($timeFormatPreference);

  // Sync state for the header button
  const isSyncing = $derived($syncStore.syncing);
  const syncError = $derived($syncStore.error);
  const lastSync = $derived($syncStore.lastSync);
  const hasPendingSync = $derived($syncStore.hasPending);
  const keypadTableMargin = $derived($keypadConfig ? 'calc(18rem + env(safe-area-inset-bottom))' : '0px');

  async function handleSyncTap() {
    const u = get(userStore);
    if (!u) return;
    try {
      await syncToServer(u);
      await syncFromServer(u);
      await refreshSyncStatus();
    } catch {
      // ignored
    }
  }

  function formatLastSync(ts: number | null): string {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  // Stable session ID — one unique ID per app session (supports multiple sessions/day)
  // Defined inside onMount so each component mount gets a fresh session ID
  // Workout start time is backdated to this offset to account for warmup before the first logged set
  const WORKOUT_START_OFFSET_MS = 10 * 60_000; // 10 minutes

  // Geolocation options
  const GEOLOCATION_CACHE_MS = 5 * 60_000;  // allow cached position up to 5 minutes old
  const GEOLOCATION_TIMEOUT_MS = 10_000;     // give up after 10 seconds

  // Time editing state for today's workout
  let editingTimes = $state(false);
  let editStartDate = $state('');
  let editStartTime = $state('');
  let editEndDate = $state('');
  let editEndTime = $state('');
  let timeEditError = $state('');
  // Custom times override the auto-derived times
  let customStartTime = $state<number | null>(null);
  let customEndTime = $state<number | null>(null);
  let writeQueue = Promise.resolve();

  const dateLabel = $derived(
    new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    })
  );

  // Keep a single trailing empty row for quick entry
  const EMPTY_COUNT = 1;
  const emptyRows = $derived(
    Array.from({ length: EMPTY_COUNT }, (_, i) => ({
      id: `empty-${i}`,
      localWorkoutId: sessionId,
      exerciseId: '',
      exerciseName: '',
      reps: null,
      weight: null,
      order: sets.length + i,
      createdAt: Date.now(),
    } as WorkoutSet))
  );

  const allRows = $derived([...sets, ...emptyRows]);

  // Displayed in the header; tapping it opens time editing
  const timesLabel = $derived(() => {
    if (sets.length === 0) return '';
    const fmt = (ts: number) =>
      new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: timeFormat === '12h' });
    const sorted = [...sets].sort((a, b) => a.createdAt - b.createdAt);
    const s = fmt(customStartTime ?? (sorted[0].createdAt - WORKOUT_START_OFFSET_MS));
    const e = fmt(customEndTime ?? sorted[sorted.length - 1].createdAt);
    return `${s} – ${e}`;
  });

  async function loadSets() {
    const loaded = await getTodaySets();
    sets = loaded.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    sessionId = sets[sets.length - 1]?.localWorkoutId ?? crypto.randomUUID();
    setsStore.set(sets);
  }

  onMount(() => {
    initUnitPreference();
    initTimeFormatPreference();

    loadSets();
    refreshSyncStatus().catch(() => {});

    const interval = setInterval(async () => {
      if (!editingTimes) {
        await loadSets();
      }
    }, 10000);

    return () => clearInterval(interval);
  });

  // Capture geolocation once when the first real set is added
  function captureLocation() {
    if (sessionLocation !== null) return; // already captured
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sessionLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Persist workout with location once we have it
        if (sets.length > 0) persistWorkoutMeta();
      },
      () => { locationDenied = true; },
      { maximumAge: GEOLOCATION_CACHE_MS, timeout: GEOLOCATION_TIMEOUT_MS }
    );
  }

  function toDateInput(ts: number) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function toTimeInput(ts: number) {
    return new Date(ts).toTimeString().slice(0, 5);
  }
  function fromDateTimeInputs(date: string, time: string): number {
    return new Date(`${date}T${time}:00`).getTime();
  }

  function beginEditTimes() {
    if (sets.length === 0) return;
    const sorted = [...sets].sort((a, b) => a.createdAt - b.createdAt);
    const startTs = customStartTime ?? (sorted[0].createdAt - WORKOUT_START_OFFSET_MS);
    const endTs = customEndTime ?? sorted[sorted.length - 1].createdAt;
    editStartDate = toDateInput(startTs);
    editStartTime = toTimeInput(startTs);
    editEndDate = toDateInput(endTs);
    editEndTime = toTimeInput(endTs);
    editingTimes = true;
  }

  function cancelEditTimes() {
    editingTimes = false;
    timeEditError = '';
  }

  async function saveEditedTimes() {
    const newStart = fromDateTimeInputs(editStartDate, editStartTime);
    const newEnd = fromDateTimeInputs(editEndDate, editEndTime);
    if (isNaN(newStart)) { timeEditError = 'Invalid start date or time.'; return; }
    if (isNaN(newEnd)) { timeEditError = 'Invalid end date or time.'; return; }
    if (newEnd <= newStart) { timeEditError = 'End time must be after start time.'; return; }
    timeEditError = '';
    customStartTime = newStart;
    customEndTime = newEnd;
    await enqueueWrite(() => persistWorkoutMeta());
    editingTimes = false;
    markSyncPending();
    const user = get(userStore);
    if (user) syncToServer(user).catch(() => {});
  }

  function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const run = writeQueue.then(task, task);
    writeQueue = run.then(() => {}, () => {});
    return run;
  }

  async function persistWorkoutMeta() {
    if (sets.length === 0) return;
    const sorted = [...sets].sort((a, b) => a.createdAt - b.createdAt);
    const startTime = customStartTime ?? (sorted[0].createdAt - WORKOUT_START_OFFSET_MS);
    const endTime = customEndTime ?? sorted[sorted.length - 1].createdAt;
    await saveWorkout({
      id: sessionId,
      startTime,
      endTime,
      sets: sorted,
      synced: false,
      ...(sessionLocation ? { location: sessionLocation } : {}),
    });
  }

  async function persistSets(newSets: WorkoutSet[]) {
    sets = newSets;
    setsStore.set(newSets);
    const snapshot = newSets.map((s, i) => ({ ...s, order: i }));
    await enqueueWrite(async () => {
      await saveSets(snapshot);
      await persistWorkoutMeta();
    });
    markSyncPending();
    // Push any queued changes to the server
    const user = get(userStore);
    if (user) syncToServer(user).catch(() => {});
  }

  async function handleAdd(newSet: WorkoutSet) {
    pushUndo('Add set', sets);
    if (sets.length === 0) captureLocation();
    await persistSets([...sets, newSet]);
  }

  async function handleAddMultiple(newSets: WorkoutSet[]) {
    if (newSets.length === 0) return;
    pushUndo(`Add ${newSets.length} sets`, sets);
    if (sets.length === 0) captureLocation();
    await persistSets([...sets, ...newSets]);
  }

  async function handleExerciseUpdate(id: string, exerciseId: string, exerciseName: string) {
    pushUndo('Edit exercise', sets);
    const newSets = sets.map((s) => s.id === id ? { ...s, exerciseId, exerciseName } : s);
    await persistSets(newSets);
  }

  async function handleUpdate(id: string, field: keyof WorkoutSet, value: unknown) {
    pushUndo('Edit set', sets);
    const normalizeValue = (f: keyof WorkoutSet, v: unknown) => {
      if (f === 'reps') {
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        if (typeof v === 'string') {
          if (/[xX×*]/.test(v)) return null;
          const parsed = parseInt(v, 10);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      }
      if (f === 'weight') {
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        if (typeof v === 'string') {
          const parsed = parseFloat(v);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      }
      return v;
    };
    const normalizedValue = normalizeValue(field, value);
    // Apply to all selected sets if multiple are selected and this one is among them
    const targetIds = selected.has(id) && selected.size > 1 ? [...selected] : [id];
    const newSets = sets.map((s) =>
      targetIds.includes(s.id) ? { ...s, [field]: normalizedValue } : s
    );
    await persistSets(newSets);
  }

  async function handleUpdateMultiple(id: string, updates: Partial<WorkoutSet>) {
    pushUndo('Edit set', sets);
    const targetIds = selected.has(id) && selected.size > 1 ? [...selected] : [id];
    const newSets = sets.map((s) =>
      targetIds.includes(s.id) ? { ...s, ...updates } : s
    );
    await persistSets(newSets);
  }

  async function handleDelete(id: string) {
    if (id.startsWith('empty-')) return;
    pushUndo('Delete set', sets);
    const newSets = sets.filter((s) => s.id !== id);
    await dbDeleteSet(id);
    await persistSets(newSets);
    selected.delete(id);
    selected = new Set(selected);
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    pushUndo('Delete selected sets', sets);
    const idsToDelete = [...selected].filter((id) => !id.startsWith('empty-'));
    if (idsToDelete.length === 0) return;
    for (const id of idsToDelete) {
      await dbDeleteSet(id);
    }
    const idSet = new Set(idsToDelete);
    const newSets = sets.filter((s) => !idSet.has(s.id));
    await persistSets(newSets);
    clearSelection();
  }

  function handleSelect(id: string, shiftKey = false) {
    if (id.startsWith('empty-')) return;
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    selected = newSelected;
    selectedIds.set(selected);
  }

  function clearSelection() {
    selected = new Set();
    selectedIds.set(selected);
  }

  async function handleUndo() {
    const prev = undo(sets);
    if (prev) await persistSets(prev);
  }

  async function handleRedo() {
    const next = redo(sets);
    if (next) await persistSets(next);
  }

  async function handleExpandSet(id: string, newSets: WorkoutSet[]) {
    pushUndo('Expand set', sets);
    const idx = sets.findIndex((s) => s.id === id);
    const before = sets.slice(0, idx);
    const after = sets.slice(idx + 1);
    const reordered = [...before, ...newSets, ...after].map((s, i) => ({ ...s, order: i }));
    await dbDeleteSet(id);
    await persistSets(reordered);
  }

  // Drag reorder
  function handleDragStart(index: number) {
    dragFromIndex = index;
  }

  function handleDragOver(index: number) {
    dragToIndex = index;
  }

  async function handleDrop() {
    if (dragFromIndex === null || dragToIndex === null || dragFromIndex === dragToIndex) {
      dragFromIndex = null; dragToIndex = null; return;
    }
    pushUndo('Reorder', sets);
    const newSets = [...sets];
    const [moved] = newSets.splice(dragFromIndex, 1);
    newSets.splice(dragToIndex, 0, moved);
    const reordered = newSets.map((s, i) => ({ ...s, order: i }));
    dragFromIndex = null; dragToIndex = null;
    await persistSets(reordered);
  }

  async function handleTouchReorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= sets.length || toIndex >= sets.length) return;
    pushUndo('Reorder', sets);
    const newSets = [...sets];
    const [moved] = newSets.splice(fromIndex, 1);
    newSets.splice(toIndex, 0, moved);
    const reordered = newSets.map((s, i) => ({ ...s, order: i }));
    await persistSets(reordered);
  }

  // --- Multi-select ---
  function toggleRow(emptyId: string) {
    const next = new Set(selected);
    if (next.has(emptyId)) next.delete(emptyId);
    else next.add(emptyId);
    selected = next;
  }
</script>

<svelte:head>
  <title>Logbook – Today</title>
</svelte:head>

<div class="px-4 pt-[max(env(safe-area-inset-top),0.75rem)] lg:pt-4 flex-1 flex flex-col overflow-x-hidden">
  <!-- Header -->
  <div class="sticky top-0 z-10 bg-[hsl(var(--background)/0.9)] backdrop-blur-sm pb-3 flex items-center justify-between">
    <div class="flex flex-col min-w-0">
      <p class="text-sm font-semibold text-[hsl(var(--muted-foreground))]">{dateLabel}</p>
      {#if sets.length > 0 && !editingTimes}
        <button
          onclick={beginEditTimes}
          class="-ml-1 mt-0.5 w-fit rounded-md px-1 py-1 text-left text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors cursor-pointer"
        >
          {timesLabel()}
        </button>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      <!-- Sync Status Button -->
      <button
        onclick={handleSyncTap}
        class="flex items-center gap-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs font-medium cursor-pointer shadow-sm transition-all active:scale-95
               {syncError ? 'text-red-500' : 'text-[hsl(var(--foreground))]'}"
        aria-label="Sync now"
        title={syncError
          ?? (hasPendingSync ? 'Changes pending sync' : (lastSync ? `Last synced ${formatLastSync(lastSync)}` : 'Not synced yet'))}
      >
        <span>Sync</span>
        {#if isSyncing}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
               class="animate-spin" style="animation-duration:1.2s">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        {:else if syncError}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
            <line x1="12" y1="13" x2="12" y2="16"/>
            <circle cx="12" cy="18" r="0.5" fill="currentColor"/>
          </svg>
        {:else if hasPendingSync}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
            <path d="M12 7v5l3 2"/>
          </svg>
        {:else if lastSync}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
            <polyline points="9 16 11 18 15 14"/>
          </svg>
        {:else}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
          </svg>
        {/if}
      </button>

      <div class="flex items-center gap-1">
        <button
          class="rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-sm px-2 py-1 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          disabled={!$hasUndo}
          onclick={async () => { undo(sets); await persistSets($setsStore); }}
          aria-label="Undo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[hsl(var(--foreground))]"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
        </button>
        <button
          class="rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-sm px-2 py-1 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          disabled={!$hasRedo}
          onclick={async () => { redo(sets); await persistSets($setsStore); }}
          aria-label="Redo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[hsl(var(--foreground))]"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l.1.2"/></svg>
        </button>
      </div>
    </div>
  </div>

  <!-- Edit mode time selection -->
  {#if editingTimes}
    <div class="mb-6 rounded-xl bg-[hsl(var(--card))] p-3 shadow-sm border border-[hsl(var(--border))]">
      <div class="mb-4">
        <label class="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">Start Time</label>
        <div class="flex gap-2">
          <input type="date" bind:value={editStartDate} class="flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm text-[hsl(var(--foreground))]" />
          <input type="time" bind:value={editStartTime} class="flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm text-[hsl(var(--foreground))]" />
        </div>
      </div>
      <div class="mb-4">
        <label class="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">End Time</label>
        <div class="flex gap-2">
          <input type="date" bind:value={editEndDate} class="flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm text-[hsl(var(--foreground))]" />
          <input type="time" bind:value={editEndTime} class="flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm text-[hsl(var,--foreground))]" />
        </div>
      </div>
      {#if timeEditError}
        <p class="mb-4 text-xs font-medium text-red-500">{timeEditError}</p>
      {/if}
      <div class="flex gap-2">
        <button onclick={cancelEditTimes} class="flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] py-2 text-sm font-medium transition-colors cursor-pointer block">Cancel</button>
        <button onclick={saveEditedTimes} class="flex-1 rounded-lg bg-[hsl(var(--foreground))] text-[hsl(var(--background))] py-2 text-sm font-medium transition-colors cursor-pointer block">Save</button>
      </div>
    </div>
  {/if}

  <!-- Sets table -->
  <div
    class="border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm min-h-30 rounded-2xl relative overflow-visible z-0"
    style={`margin-bottom: ${keypadTableMargin};`}
  >
    <table class="w-full table-fixed border-collapse">
      <thead>
        <tr class="border-b border-[hsl(var(--border))]">
          <th class="w-10 pl-4 pr-0 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">#</th>
          <th class="w-full px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Exercise</th>
          <th class="w-12 px-0.5 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Reps</th>
          <th class="w-14 px-0.5 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{unit}</th>
          <th class="w-12 pl-0 pr-4 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {#each sets as set, i (set.id)}
          <SetRow
            {set}
            selected={selected.has(set.id)}
            isEmpty={false}
            index={i}
            setNumber={i + 1}
            onUpdate={handleUpdate}
            onUpdateMultiple={handleUpdateMultiple}
            onExerciseUpdate={handleExerciseUpdate}
            onDelete={handleDelete}
            onSelect={handleSelect}
            onExpandSet={handleExpandSet}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onTouchReorder={handleTouchReorder}
          />
        {/each}
        {#each emptyRows as emptySet, i}
          <SetRow
            set={emptySet}
            selected={false}
            isEmpty={true}
            index={sets.length + i}
            setNumber={null}
            onAdd={handleAdd}
            onAddMultiple={handleAddMultiple}
            onDragStart={() => {}}
            onDragOver={() => {}}
            onDrop={() => {}}
          />
        {/each}
      </tbody>
    </table>
  </div>

  {#if selected.size > 0}
    <div class="mt-2 flex items-center justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2">
      <span class="text-sm font-medium text-[hsl(var(--foreground))]">{selected.size} selected</span>
      <div class="flex items-center gap-2">
        <button
          onclick={clearSelection}
          class="rounded-lg px-3 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] hover:bg-[hsl(var(--border))] cursor-pointer block"
          aria-label="Clear selection"
        >
          Deselect
        </button>
        <button
          onclick={handleDeleteSelected}
          class="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.2)] cursor-pointer block"
          aria-label="Delete selected sets"
          title="Delete selected"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2.5 4h11"/>
            <path d="M6 2.5h4"/>
            <path d="M5 4v8.5a1 1 0 001 1h4a1 1 0 001-1V4"/>
            <path d="M7 6.5v5M9 6.5v5"/>
          </svg>
        </button>
      </div>
    </div>
  {/if}

  <p class="mt-2 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
    tap a set number to select • swipe to delete set • drag to reorder
  </p>

  {#if locationDenied}
    <p class="mt-2 mb-1 text-center text-xs text-[hsl(var(--muted-foreground))]">
      📍 Location access denied — workout won't be geotagged.
    </p>
  {/if}

  <!-- Custom numeric keypad — rendered at root so it sits above all row content -->
  <NumericKeypad />
</div>
