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
  import { unitPreference, initUnitPreference, userStore, tertiaryActivationPreference, initTertiaryActivationPreference, timeFormatPreference, initTimeFormatPreference } from '$lib/stores/userStore';
  import { keypadConfig } from '$lib/stores/keypadStore';
  import { Share2, Pencil, Trash2 } from 'lucide-svelte';
  import { syncToServer } from '$lib/sync';
  import type { Workout, MuscleActivation, WorkoutSet } from '$lib/types';

  const workoutId = $derived($page.params.id);

  let workout = $state<Workout | null>(null);
  let loading = $state(true);

  // Reactive unit preference — auto-subscribes and updates when the store changes
  const unit = $derived($unitPreference);
  const showTertiary = $derived($tertiaryActivationPreference);
  const timeFormat = $derived($timeFormatPreference);
  const keypadTableMargin = $derived($keypadConfig ? 'calc(18rem + env(safe-area-inset-bottom))' : '0px');

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
  let dragPreviewActive = $state(false);
  let dragPreviewOriginal = $state<WorkoutSet[] | null>(null);
  let dragPreviewDirty = $state(false);
  let dragItemId = $state<string | null>(null);
  let dragPreviewRaf: number | null = null;
  let pendingDragTargetIndex: number | null = null;
  let stravaConnected = $state(false);
  let stravaSyncing = $state(false);
  let stravaMessage = $state('');
  type ShareVariant = 'simple' | 'stats' | 'detailed';
  const shareVariants: ShareVariant[] = ['simple', 'stats', 'detailed'];
  let shareGenerating = $state(false);
  let shareMessage = $state('');
  let shareMenuOpen = $state(false);
  let sharePreviewLoading = $state(false);
  let sharePreviewUrls = $state<Partial<Record<ShareVariant, string>>>({});
  let sharePreviewBlobs = $state<Partial<Record<ShareVariant, Blob>>>({});
  let shareActiveVariant = $state<ShareVariant | null>(null);
  let sharePreviewRequestId = 0;
  let shareMapWrapper = $state<HTMLDivElement | null>(null);
  const THIN_SPACE = '\u2009';
  type ShareExerciseLine = { count: number; name: string };
  type ShareExerciseLineLayout = {
    prefix: string;
    prefixWidth: number;
    name: string;
    nameWidth: number;
    totalWidth: number;
  };
  type ShareExerciseBlock = { type: 'superset' | 'single'; lines: ShareExerciseLine[] };
  const shareVariantLabels: Record<ShareVariant, string> = {
    simple: 'Simple',
    stats: 'Stats',
    detailed: 'Detailed',
  };

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
    cancelEditTimes();
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
    const target = draftSets[index];
    if (!target) return;
    dragItemId = target.id;
    dragPreviewOriginal = draftSets.map((s) => ({ ...s }));
    dragPreviewDirty = false;
    dragPreviewActive = true;
    draftDragFromIndex = index;
    pendingDragTargetIndex = null;
  }

  function handleDraftDragOver(index: number) {
    draftDragToIndex = index;
    if (!dragPreviewActive || !dragItemId) return;
    pendingDragTargetIndex = index;
    if (dragPreviewRaf !== null) return;
    dragPreviewRaf = requestAnimationFrame(() => {
      dragPreviewRaf = null;
      if (!dragPreviewActive || !dragItemId || pendingDragTargetIndex === null) return;
      const targetIndex = pendingDragTargetIndex;
      pendingDragTargetIndex = null;
      const currentIndex = draftSets.findIndex((s) => s.id === dragItemId);
      if (currentIndex < 0 || currentIndex === targetIndex) return;
      const next = [...draftSets];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, moved);
      dragPreviewDirty = true;
      persistDraftSets(next);
    });
  }

  function handleDraftDrop() {
    if (dragPreviewRaf !== null) {
      cancelAnimationFrame(dragPreviewRaf);
      dragPreviewRaf = null;
    }
    pendingDragTargetIndex = null;
    if (dragPreviewActive) {
      if (!dragPreviewDirty && dragPreviewOriginal) {
        persistDraftSets(dragPreviewOriginal);
      }
      dragPreviewActive = false;
      dragPreviewOriginal = null;
      dragPreviewDirty = false;
      dragItemId = null;
    }
    draftDragFromIndex = null;
    draftDragToIndex = null;
  }

  function handleDraftTouchReorder(fromIndex: number, toIndex: number) {
    if (dragPreviewActive) {
      handleDraftDrop();
      return;
    }
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

  function truncateTextToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    const ellipsis = '…';
    let truncated = text;
    while (truncated.length > 0 && ctx.measureText(`${truncated}${ellipsis}`).width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated ? `${truncated}${ellipsis}` : ellipsis;
  }

  function layoutShareExerciseLine(
    ctx: CanvasRenderingContext2D,
    line: ShareExerciseLine,
    maxWidth: number,
    numberFont: string,
    exerciseFont: string,
  ): ShareExerciseLineLayout {
    const prefix = `${line.count}${THIN_SPACE}x${THIN_SPACE}`;
    ctx.font = numberFont;
    const prefixWidth = ctx.measureText(prefix).width;
    ctx.font = exerciseFont;
    const name = truncateTextToWidth(ctx, line.name, Math.max(0, maxWidth - prefixWidth));
    const nameWidth = ctx.measureText(name).width;
    return { prefix, prefixWidth, name, nameWidth, totalWidth: prefixWidth + nameWidth };
  }

  function drawShareExerciseLine(
    ctx: CanvasRenderingContext2D,
    layout: ShareExerciseLineLayout,
    x: number,
    y: number,
    align: 'left' | 'center',
    numberFont: string,
    exerciseFont: string,
  ) {
    const startX = align === 'center' ? x - layout.totalWidth / 2 : x;
    ctx.textAlign = 'left';
    ctx.font = numberFont;
    ctx.fillText(layout.prefix, startX, y);
    ctx.font = exerciseFont;
    ctx.fillText(layout.name, startX + layout.prefixWidth, y);
  }

  function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function buildShareExerciseBlocks(): ShareExerciseBlock[] {
    if (!workout) return [];
    const blocks = buildDisplayBlocks(workout.sets);
    return blocks.map((block) => ({
      type: block.type,
      lines: block.segments.map((seg) => ({ count: seg.sets.length, name: seg.exerciseName }))
    }));
  }

  function buildShareSummaryLines(variant: ShareVariant): string[] {
    const parts = variant === 'stats'
      ? [shareSetLabel(), shareLiftLabel(), shareVolumeLabel(), shareTimeLabel()]
      : [shareSetLabel(), shareTimeLabel()];
    const filtered = parts.filter((value): value is string => Boolean(value));
    if (filtered.length === 0) return [];
    if (variant !== 'stats' || filtered.length <= 2) {
      return [filtered.join(' • ')];
    }
    const splitIndex = Math.ceil(filtered.length / 2);
    return [
      filtered.slice(0, splitIndex).join(' • '),
      filtered.slice(splitIndex).join(' • '),
    ];
  }

  function clearSharePreviews() {
    for (const url of Object.values(sharePreviewUrls)) {
      if (url) URL.revokeObjectURL(url);
    }
    sharePreviewUrls = {};
    sharePreviewBlobs = {};
  }

  async function loadSharePreviews() {
    if (!workout) return;
    sharePreviewLoading = true;
    sharePreviewRequestId += 1;
    const requestId = sharePreviewRequestId;
    clearSharePreviews();
    try {
      const blobs: Partial<Record<ShareVariant, Blob>> = {};
      await Promise.all(
        shareVariants.map(async (variant) => {
          blobs[variant] = await buildShareImage(variant);
        })
      );
      if (!shareMenuOpen || requestId !== sharePreviewRequestId) return;
      sharePreviewBlobs = blobs;
      const urls: Partial<Record<ShareVariant, string>> = {};
      for (const [variant, blob] of Object.entries(blobs)) {
        if (blob) urls[variant as ShareVariant] = URL.createObjectURL(blob);
      }
      sharePreviewUrls = urls;
    } catch (err) {
      shareMessage = err instanceof Error ? err.message : 'Failed to build share preview.';
    } finally {
      if (requestId === sharePreviewRequestId) sharePreviewLoading = false;
    }
  }

  function openShareMenu() {
    if (!workout || shareGenerating) return;
    shareMenuOpen = true;
    void loadSharePreviews();
  }

  function closeShareMenu() {
    shareMenuOpen = false;
    clearSharePreviews();
  }

  async function buildShareImage(variant: ShareVariant): Promise<Blob> {
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
    const detailFontSize = 40;
    const detailSpacing = 48;
    const detailGap = 20;
    const footerFontSize = 44;
    const footerSmallCapsSize = Math.round(footerFontSize * 0.72);
    const footerSpacing = 60;
    const paddingBottom = 48;
    const mapScale = 0.5;
    const mapWidth = (shareWidth - paddingX * 2) * mapScale;
    const mapHeight = mapWidth * (viewHeight / viewWidth);
    const shareLines = buildShareSummaryLines(variant);
    const exerciseBlocks = variant === 'detailed' ? buildShareExerciseBlocks() : [];
    const supersetLabel = 'SUPERSET';
    const supersetLabelFontSize = Math.round(detailFontSize * 0.45);
    const supersetLabelGap = Math.round(detailFontSize * 0.2);
    const supersetLabelHeight = supersetLabelFontSize;
    const supersetBlockPaddingX = Math.round(detailFontSize * 0.45);
    const supersetBlockPaddingY = Math.round(detailFontSize * 0.4);
    const supersetBlockRadius = Math.round(detailFontSize * 0.5);
    const supersetBlockHeight = (lineCount: number) =>
      supersetBlockPaddingY * 2 + supersetLabelHeight + supersetLabelGap + detailSpacing * lineCount;
    const exerciseSectionHeight = exerciseBlocks.length
      ? detailGap + exerciseBlocks.reduce(
        (sum, block) => sum + (block.type === 'superset' ? supersetBlockHeight(block.lines.length) : detailSpacing * block.lines.length),
        0
      )
      : 0;
    const totalHeight = Math.ceil(
      paddingTop
      + mapHeight
      + gapAfterMap
      + lineSpacing * shareLines.length
      + exerciseSectionHeight
      + footerSpacing
      + paddingBottom
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
    if (exerciseBlocks.length) {
      const detailNumberSize = Math.round(detailFontSize * 0.82);
      const detailExerciseFont = `600 small-caps ${detailFontSize}px ${fontFamily}`;
      const detailNumberFont = `600 ${detailNumberSize}px ${fontFamily}`;
      const supersetLabelFont = `700 ${supersetLabelFontSize}px ${fontFamily}`;
      textY += detailGap;
      for (const block of exerciseBlocks) {
        ctx.fillStyle = '#ffffff';
        if (block.type === 'superset') {
          const maxBlockWidth = shareWidth - paddingX * 2;
          const maxTextWidth = maxBlockWidth - supersetBlockPaddingX * 2;
          const lineLayouts = block.lines.map((line) =>
            layoutShareExerciseLine(ctx, line, maxTextWidth, detailNumberFont, detailExerciseFont)
          );
          ctx.font = supersetLabelFont;
          const labelTextWidth = ctx.measureText(supersetLabel).width;
          const contentWidth = Math.max(labelTextWidth, ...lineLayouts.map((line) => line.totalWidth));
          const blockWidth = Math.min(maxBlockWidth, contentWidth + supersetBlockPaddingX * 2);
          const blockHeight = supersetBlockHeight(lineLayouts.length);
          const blockX = (shareWidth - blockWidth) / 2;
          const blockY = textY - detailSpacing / 2;
          drawRoundedRect(ctx, blockX, blockY, blockWidth, blockHeight, supersetBlockRadius);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          const labelX = blockX + supersetBlockPaddingX;
          const labelY = blockY + supersetBlockPaddingY + supersetLabelHeight / 2;
          ctx.fillStyle = '#ffffff';
          ctx.font = supersetLabelFont;
          ctx.textAlign = 'left';
          ctx.fillText(supersetLabel, labelX, labelY);
          const lineStartY = blockY + supersetBlockPaddingY + supersetLabelHeight + supersetLabelGap + detailSpacing / 2;
          for (let i = 0; i < lineLayouts.length; i += 1) {
            drawShareExerciseLine(ctx, lineLayouts[i], labelX, lineStartY + detailSpacing * i, 'left', detailNumberFont, detailExerciseFont);
          }
          textY = blockY + blockHeight + detailSpacing / 2;
        } else {
          const lineLayout = layoutShareExerciseLine(ctx, block.lines[0], shareWidth - paddingX * 2, detailNumberFont, detailExerciseFont);
          drawShareExerciseLine(ctx, lineLayout, shareWidth / 2, textY, 'center', detailNumberFont, detailExerciseFont);
          textY += detailSpacing;
        }
      }
      textY += footerSpacing - detailSpacing;
    } else {
      textY += footerSpacing - lineSpacing;
    }

    const footerSmallCapsFont = `600 ${footerSmallCapsSize}px ${fontFamily}`;
    ctx.font = footerSmallCapsFont;
    const dateWidth = ctx.measureText(dateLabel).width;
    const logbookWidth = ctx.measureText(logbookLabel).width;
    const bulletChar = '•';
    const bulletWidth = ctx.measureText(bulletChar).width;
    const bulletGap = Math.round(footerSmallCapsSize * 0.6);
    const bulletBlockWidth = bulletWidth + bulletGap * 2;
    const sideWidth = Math.max(dateWidth, logbookWidth);
    const footerTotalWidth = sideWidth * 2 + bulletBlockWidth;
    const footerStartX = (shareWidth - footerTotalWidth) / 2;
    ctx.font = footerSmallCapsFont;
    ctx.textAlign = 'right';
    ctx.fillText(dateLabel, footerStartX + sideWidth, textY);
    ctx.textAlign = 'center';
    ctx.fillText(bulletChar, footerStartX + sideWidth + bulletBlockWidth / 2, textY);
    ctx.textAlign = 'left';
    ctx.fillText(logbookLabel, footerStartX + sideWidth + bulletBlockWidth, textY);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to generate share image.');
    return blob;
  }

  async function shareWorkout(variant: ShareVariant) {
    if (!workout || shareGenerating) return;
    shareGenerating = true;
    shareActiveVariant = variant;
    shareMessage = '';
    try {
      const blob = sharePreviewBlobs[variant] ?? await buildShareImage(variant);
      const dateTag = new Date(workout.startTime).toISOString().slice(0, 10);
      const suffix = variant === 'detailed' ? '-detailed' : '';
      const fileName = `logbook-${dateTag}${suffix}.png`;
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
      shareActiveVariant = null;
    }
  }

  onMount(async () => {
    initUnitPreference();
    initTertiaryActivationPreference();
    initTimeFormatPreference();
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

  type SetSegment = { exerciseId: string; exerciseName: string; sets: WorkoutSet[] };

  function sortSetsInOrder(sets: WorkoutSet[]) {
    return [...sets].sort((a, b) => {
      const orderDiff = (a.order ?? 0) - (b.order ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });
  }

  function buildSegments(sourceSets: WorkoutSet[]): SetSegment[] {
    const ordered = sortSetsInOrder(sourceSets);
    const segments: SetSegment[] = [];
    for (const s of ordered) {
      const last = segments[segments.length - 1];
      if (last && last.exerciseId === s.exerciseId && last.exerciseName === s.exerciseName) {
        last.sets.push(s);
      } else {
        segments.push({ exerciseId: s.exerciseId, exerciseName: s.exerciseName, sets: [s] });
      }
    }
    return segments;
  }

  function buildExerciseGroups(sourceSets: WorkoutSet[]) {
    const ordered = sortSetsInOrder(sourceSets);
    const map = new Map<string, SetSegment>();
    const order: string[] = [];
    for (const s of ordered) {
      const key = `${s.exerciseId}::${s.exerciseName}`;
      if (!map.has(key)) {
        map.set(key, { exerciseId: s.exerciseId, exerciseName: s.exerciseName, sets: [] });
        order.push(key);
      }
      map.get(key)!.sets.push(s);
    }
    return order.map((key) => map.get(key)!).filter(Boolean);
  }

  function getSupersetExerciseKeys(sourceSets: WorkoutSet[]) {
    const segments = buildSegments(sourceSets);
    const counts = new Map<string, number>();
    for (const seg of segments) {
      const key = `${seg.exerciseId}::${seg.exerciseName}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const supersetKeys = new Set<string>();
    for (const [key, count] of counts.entries()) {
      if (count > 1) supersetKeys.add(key);
    }
    return supersetKeys;
  }

  function buildDisplayBlocks(sourceSets: WorkoutSet[]) {
    const groups = buildExerciseGroups(sourceSets);
    const supersetKeys = getSupersetExerciseKeys(sourceSets);
    const blocks: { type: 'superset' | 'single'; segments: SetSegment[] }[] = [];
    let i = 0;
    while (i < groups.length) {
      const key = `${groups[i].exerciseId}::${groups[i].exerciseName}`;
      if (supersetKeys.has(key)) {
        const start = i;
        let end = i;
        while (end < groups.length) {
          const nextKey = `${groups[end].exerciseId}::${groups[end].exerciseName}`;
          if (!supersetKeys.has(nextKey)) break;
          end += 1;
        }
        blocks.push({ type: 'superset', segments: groups.slice(start, end) });
        i = end;
      } else {
        blocks.push({ type: 'single', segments: [groups[i]] });
        i += 1;
      }
    }
    return blocks;
  }

  const setDisplayBlocks = $derived(() => {
    if (!workout) return [] as { type: 'superset' | 'single'; segments: SetSegment[] }[];
    const sourceSets = editingWorkout ? draftSets : workout.sets;
    return buildDisplayBlocks(sourceSets);
  });

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: timeFormat === '12h',
    });
  }

  const dateLabel = $derived(
    workout
      ? new Date(workout.startTime).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        })
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

  const shareTimeLabel = $derived(() => {
    if (!workout) return '';
    const min = Math.round((workout.endTime - workout.startTime) / 60000);
    return `${min} min`;
  });

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
    const ordered = sortSetsInOrder(setsArr);
    const parts = ordered.map((s) => ({ reps: s.reps, weight: s.weight }));
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
              <h1 class="text-lg font-black text-[hsl(var(--foreground))] truncate">{new Date(workout.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {formatTime(workout.startTime)}</h1>
              <div class="mt-1 flex flex-wrap items-center gap-3">
                <p class="text-md font-bold text-[hsl(var(--foreground))]">
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
                <div class="flex items-center gap-1">
                  <button
                    class="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
                    disabled={shareGenerating || editingWorkout}
                    onclick={openShareMenu}
                    aria-label="Share workout"
                    title="Share"
                  >
                    <Share2 class="h-4 w-4" />
                  </button>
                  <button
                    class="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
                    onclick={() => { beginEditWorkout(); beginEditTimes(); }}
                    aria-label="Edit workout"
                    title="Edit"
                  >
                    <Pencil class="h-4 w-4" />
                  </button>
                  <button
                    class="rounded-lg p-1.5 text-red-500 hover:text-red-600 hover:bg-[hsl(var(--muted))] transition-colors"
                    onclick={() => { confirmDelete = true; }}
                    aria-label="Delete workout"
                    title="Delete"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <div class="flex text-right flex-col">
              <!--{#if stravaConnected}
                <button class="text-sm text-[hsl(var(--primary))]" disabled={stravaSyncing} onclick={pushWorkoutToStrava}>
                  {stravaSyncing ? 'Pushing…' : 'Push to Strava'}
                </button>
              {/if}-->
            </div>
          </div>
          {#if stravaMessage}
            <p class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{stravaMessage}</p>
          {/if}
          {#if shareMessage}
            <p class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{shareMessage}</p>
          {/if}

          {#if editingTimes}
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <div class="flex items-center gap-1">
                <span class="text-[0.7rem] font-medium text-[hsl(var(--muted-foreground))]">Start</span>
                <input type="date" bind:value={editStartDate} class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-[0.7rem] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
                <input type="time" bind:value={editStartTime} class="w-20 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-[0.7rem] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
              </div>
              <div class="flex items-center gap-1">
                <span class="text-[0.7rem] font-medium text-[hsl(var(--muted-foreground))]">End</span>
                <input type="date" bind:value={editEndDate} class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-[0.7rem] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
                <input type="time" bind:value={editEndTime} class="w-20 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-[0.7rem] outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]" />
              </div>
            </div>
            {#if timeEditError}
              <p class="mt-2 text-xs text-red-500">{timeEditError}</p>
            {/if}
          {/if}

          {#if !editingWorkout}
            <hr class="my-3 border-[hsl(var(--border))]" />
            <!-- Compact exercises list -->
            <div class="flex flex-col gap-3">
              {#each setDisplayBlocks() as block}
                {#if block.type === 'superset'}
                  <div class="relative rounded-2xl border border-[hsl(var(--border))] px-3 pb-3 pt-4">
                    <span class="absolute -top-2 left-3 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-0.5 text-[0.6rem] font-semibold tracking-wide text-[hsl(var(--muted-foreground))]">
                      SUPERSET
                    </span>
                    <div class="flex flex-col gap-3">
                      {#each block.segments as seg}
                        <div>
                          <div class="flex items-baseline gap-2">
                            <p class="text-sm font-medium text-[hsl(var(--foreground))] truncate">{seg.exerciseName}</p>
                            <span class="text-xs text-[hsl(var(--muted-foreground))]">({seg.sets.length})</span>
                          </div>
                          <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{formatExerciseCompact(seg.exerciseName, seg.sets)}</p>
                        </div>
                      {/each}
                    </div>
                  </div>
                {:else}
                  {@const seg = block.segments[0]}
                  <div>
                    <div class="flex items-baseline gap-2">
                      <p class="text-sm font-medium text-[hsl(var(--foreground))] truncate">{seg.exerciseName}</p>
                      <span class="text-xs text-[hsl(var(--muted-foreground))]">({seg.sets.length})</span>
                    </div>
                    <p class="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{formatExerciseCompact(seg.exerciseName, seg.sets)}</p>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}

        </section>

      </div>
    </div>
  {/if}
</div>

{#if shareMenuOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
    <button
      class="absolute inset-0 h-full w-full cursor-default"
      onclick={closeShareMenu}
      aria-label="Close share menu"
    ></button>
    <div
      class="relative z-10 w-full max-w-md lg:max-w-4xl rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Share workout"
    >
      <div class="mb-3 flex items-center justify-between">
        <p class="text-sm font-semibold text-[hsl(var(--foreground))]">Share</p>
        <button
          class="rounded-lg px-2 py-1 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
          onclick={closeShareMenu}
        >
          Close
        </button>
      </div>
      <div class="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
        {#each shareVariants as variant}
          <div class="min-w-full shrink-0 snap-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 lg:min-w-0">
            <div class="mb-2 flex items-center justify-between">
              <p class="text-[0.7rem] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                {shareVariantLabels[variant]}
              </p>
              <button
                class="rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                disabled={shareGenerating}
                onclick={() => shareWorkout(variant)}
              >
                {shareGenerating && shareActiveVariant === variant ? 'Preparing…' : 'Share'}
              </button>
            </div>
            {#if sharePreviewUrls[variant]}
              <img
                src={sharePreviewUrls[variant]}
                alt={`${shareVariantLabels[variant]} share preview`}
                class="mx-auto h-auto w-full max-h-[55vh] max-w-[85vw] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] object-contain lg:max-h-[60vh] lg:max-w-full"
              />
            {:else}
              <div class="flex h-40 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-xs text-[hsl(var(--muted-foreground))]">
                {sharePreviewLoading ? 'Generating preview…' : 'Preview unavailable.'}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<!-- Divider between workout info and sets table (editing mode) -->
{#if editingWorkout}
  <hr class="my-3 border-[hsl(var(--border))]" />
{/if}

{#if editingWorkout && workout}
  <div class="px-4 pb-6">
    <div class="mb-2 flex items-center justify-between gap-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Editing</p>
      <div class="flex items-center gap-2">
        <button
          onclick={cancelEditWorkout}
          class="rounded-lg bg-[hsl(var(--muted))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]"
        >
          Cancel
        </button>
        <button
          onclick={saveWorkoutEdits}
          class="rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-medium text-white"
        >
          Save changes
        </button>
      </div>
    </div>

    <div
      class="-mx-4 border-y border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm min-h-30"
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
