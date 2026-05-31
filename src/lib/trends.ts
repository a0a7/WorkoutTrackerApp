import type { Workout, WorkoutSet, WorkoutCategory } from './types';
import { classifyWorkouts, getWorkoutCategoryLabel, type DayCategory } from './workoutCategorization';

export type CalendarMode = 'past365' | 'year';
export type TimeScale = '3m' | '6m' | '12m' | '24m' | 'all';
export type ChartFormat = 'bar' | 'scatter' | 'moving-average';
export type AggregateMetric = 'time' | 'sets' | 'reps' | 'volume' | 'weight';

export const DAY_TILE_STYLES: Record<DayCategory, string> = {
  rest: 'bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600',
  cardio: 'bg-sky-600 text-white border-sky-700 dark:bg-sky-500 dark:border-sky-400',
  push: 'bg-red-600 text-white border-red-700 dark:bg-red-500 dark:border-red-400',
  pull: 'bg-blue-600 text-white border-blue-700 dark:bg-blue-500 dark:border-blue-400',
  legs: 'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-500 dark:border-emerald-400',
  'antagonist pull': 'bg-blue-700 text-white border-blue-800 dark:bg-blue-600 dark:border-blue-500',
  'antagonist push': 'bg-red-700 text-white border-red-800 dark:bg-red-600 dark:border-red-500',
  upper: 'bg-violet-700 text-white border-violet-800 dark:bg-violet-600 dark:border-violet-500',
  abs: 'bg-amber-600 text-white border-amber-700 dark:bg-amber-500 dark:border-amber-400',
  back: 'bg-cyan-700 text-white border-cyan-800 dark:bg-cyan-600 dark:border-cyan-500',
  chest: 'bg-rose-700 text-white border-rose-800 dark:bg-rose-600 dark:border-rose-500',
  arms: 'bg-fuchsia-700 text-white border-fuchsia-800 dark:bg-fuchsia-600 dark:border-fuchsia-500',
  shoulders: 'bg-orange-700 text-white border-orange-800 dark:bg-orange-600 dark:border-orange-500',
  'full body': 'bg-amber-600 text-white border-amber-700 dark:bg-amber-500 dark:text-slate-950 dark:border-amber-400',
};

export const DAY_TILE_LABELS: Record<DayCategory, string> = {
  rest: 'Rest',
  cardio: 'Cardio',
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

export interface CalendarCell {
  dateKey: string;
  date: Date;
  category: DayCategory;
  label: string;
  count: number;
  inRange: boolean;
}

export interface CalendarView {
  cells: CalendarCell[];
  years: number[];
  start: Date;
  end: Date;
  subtitle: string;
}

export interface MonthlyBucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
  minutes: number;
  sets: number;
  reps: number;
  volume: number;
}

export interface ExercisePoint {
  date: Date;
  label: string;
  value: number;
  reps: number;
  weight: number;
}

export interface ChartThemePalette {
  background: string;
  panel: string;
  text: string;
  muted: string;
  subtle: string;
  grid: string;
  axis: string;
  label: string;
  legend: string;
}

function normalizeDay(date: Date): Date {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function dayKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addDays(date: Date, days: number): Date {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
}

function addMonths(date: Date, months: number): Date {
  const clone = new Date(date);
  clone.setMonth(clone.getMonth() + months);
  return clone;
}

function startOfMonth(date: Date): Date {
  const clone = new Date(date);
  clone.setDate(1);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function endOfMonth(date: Date): Date {
  const clone = startOfMonth(date);
  clone.setMonth(clone.getMonth() + 1);
  clone.setDate(0);
  clone.setHours(23, 59, 59, 999);
  return clone;
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function getWorkoutExerciseType(workout: Workout): string {
  return workout.activityType?.trim() || (workout.sets.length > 0 ? 'Strength Training' : 'Cardio');
}

export function getAvailableExercises(workouts: Workout[]): string[] {
  const names = new Set<string>();
  for (const workout of workouts) {
    for (const set of workout.sets) {
      if (set.exerciseName.trim()) names.add(set.exerciseName.trim());
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function adjustToSixRepMax(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  const denominator = Math.max(1, 37 - reps);
  return (weight * 31) / denominator;
}

export function computeWorkoutMinutes(workout: Workout): number {
  return Math.max(0, Math.round((workout.endTime - workout.startTime) / 60000));
}

export function computeWorkoutVolume(sets: WorkoutSet[]): number {
  let total = 0;
  for (const set of sets) {
    if (typeof set.weight === 'number' && typeof set.reps === 'number' && set.weight > 0 && set.reps > 0) {
      total += set.weight * set.reps;
    }
  }
  return Math.round(total);
}

export function computeWorkoutReps(sets: WorkoutSet[]): number {
  let total = 0;
  for (const set of sets) {
    if (typeof set.reps === 'number' && set.reps > 0) total += set.reps;
  }
  return total;
}

export function countWorkoutSets(sets: WorkoutSet[]): number {
  return sets.length;
}

export function buildCalendarView(workouts: Workout[], mode: CalendarMode, selectedYear: number): CalendarView {
  const sortedYears = [...new Set(workouts.map((workout) => new Date(workout.startTime).getFullYear()))].sort((a, b) => a - b);
  const year = sortedYears.includes(selectedYear) ? selectedYear : sortedYears.at(-1) ?? new Date().getFullYear();
  const workoutsByDay = new Map<string, Workout[]>();
  for (const workout of workouts) {
    const key = dayKeyFromDate(normalizeDay(new Date(workout.startTime)));
    if (!workoutsByDay.has(key)) workoutsByDay.set(key, []);
    workoutsByDay.get(key)!.push(workout);
  }

  const today = normalizeDay(new Date());
  const rawStart = mode === 'past365'
    ? addDays(today, -364)
    : new Date(year, 0, 1);
  const rawEnd = mode === 'past365'
    ? today
    : new Date(year, 11, 31);
  const start = new Date(rawStart);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(rawEnd);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const cells: CalendarCell[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    const key = dayKeyFromDate(cursor);
    const dayWorkouts = workoutsByDay.get(key) ?? [];
    const category = dayWorkouts.length > 0 ? classifyWorkouts(dayWorkouts) : 'rest';
    cells.push({
      dateKey: key,
      date: new Date(cursor),
      category,
      label: getWorkoutCategoryLabel(category),
      count: dayWorkouts.length,
      inRange: cursor >= rawStart && cursor <= rawEnd,
    });
  }

  return {
    cells,
    years: sortedYears,
    start,
    end,
    subtitle: mode === 'past365' ? 'Past 365 days' : `${year} activity`,
  };
}

export function buildMonthlyBuckets(workouts: Workout[], monthCount: number, endDate = new Date()): MonthlyBucket[] {
  const endMonth = startOfMonth(endDate);
  const months: MonthlyBucket[] = [];
  const startMonth = addMonths(endMonth, -(monthCount - 1));
  for (let index = 0; index < monthCount; index += 1) {
    const monthStart = addMonths(startMonth, index);
    const monthEnd = endOfMonth(monthStart);
    months.push({
      key: monthKeyFromDate(monthStart),
      label: formatMonthLabel(monthStart),
      start: monthStart,
      end: monthEnd,
      minutes: 0,
      sets: 0,
      reps: 0,
      volume: 0,
    });
  }

  const monthMap = new Map(months.map((month) => [month.key, month] as const));
  for (const workout of workouts) {
    const key = monthKeyFromDate(new Date(workout.startTime));
    const bucket = monthMap.get(key);
    if (!bucket) continue;
    bucket.minutes += computeWorkoutMinutes(workout);
    bucket.sets += countWorkoutSets(workout.sets);
    bucket.reps += computeWorkoutReps(workout.sets);
    bucket.volume += computeWorkoutVolume(workout.sets);
  }

  return months;
}

export function buildExercisePoints(workouts: Workout[], exerciseName: string, timeScale: TimeScale, endDate = new Date()): ExercisePoint[] {
  const startDate = getTimeScaleStartDate(timeScale, endDate);
  const points: ExercisePoint[] = [];
  for (const workout of workouts) {
    if (workout.startTime < startDate.getTime()) continue;
    for (const set of workout.sets) {
      if (set.exerciseName.trim().toLowerCase() !== exerciseName.trim().toLowerCase()) continue;
      if (typeof set.weight !== 'number' || typeof set.reps !== 'number') continue;
      points.push({
        date: new Date(workout.startTime),
        label: new Date(workout.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        value: adjustToSixRepMax(set.weight, set.reps),
        reps: set.reps,
        weight: set.weight,
      });
    }
  }
  return points.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function buildExerciseMonthlyBuckets(workouts: Workout[], exerciseName: string, monthCount: number, endDate = new Date()): MonthlyBucket[] {
  const months = buildMonthlyBuckets(workouts, monthCount, endDate);
  for (const workout of workouts) {
    const bucket = months.find((month) => month.key === monthKeyFromDate(new Date(workout.startTime)));
    if (!bucket) continue;
    for (const set of workout.sets) {
      if (set.exerciseName.trim().toLowerCase() !== exerciseName.trim().toLowerCase()) continue;
      if (typeof set.weight !== 'number' || typeof set.reps !== 'number' || set.weight <= 0 || set.reps <= 0) continue;
      bucket.volume += 0;
      bucket.sets += 0;
    }
  }

  const exerciseMonthMap = new Map<string, { total: number; count: number }>();
  for (const workout of workouts) {
    const monthKey = monthKeyFromDate(new Date(workout.startTime));
    for (const set of workout.sets) {
      if (set.exerciseName.trim().toLowerCase() !== exerciseName.trim().toLowerCase()) continue;
      if (typeof set.weight !== 'number' || typeof set.reps !== 'number' || set.weight <= 0 || set.reps <= 0) continue;
      const entry = exerciseMonthMap.get(monthKey) ?? { total: 0, count: 0 };
      entry.total += adjustToSixRepMax(set.weight, set.reps);
      entry.count += 1;
      exerciseMonthMap.set(monthKey, entry);
    }
  }

  for (const month of months) {
    const entry = exerciseMonthMap.get(month.key);
    month.volume = 0;
    month.minutes = 0;
    month.reps = 0;
    month.sets = 0;
    if (entry) {
      month.volume = entry.total / Math.max(1, entry.count);
      month.sets = entry.count;
    }
  }

  return months;
}

export function getTimeScaleStartDate(scale: TimeScale, endDate = new Date()): Date {
  if (scale === 'all') return new Date(0);
  const monthCount = Number(scale.replace('m', ''));
  return addMonths(startOfMonth(endDate), -(monthCount - 1));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function getChartThemePalette(isDark: boolean): ChartThemePalette {
  return isDark
    ? {
        background: '#0f172a',
        panel: '#111827',
        text: '#f8fafc',
        muted: '#e2e8f0',
        subtle: '#cbd5e1',
        grid: '#334155',
        axis: '#475569',
        label: '#e2e8f0',
        legend: '#e2e8f0',
      }
    : {
        background: '#f8fafc',
        panel: '#ffffff',
        text: '#020617',
        muted: '#020617',
        subtle: '#0f172a',
        grid: '#cbd5e1',
        axis: '#94a3b8',
        label: '#020617',
        legend: '#0f172a',
      };
}

function svgHeader(width: number, height: number, title: string, subtitle: string, palette: ChartThemePalette, includeBackground = true): string {
  const hasSubtitle = subtitle.trim().length > 0;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(title)}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block;">
  <style>
    .bg { fill: ${palette.background}; }
    .panel { fill: ${palette.panel}; }
    .title { fill: ${palette.text}; stroke: none; paint-order: fill; font: 700 20px ui-sans-serif, system-ui, sans-serif; text-rendering: geometricPrecision; }
    .subtitle { fill: ${palette.muted}; stroke: none; paint-order: fill; font: 600 12px ui-sans-serif, system-ui, sans-serif; text-rendering: geometricPrecision; }
    .label { fill: ${palette.label}; stroke: none; paint-order: fill; font: 500 11px ui-sans-serif, system-ui, sans-serif; text-rendering: geometricPrecision; }
    .small { fill: ${palette.subtle}; stroke: none; paint-order: fill; font: 500 10px ui-sans-serif, system-ui, sans-serif; text-rendering: geometricPrecision; }
    .legend { fill: ${palette.legend}; stroke: none; paint-order: fill; font: 600 11px ui-sans-serif, system-ui, sans-serif; text-rendering: geometricPrecision; }
    .grid { stroke: ${palette.grid}; stroke-width: 1; }
    .axis { stroke: ${palette.axis}; stroke-width: 1; }
  </style>
${includeBackground ? `  <rect class="bg" x="0" y="0" width="${width}" height="${height}" rx="24" />
` : ''}
  <text class="title" x="24" y="32">${escapeXml(title)}</text>
${hasSubtitle ? `  <text class="subtitle" x="24" y="50">${escapeXml(subtitle)}</text>
` : ''}
`;
}

function svgFooter(): string {
  return '</svg>';
}

function formatChartValue(value: number, metric: AggregateMetric, unitLabel = ''): string {
  if (metric === 'time') return `${Math.round(value)}m`;
  if (metric === 'weight') return `${Math.round(value).toLocaleString('en-US')}${unitLabel ? ` ${unitLabel}` : ''}`;
  if (metric === 'volume') return `${Math.round(value).toLocaleString('en-US')}`;
  return `${Math.round(value).toLocaleString('en-US')}`;
}

export function renderSeriesChartSvg(options: {
  title: string;
  subtitle: string;
  labels: string[];
  values: number[];
  metric: AggregateMetric;
  format: ChartFormat;
  legend: string;
  accent?: string;
  unitLabel?: string;
  theme?: ChartThemePalette;
  includeBackground?: boolean;
  compact?: boolean;
}): string {
  const compact = options.compact ?? false;
  const width = compact ? 820 : 860;
  const height = compact ? 320 : 360;
  const left = compact ? 36 : 52;
  const right = compact ? 12 : 24;
  const top = compact ? 48 : 72;
  const bottom = compact ? 36 : 56;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maxValue = Math.max(1, ...options.values);
  const points = options.values.length;
  const accent = options.accent ?? '#38bdf8';
  const palette = options.theme ?? getChartThemePalette(true);
  let svg = svgHeader(width, height, options.title, options.subtitle, palette, options.includeBackground ?? true);
  if (options.legend.trim()) {
    svg += `
  <text class="legend" x="24" y="68">${escapeXml(options.legend)}</text>
`;
  }
  for (let i = 0; i <= 4; i += 1) {
    const tickValue = (maxValue * i) / 4;
    const y = top + chartHeight - (chartHeight * i) / 4;
    svg += `
  <line class="grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" opacity="0.5" />
  <text class="small" x="${left - 8}" y="${y + 4}" text-anchor="end">${escapeXml(formatChartValue(tickValue, options.metric, options.unitLabel))}</text>
`;
  }
  svg += `<line class="axis" x1="${left}" y1="${top + chartHeight}" x2="${width - right}" y2="${top + chartHeight}" />`;

  const bucketWidth = points > 0 ? chartWidth / points : chartWidth;
  const barWidth = Math.max(8, bucketWidth * 0.62);
  const linePath: string[] = [];
  const smoothValues = options.format === 'moving-average'
    ? options.values.map((value, index) => {
        const window = options.values.slice(Math.max(0, index - 1), Math.min(options.values.length, index + 2));
        return window.reduce((sum, current) => sum + current, 0) / Math.max(1, window.length);
      })
    : options.values;

  for (let i = 0; i < points; i += 1) {
    const value = options.values[i];
    const x = left + bucketWidth * i + bucketWidth / 2;
    const barHeight = (value / maxValue) * chartHeight;
    const y = top + chartHeight - barHeight;
    const label = options.labels[i] ?? '';

    if (options.format === 'bar') {
      svg += `
  <rect x="${x - barWidth / 2}" y="${y}" width="${barWidth}" height="${barHeight}" rx="6" fill="${accent}" opacity="0.92" />
  <text class="small" x="${x}" y="${Math.max(top + 12, y - 6)}" text-anchor="middle">${escapeXml(formatChartValue(value, options.metric, options.unitLabel))}</text>
`;
    } else {
      const pointY = top + chartHeight - barHeight;
      if (options.format === 'moving-average') {
        linePath.push(`${i === 0 ? 'M' : 'L'} ${x} ${top + chartHeight - (smoothValues[i] / maxValue) * chartHeight}`);
      }
      svg += `
  <circle cx="${x}" cy="${pointY}" r="4.5" fill="${accent}" />
  <text class="small" x="${x}" y="${Math.max(top + 12, pointY - 8)}" text-anchor="middle">${escapeXml(formatChartValue(value, options.metric))}</text>
`;
    }

    const showLabel = points <= 8 || i % Math.max(1, Math.ceil(points / 8)) === 0 || i === points - 1;
    if (showLabel) {
      svg += `<text class="small" x="${x}" y="${height - 18}" text-anchor="middle">${escapeXml(label)}</text>`;
    }
  }

  if (options.format === 'moving-average' && linePath.length > 0) {
    svg += `
  <path d="${linePath.join(' ')}" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" />
`;
  }

  svg += `
  <text class="small" x="${left}" y="${height - 6}">${escapeXml(options.metric === 'time' ? 'Minutes' : options.metric === 'weight' ? `Weight${options.unitLabel ? ` (${options.unitLabel})` : ''}` : options.metric === 'volume' ? 'Volume' : options.metric.toUpperCase())}</text>
`;
  svg += svgFooter();
  return svg;
}

export function renderCalendarSvg(options: {
  title: string;
  subtitle: string;
  cells: CalendarCell[];
  theme?: ChartThemePalette;
  includeBackground?: boolean;
  compact?: boolean;
}): string {
  const compact = options.compact ?? false;
  const cellSize = compact ? 12 : 13;
  const gap = compact ? 2 : 3;
  const left = compact ? 44 : 64;
  const top = compact ? 50 : 72;
  const bottom = compact ? 34 : 52;
  const weekWidth = cellSize + gap;
  const grid = options.cells;
  const weeks = Math.max(1, Math.ceil(grid.length / 7));
  const width = left + weeks * weekWidth + (compact ? 12 : 24);
  const height = top + 7 * weekWidth + bottom;
  const palette = options.theme ?? getChartThemePalette(true);
  let svg = svgHeader(width, height, options.title, options.subtitle, palette, options.includeBackground ?? true);
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  weekdayLabels.forEach((label, index) => {
    if (index % 2 === 0) {
      svg += `<text class="small" x="${left - 6}" y="${top + index * weekWidth + (compact ? 7 : 10)}" text-anchor="end">${label}</text>`;
    }
  });

  const monthLabels = new Map<string, number>();
  for (let i = 0; i < grid.length; i += 1) {
    const cell = grid[i];
    const monthKey = `${cell.date.getFullYear()}-${cell.date.getMonth()}`;
    if (!monthLabels.has(monthKey) && cell.date.getDate() <= 7) {
      monthLabels.set(monthKey, left + Math.floor(i / 7) * weekWidth);
    }
  }
  for (const [monthKey, x] of monthLabels) {
    const [year, month] = monthKey.split('-').map(Number);
    const label = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short' });
    svg += `<text class="small" x="${x}" y="${compact ? 46 : 64}">${escapeXml(label)}</text>`;
  }

  for (let index = 0; index < grid.length; index += 1) {
    const cell = grid[index];
    const week = Math.floor(index / 7);
    const day = index % 7;
    const x = left + week * weekWidth;
    const y = top + day * weekWidth;
    const fill = calendarColor(cell.category, cell.inRange, cell.count, palette);
    svg += `
  <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="4" fill="${fill}" />
`;
  }

  const legendEntries: Array<{ label: string; color: string }> = [
    { label: 'Rest', color: palette.background === '#f8fafc' ? '#e2e8f0' : '#334155' },
    { label: 'Cardio', color: '#0284c7' },
    { label: 'Push', color: '#dc2626' },
    { label: 'Pull', color: '#2563eb' },
    { label: 'Legs', color: '#16a34a' },
    { label: 'Upper', color: '#7c3aed' },
    { label: 'Full body', color: '#d97706' },
  ];
  const legendY = height - (compact ? 10 : 20);
  let legendX = 24;
  for (const entry of legendEntries) {
    svg += `
  <rect x="${legendX}" y="${legendY - 9}" width="10" height="10" rx="3" fill="${entry.color}" />
  <text class="small" x="${legendX + 14}" y="${legendY}">${escapeXml(entry.label)}</text>
`;
    legendX += 72;
  }

  svg += svgFooter();
  return svg;
}

function calendarColor(category: DayCategory, inRange: boolean, count: number, palette: ChartThemePalette): string {
  const isLightMode = palette.background === '#f8fafc';
  if (!inRange) return isLightMode ? '#cbd5e1' : '#1f2937';
  if (count <= 0) return isLightMode ? '#e2e8f0' : '#334155';
  switch (category) {
    case 'cardio': return '#0284c7';
    case 'push': return '#dc2626';
    case 'pull': return '#2563eb';
    case 'legs': return '#16a34a';
    case 'upper': return '#7c3aed';
    case 'abs': return '#d97706';
    case 'back': return '#0e7490';
    case 'chest': return '#be123c';
    case 'arms': return '#c026d3';
    case 'shoulders': return '#ea580c';
    case 'antagonist pull': return '#1d4ed8';
    case 'antagonist push': return '#b91c1c';
    case 'full body': return '#d97706';
    case 'rest':
    default:
      return isLightMode ? '#e2e8f0' : '#475569';
  }
}

export function yearOptionsFromWorkouts(workouts: Workout[]): number[] {
  return [...new Set(workouts.map((workout) => new Date(workout.startTime).getFullYear()))].sort((a, b) => a - b);
}
