<script lang="ts">

  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import MuscleMap from '$lib/components/MuscleMap.svelte';
  import SetRow from '$lib/components/SetRow.svelte';
  import NumericKeypad from '$lib/components/NumericKeypad.svelte';
  import { deleteSet, deleteWorkout, getWorkout, saveSets, saveWorkout } from '$lib/db';
  import { EXERCISE_MAP } from '$lib/exercises';
  import { unitPreference, initUnitPreference, userStore, tertiaryActivationPreference, initTertiaryActivationPreference } from '$lib/stores/userStore';
  import { syncToServer } from '$lib/sync';
  import type { Workout, MuscleActivation, WorkoutSet } from '$lib/types';

  const workoutId = $derived($page.params.id);

  let workout = $state<Workout | null>(null);
  let loading = $state(true);

  // Reactive unit preference — auto-subscribes and updates when the store changes
  const unit = $derived($unitPreference);
  const showTertiary = $derived($tertiaryActivationPreference);

  // Time editing state
  let editingTimes = $state(false);
  let editStartDate = $state('');
  let editStartTime = $state('');
  let editEndDate = $state('');
  let editEndTime = $state('');
  let confirmDelete = $state(false);
  let editingWorkout = $state(false);
  let draftSets = $state<WorkoutSet[]>([]);
  let draftSelected = $state<Set<string>>(new Set());
  let draftDragFromIndex = $state<number | null>(null);
  let draftDragToIndex = $state<number | null>(null);
  let stravaConnected = $state(false);
  let stravaSyncing = $state(false);
  let stravaMessage = $state('');
  let shareGenerating = $state(false);
  let shareMessage = $state('');
  let shareMapWrapper = $state<HTMLDivElement | null>(null);

  function toDateInput(ts: number) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function toTimeInput(ts: number) {
    const d = new Date(ts);
    return d.toTimeString().slice(0, 5); // HH:MM
  }
  function fromDateTimeInputs(date: string, time: string): number {
    return new Date(`${date}T${time}:00`).getTime();
  }

  function beginEditTimes() {
    if (!workout) return;
    editStartDate = toDateInput(workout.startTime);
    editStartTime = toTimeInput(workout.startTime);
    editEndDate = toDateInput(workout.endTime);
    editEndTime = toTimeInput(workout.endTime);
    editingTimes = true;
  }

  let timeEditError = $state('');

  function cancelEditTimes() {
    editingTimes = false;
    timeEditError = '';
  }

  async function saveEditedTimes() {
    if (!workout) return;
    const newStart = fromDateTimeInputs(editStartDate, editStartTime);
    const newEnd = fromDateTimeInputs(editEndDate, editEndTime);
    if (isNaN(newStart)) { timeEditError = 'Invalid start date or time.'; return; }
    if (isNaN(newEnd)) { timeEditError = 'Invalid end date or time.'; return; }
    // Prevent zero-duration workouts — end time must be strictly after start time
    if (newEnd <= newStart) { timeEditError = 'End time must be after start time.'; return; }     
    timeEditError = '';
    workout = { ...workout, startTime: newStart, endTime: newEnd };
    await saveWorkout(workout);
    editingTimes = false;
  }

  function beginEditWorkout() {
    if (!workout) return;
    draftSets = workout.sets
      .map((s) => ({ ...s }))
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    draftSelected = new Set();
    editingWorkout = true;
    confirmDelete = false;
  }

  function cancelEditWorkout() {
    editingWorkout = false;
    draftSets = [];
    draftSelected = new Set();
  }

  function persistDraftSets(newSets: WorkoutSet[]) {
    draftSets = newSets.map((s, i) => ({ ...s, order: i }));
  }

  function normalizeDraftValue(field: keyof WorkoutSet, value: unknown) {
    if (field === 'reps') {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value === 'string') {
        if (/[xX×*]/.test(value)) return null;
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    }
    if (field === 'weight') {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    }
    return value;
  }

  function handleDraftAdd(newSet: WorkoutSet) {
    if (!workout) return;
    persistDraftSets([...draftSets, { ...newSet, localWorkoutId: workout.id }]);
  }

  function handleDraftAddMultiple(newSets: WorkoutSet[]) {
    if (!workout) return;
    if (newSets.length === 0) return;
    const workoutLocalId = workout.id;
    persistDraftSets([
      ...draftSets,
      ...newSets.map((s) => ({ ...s, localWorkoutId: workoutLocalId })),
    ]);
  }

  function handleDraftExerciseUpdate(id: string, exerciseId: string, exerciseName: string) {
    persistDraftSets(draftSets.map((s) => (s.id === id ? { ...s, exerciseId, exerciseName } : s)));
  }

  function handleDraftUpdate(id: string, field: keyof WorkoutSet, value: unknown) {
    const normalizedValue = normalizeDraftValue(field, value);
    const targetIds = draftSelected.has(id) && draftSelected.size > 1 ? [...draftSelected] : [id];
    persistDraftSets(
      draftSets.map((s) => (targetIds.includes(s.id) ? { ...s, [field]: normalizedValue } : s))
    );
  }

  function handleDraftUpdateMultiple(id: string, updates: Partial<WorkoutSet>) {
    const targetIds = draftSelected.has(id) && draftSelected.size > 1 ? [...draftSelected] : [id];
    const normalizedUpdates = Object.fromEntries(
      Object.entries(updates).map(([k, v]) => [k, normalizeDraftValue(k as keyof WorkoutSet, v)])
    ) as Partial<WorkoutSet>;
    persistDraftSets(
      draftSets.map((s) => (targetIds.includes(s.id) ? { ...s, ...normalizedUpdates } : s))
    );
  }

  function handleDraftDelete(id: string) {
    if (id.startsWith('empty-')) return;
    persistDraftSets(draftSets.filter((s) => s.id !== id));
    draftSelected.delete(id);
    draftSelected = new Set(draftSelected);
  }

  function handleDraftDeleteSelected() {
    if (draftSelected.size === 0) return;
    const idSet = new Set([...draftSelected].filter((id) => !id.startsWith('empty-')));
    if (idSet.size === 0) return;
    persistDraftSets(draftSets.filter((s) => !idSet.has(s.id)));
    clearDraftSelection();
  }

  function handleDraftSelect(id: string) {
    if (id.startsWith('empty-')) return;
    const next = new Set(draftSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    draftSelected = next;
  }

  function clearDraftSelection() {
    draftSelected = new Set();
  }

  function handleDraftExpandSet(id: string, newSets: WorkoutSet[]) {
    const idx = draftSets.findIndex((s) => s.id === id);
    const before = draftSets.slice(0, idx);
    const after = draftSets.slice(idx + 1);
    persistDraftSets([...before, ...newSets, ...after]);
  }

  function handleDraftDragStart(index: number) {
    draftDragFromIndex = index;
  }

  function handleDraftDragOver(index: number) {
    draftDragToIndex = index;
  }

  function handleDraftDrop() {
    if (
      draftDragFromIndex === null ||
      draftDragToIndex === null ||
      draftDragFromIndex === draftDragToIndex
    ) {
      draftDragFromIndex = null;
      draftDragToIndex = null;
      return;
    }
    const newSets = [...draftSets];
    const [moved] = newSets.splice(draftDragFromIndex, 1);
    newSets.splice(draftDragToIndex, 0, moved);
    draftDragFromIndex = null;
    draftDragToIndex = null;
    persistDraftSets(newSets);
  }

  function handleDraftTouchReorder(fromIndex: number, toIndex: number) {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= draftSets.length ||
      toIndex >= draftSets.length
    ) return;
    const newSets = [...draftSets];
    const [moved] = newSets.splice(fromIndex, 1);
    newSets.splice(toIndex, 0, moved);
    persistDraftSets(newSets);
  }

  async function saveWorkoutEdits() {
    const workoutRef = workout;
    if (!workoutRef) return;
    let nextStartTime = workoutRef.startTime;
    let nextEndTime = workoutRef.endTime;
    if (editingTimes) {
      const newStart = fromDateTimeInputs(editStartDate, editStartTime);
      const newEnd = fromDateTimeInputs(editEndDate, editEndTime);
      if (isNaN(newStart)) { timeEditError = 'Invalid start date or time.'; return; }
      if (isNaN(newEnd)) { timeEditError = 'Invalid end date or time.'; return; }
      if (newEnd <= newStart) { timeEditError = 'End time must be after start time.'; return; }
      timeEditError = '';
      nextStartTime = newStart;
      nextEndTime = newEnd;
    }
    const normalized = draftSets.map((s, i) => ({
      ...s,
      localWorkoutId: workoutRef.id,
      order: i + 1,
      createdAt: s.createdAt ?? Date.now(),
    }));
    const originalIds = new Set(workoutRef.sets.map((s) => s.id));
    const nextIds = new Set(normalized.map((s) => s.id));
    const removedIds = [...originalIds].filter((id) => !nextIds.has(id));
    for (const id of removedIds) {
      await deleteSet(id);
    }
    if (normalized.length > 0) {
      await saveSets(normalized);
    }
    const updatedWorkout = {
      ...workoutRef,
      startTime: nextStartTime,
      endTime: nextEndTime,
      sets: normalized,
    };
    await saveWorkout(updatedWorkout);
    workout = updatedWorkout;
    editingWorkout = false;
    editingTimes = false;
    draftSets = [];
    draftSelected = new Set();
  }

  async function handleDeleteWorkout() {
    if (!workout) return;
    await deleteWorkout(workout.id);
    const user = get(userStore);
    if (user) syncToServer(user).catch(() => {});
    goto('/history');
  }

  async function loadStravaStatus() {
    const user = get(userStore);
    if (!user) {
      stravaConnected = false;
      return;
    }
    try {
      const res = await fetch('/api/strava/status', {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (!res.ok) return;
      const data = (await res.json()) as { connected?: boolean };
      stravaConnected = Boolean(data.connected);
    } catch {
      // ignored
    }
  }

  async function pushWorkoutToStrava() {
    const user = get(userStore);
    if (!user || !workout || stravaSyncing) return;
    stravaSyncing = true;
    stravaMessage = '';
    try {
      const res = await fetch(`/api/strava/workouts/${encodeURIComponent(workout.id)}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      stravaMessage = 'Synced to Strava.';
    } catch (e) {
      stravaMessage = e instanceof Error ? e.message : 'Failed to sync to Strava.';
    } finally {
      stravaSyncing = false;
    }
  }

  async function buildShareImage(): Promise<Blob> {
    await tick();
    if (!workout || !shareMapWrapper) throw new Error('Share preview not ready.');
    const svg = shareMapWrapper.querySelector('svg') as SVGSVGElement | null;
    if (!svg) throw new Error('Share preview not ready.');

    const viewBoxAttr = svg.getAttribute('viewBox') ?? '0 0 768.41 607.66';
    const viewBoxParts = viewBoxAttr.split(' ').map((v) => Number.parseFloat(v));
    const viewWidth = Number.isFinite(viewBoxParts[2]) ? viewBoxParts[2] : 768.41;
    const viewHeight = Number.isFinite(viewBoxParts[3]) ? viewBoxParts[3] : 607.66;

    const shareWidth = 1080;
    const paddingX = 80;
    const paddingTop = 40;
    const gapAfterMap = 48;
    const lineFontSize = 64;
    const lineSpacing = 82;
    const footerFontSize = 44;
    const footerSmallCapsSize = Math.round(footerFontSize * 0.72);
    const footerSpacing = 60;
    const paddingBottom = 48;
    const mapScale = 0.5;
    const mapWidth = (shareWidth - paddingX * 2) * mapScale;
    const mapHeight = mapWidth * (viewHeight / viewWidth);
    const shareLines = [shareSetLabel(), shareLiftLabel(), shareVolumeLabel(), shareTimeLabel()].filter(Boolean);
    const totalHeight = Math.ceil(
      paddingTop + mapHeight + gapAfterMap + lineSpacing * shareLines.length + footerSpacing + paddingBottom
    );

    const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
    clonedSvg.setAttribute('width', String(mapWidth));
    clonedSvg.setAttribute('height', String(mapHeight));

    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = new Image();
    const imageLoaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to render share image.'));
    });
    image.src = svgUrl;
    await imageLoaded;
    URL.revokeObjectURL(svgUrl);

    const canvas = document.createElement('canvas');
    canvas.width = shareWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported.');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const mapX = (shareWidth - mapWidth) / 2;
    ctx.drawImage(image, mapX, paddingTop, mapWidth, mapHeight);

    const fontFamily = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', Roboto, sans-serif";
    const dateLabel = shareDateLabel();
    const logbookLabel = 'LOGBOOK';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let textY = paddingTop + mapHeight + gapAfterMap + lineFontSize / 2;
    ctx.font = `700 ${lineFontSize}px ${fontFamily}`;
    for (const line of shareLines) {
      ctx.fillText(line, shareWidth / 2, textY);
      textY += lineSpacing;
    }
    textY += footerSpacing - lineSpacing;

    const footerSmallCapsFont = `600 ${footerSmallCapsSize}px ${fontFamily}`;
    const bullet = ' • ';
    ctx.font = footerSmallCapsFont;
    const dateWidth = ctx.measureText(dateLabel).width;
    const bulletWidth = ctx.measureText(bullet).width;
    const logbookWidth = ctx.measureText(logbookLabel).width;
    const footerTotalWidth = dateWidth + bulletWidth + logbookWidth;
    const footerStartX = (shareWidth - footerTotalWidth) / 2;
    ctx.textAlign = 'left';
    ctx.font = footerSmallCapsFont;
    ctx.fillText(dateLabel, footerStartX, textY);
    ctx.fillText(bullet, footerStartX + dateWidth, textY);
    ctx.font = footerSmallCapsFont;
    ctx.fillText(logbookLabel, footerStartX + dateWidth + bulletWidth, textY);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to generate share image.');
    return blob;
  }

  async function shareWorkout() {
    if (!workout || shareGenerating) return;
    shareGenerating = true;
    shareMessage = '';
    try {
      const blob = await buildShareImage();
      const fileName = `logbook-${new Date(workout.startTime).toISOString().slice(0, 10)}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.share && (navigator.canShare?.({ files: [file] }) ?? true)) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        shareMessage = 'Image downloaded.';
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        shareMessage = '';
      } else {
        shareMessage = err instanceof Error ? err.message : 'Failed to share workout.';
      }
    } finally {
      shareGenerating = false;
    }
  }

  onMount(async () => {
    initUnitPreference();
    initTertiaryActivationPreference();
    if (workoutId) {
      workout = await getWorkout(workoutId) ?? null;
    }
    await loadStravaStatus();
    loading = false;
  });

  const durationMs = $derived(workout ? workout.endTime - workout.startTime : 0);
  const durationLabel = $derived(() => {
    const min = Math.round(durationMs / 60000);
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  });

  const ACTIVATION_RANK: Record<string, number> = { primary: 3, secondary: 2, tertiary: 1 };

  function buildActivations(sourceSets: WorkoutSet[], includeTertiary: boolean) {
    const map = new Map<string, 'primary' | 'secondary' | 'tertiary'>();
    for (const s of sourceSets) {
      const ex = EXERCISE_MAP.get(s.exerciseId);
      if (!ex) continue;
      for (const ma of ex.muscleActivations) {
        if (!includeTertiary && ma.activation === 'tertiary') continue;
        const existing = map.get(ma.muscle);
        const incomingRank = ACTIVATION_RANK[ma.activation] ?? 0;
        const existingRank = existing ? (ACTIVATION_RANK[existing] ?? 0) : 0;
        if (incomingRank > existingRank) {
          map.set(ma.muscle, ma.activation);
        }
      }
    }
    return [...map.entries()].map(([muscle, activation]) => ({
      muscle: muscle as MuscleActivation['muscle'],
      activation,
    }));
  }

  function buildMuscleDetails(sourceSets: WorkoutSet[], includeTertiary: boolean) {
    const details = new Map<string, { activation: 'primary' | 'secondary' | 'tertiary'; exercises: Set<string> }>();
    for (const s of sourceSets) {
      const ex = EXERCISE_MAP.get(s.exerciseId);
      if (!ex) continue;
      for (const ma of ex.muscleActivations) {
        if (!includeTertiary && ma.activation === 'tertiary') continue;
        const existing = details.get(ma.muscle);
        const incomingRank = ACTIVATION_RANK[ma.activation] ?? 0;
        const existingRank = existing ? (ACTIVATION_RANK[existing.activation] ?? 0) : 0;
        if (!existing) {
          details.set(ma.muscle, { activation: ma.activation, exercises: new Set([s.exerciseName]) });
        } else {
          if (incomingRank > existingRank) existing.activation = ma.activation;
          existing.exercises.add(s.exerciseName);
        }
      }
    }
    return Object.fromEntries(
      [...details.entries()].map(([muscle, value]) => [muscle, { activation: value.activation, exercises: [...value.exercises] }])
    );
  }

  const allActivations = $derived(() => {
    if (!workout) return [];
    const sourceSets = editingWorkout ? draftSets : workout.sets;
    return buildActivations(sourceSets, showTertiary);
  });

  const shareActivations = $derived(() => {
    if (!workout) return [];
    return buildActivations(workout.sets, false);
  });

  const muscleDetails = $derived(() => {
    if (!workout) return {};
    const sourceSets = editingWorkout ? draftSets : workout.sets;
    return buildMuscleDetails(sourceSets, showTertiary);
  });

  // Group sets by exercise
  const setsByExercise = $derived(() => {
    if (!workout) return [];
    const sourceSets = editingWorkout ? draftSets : workout.sets;
    const map = new Map<string, typeof sourceSets>();
    for (const s of sourceSets) {
      if (!map.has(s.exerciseName)) map.set(s.exerciseName, []);
      map.get(s.exerciseName)!.push(s);
    }
    return [...map.entries()];
  });

  const dateLabel = $derived(
    workout
      ? new Date(workout.startTime).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        })
      : ''
  );

  const timeLabel = $derived(
    workout
      ? `${new Date(workout.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${new Date(workout.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      : ''
  );

  const shareSetLabel = $derived(() => (workout ? `${workout.sets.length} sets` : ''));

  const shareLiftLabel = $derived(() => {
    if (!workout) return '';
    const liftCount = new Set(workout.sets.map((s) => s.exerciseId).filter(Boolean)).size;
    return `${liftCount} lifts`;
  });

  const shareVolumeLabel = $derived(() => {
    if (!workout) return '';
    const formatted = new Intl.NumberFormat('en-US').format(computeTotalVolume());
    const unitLabel = unit === 'kg' ? 'kg' : 'lbs';
    return `${formatted} ${unitLabel}`;
  });

  const shareTimeLabel = $derived(() => (workout ? durationLabel() : ''));

  const shareDateLabel = $derived(() =>
    workout
      ? new Date(workout.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : ''
  );


  const draftEmptyRows = $derived(
    workout
      ? [
          {
            id: 'empty-0',
            localWorkoutId: workout.id,
            exerciseId: '',
            exerciseName: '',
            reps: null,
            weight: null,
            order: draftSets.length,
            createdAt: Date.now(),
          } as WorkoutSet,
        ]
      : []
  );

  // --- Helpers for compact display and totals
  function computeTotalVolume() {
    if (!workout) return 0;
    let total = 0;
    for (const s of workout.sets) {
      if (typeof s.reps === 'number' && typeof s.weight === 'number' && s.reps > 0 && s.weight > 0) {
        total += s.reps * s.weight;
      }
    }
    return Math.round(total);
  }

  function formatExerciseCompact(exName: string, setsArr: any[]) {
    // Determine if all sets have same reps and same weight (and weight > 0)
    if (!setsArr || setsArr.length === 0) return '';
    const parts = setsArr.map((s) => ({ reps: s.reps, weight: s.weight }));
    const allSameReps = parts.every((p) => p.reps === parts[0].reps);
    const allSameWeight = parts.every((p) => p.weight === parts[0].weight);

    const firstEx = EXERCISE_MAP.get(setsArr[0].exerciseId);
    const isBodyweight = firstEx?.category === 'bodyweight';

    if (isBodyweight) {
      // Count occurrences of identical reps sequences
      const repsCounts = new Map();
      for (const p of parts) {
        const key = String(p.reps ?? '');
        repsCounts.set(key, (repsCounts.get(key) || 0) + 1);
      }
      // Typical output: 3x6 reps if all same
      if (repsCounts.size === 1) {
        const reps = parts[0].reps ?? 0;
        return `${parts.length}x${reps} reps`;
      }
      // Otherwise list each set as NxR
      return parts.map((p) => `${p.reps ?? ''}x${p.weight ?? ''} ${isBodyweight ? 'reps' : ''}`.trim()).join(', ');
    }

    if (allSameReps && allSameWeight && parts[0].reps != null && parts[0].weight != null) {
      return `${parts.length}x${parts[0].reps}x${parts[0].weight}`;
    }

    // Mixed sets: join each as `${reps}x${weight}` skipping nulls
    return parts.map((p) => {
      const r = p.reps != null ? String(p.reps) : '';
      const w = p.weight != null ? String(p.weight) : '';
      if (r && w) return `${r}x${w}`;
      if (r && !w) return `${r} reps`;
      return `${w}`;
    }).filter(Boolean).join(', ');
  }
</script>

<svelte:head>
  <title>Logbook – Workout</title>
</svelte:head>

<div class="px-4 pt-4">
  <!-- Header -->
  <button onclick={() => goto('/history')} class="mb-4 flex items-center gap-1 text-sm text-[hsl(var(--primary))] hover:underline">
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M10 4L6 8l4 4"/>
    </svg>
    History
  </button>

  {#if loading}
    <div class="flex items-center justify-center py-16">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent"></div>
    </div>
  {:else if !workout}
    <div class="py-16 text-center">
      <p class="text-[hsl(var(--muted-foreground))]">Workout not found.</p>
    </div>
  {:else}
    <div class="mb-5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm lg:p-5">
      <div class="grid gap-5 lg:grid-cols-[3fr_2fr] lg:items-start ">

        <!-- Mobile-first: Muscle map first (no header above it) -->
        <section class="order-1 lg:order-2">
          <MuscleMap activations={allActivations()} details={muscleDetails()} showTertiary={showTertiary} />
        </section>

        <!-- Info block: name, start time, duration · # sets · total volume, Edit/Delete buttons -->
        <section class="order-2 lg:order-1 min-w-0">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h1 class="text-lg font-black text-[hsl(var(--foreground))] truncate">{new Date(workout.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {new Date(workout.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</h1>
              <p class="text-md font-bold text-[hsl(var(--foreground))] mt-1">
                {(() => {
                  const mins = Math.round((workout.endTime - workout.startTime) / 60000);
                  const setsCount = workout.sets.length;
                  const vol = computeTotalVolume();
                  const minsLabel = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
                  const unitLabel = $unitPreference === 'kg' ? 'kg' : 'lbs';
                  const formatted = new Intl.NumberFormat('en-US').format(vol);
                  return `${minsLabel} · ${setsCount} sets · ${formatted} ${unitLabel}`;
                })()}
              </p>
            </div>
            <div class="flex text-right flex-col">
              {#if stravaConnected}
                <button class="text-sm text-[hsl(var(--primary))]" disabled={stravaSyncing} onclick={pushWorkoutToStrava}>
                  {stravaSyncing ? 'Pushing…' : 'Push to Strava'}
                </button>
              {/if}
              <button
                class="text-sm text-right text-[hsl(var(--primary))]"
                disabled={shareGenerating || editingWorkout}
                onclick={shareWorkout}
              >
                {shareGenerating ? 'Preparing…' : 'Share'}
              </button>
              <button class="text-sm text-right text-[hsl(var(--primary))]" onclick={() => { beginEditWorkout(); beginEditTimes(); }}>Edit</button>
              <button class="text-sm text-right text-red-500" onclick={() => { confirmDelete = true; }}>Delete</button>
            </div>
          </div>
          {#if stravaMessage}
            <p class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{stravaMessage}</p>
          {/if}
          {#if shareMessage}
            <p class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{shareMessage}</p>
          {/if}

          {#if editingTimes}
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium text-[hsl(var(--muted-foreground))]">Start</span>
                <input type="date" bind:value={editStartDate} class="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
                <input type="time" bind:value={editStartTime} class="w-24 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium text-[hsl(var(--muted-foreground))]">End</span>
                <input type="date" bind:value={editEndDate} class="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
                <input type="time" bind:value={editEndTime} class="w-24 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
              </div>
              <button onclick={saveEditedTimes} class="rounded-xl bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-medium text-white">Save</button>
              <button onclick={cancelEditTimes} class="rounded-xl bg-[hsl(var(--muted))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">Cancel</button>
            </div>
            {#if timeEditError}
              <p class="mt-2 text-xs text-red-500">{timeEditError}</p>
            {/if}
          {/if}

          {#if !editingWorkout}
            <hr class="my-3 border-[hsl(var(--border))]" />
            <!-- Compact exercises list -->
            <div class="flex flex-col gap-3">
              {#each setsByExercise() as [exName, setsArr]}
                <div>
                  <div class="flex items-baseline gap-2">
                    <p class="text-sm font-medium text-[hsl(var(--foreground))] truncate">{exName}</p>
                    <span class="text-xs text-[hsl(var(--muted-foreground))]">({setsArr.length})</span>
                  </div>
                  <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{formatExerciseCompact(exName, setsArr)}</p>
                </div>
              {/each}
            </div>
          {/if}

        </section>

      </div>
    </div>
  {/if}
</div>

<!-- Divider between workout info and sets table (editing mode) -->
{#if editingWorkout}
  <hr class="my-4 border-[hsl(var(--border))]" />
{/if}

{#if editingWorkout && workout}
  <div class="px-4 pb-6">
    <div class="mb-3 flex items-center justify-between gap-2">
      <p class="text-sm font-medium text-[hsl(var(--foreground))]">Editing sets</p>
      <div class="flex items-center gap-2">
        <button
          onclick={cancelEditWorkout}
          class="rounded-xl bg-[hsl(var(--muted))] px-3 py-2 text-xs font-medium text-[hsl(var(--muted-foreground))]"
        >
          Cancel
        </button>
        <button
          onclick={saveWorkoutEdits}
          class="rounded-xl bg-[hsl(var(--primary))] px-3 py-2 text-xs font-medium text-white"
        >
          Save changes
        </button>
      </div>
    </div>

    <div class="-mx-4 border-y border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm min-h-30">
      <table class="w-full border-collapse">
        <thead>
          <tr class="border-b border-[hsl(var(--border))]">
            <th class="w-10 pl-4 pr-0 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">#</th>
            <th class="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Exercise</th>
            <th class="w-12 px-0.5 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Reps</th>
            <th class="w-14 px-0.5 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{unit}</th>
            <th class="w-12 pl-0 pr-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {#each draftSets as set, i (set.id)}
            <SetRow
              {set}
              selected={draftSelected.has(set.id)}
              isEmpty={false}
              index={i}
              setNumber={i + 1}
              onUpdate={handleDraftUpdate}
              onUpdateMultiple={handleDraftUpdateMultiple}
              onExerciseUpdate={handleDraftExerciseUpdate}
              onDelete={handleDraftDelete}
              onSelect={handleDraftSelect}
              onExpandSet={handleDraftExpandSet}
              onDragStart={handleDraftDragStart}
              onDragOver={handleDraftDragOver}
              onDrop={handleDraftDrop}
              onTouchReorder={handleDraftTouchReorder}
            />
          {/each}
          {#each draftEmptyRows as emptySet, i}
            <SetRow
              set={emptySet}
              selected={false}
              isEmpty={true}
              index={draftSets.length + i}
              setNumber={null}
              onAdd={handleDraftAdd}
              onAddMultiple={handleDraftAddMultiple}
              onDragStart={() => {}}
              onDragOver={() => {}}
              onDrop={() => {}}
            />
          {/each}
        </tbody>
      </table>
    </div>

    {#if draftSelected.size > 0}
      <div class="mt-2 flex items-center justify-between rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2">
        <span class="text-sm font-medium text-[hsl(var(--primary))]">{draftSelected.size} selected</span>
        <div class="flex items-center gap-2">
          <button
            onclick={clearDraftSelection}
            class="rounded-lg px-3 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] hover:bg-[hsl(var(--border))]"
            aria-label="Clear selection"
          >
            Deselect
          </button>
          <button
            onclick={handleDraftDeleteSelected}
            class="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
            aria-label="Delete selected sets"
          >
            Delete
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<!-- Custom numeric keypad — rendered at root so it sits above all row content -->
<NumericKeypad />

{#if workout}
  <div bind:this={shareMapWrapper} class="sr-only" aria-hidden="true">
    <MuscleMap activations={shareActivations()} showTertiary={false} showLegend={false} />
  </div>
{/if}
