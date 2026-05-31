export type WorkoutLocation = { lat: number; lng: number; label?: string };

export function locationGroupKey(location: WorkoutLocation): string {
  return `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;
}

export function formatWorkoutLocation(location?: WorkoutLocation | null): string {
  if (!location) return '';
  if (location.label?.trim()) return location.label.trim();
  return `${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}`;
}
