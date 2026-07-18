import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';

function toTimestamp(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw error(400, `Invalid ${label}`);
}

function parseOffsetMinutes(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  return 0;
}

export const PATCH: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  if (!db) throw error(503, 'Database not available');
  const userId = await requireAuth(request, platform);

  let body: {
    from?: number | string;
    to?: number | string;
    lat?: number;
    lng?: number;
    label?: string | null;
    timezoneOffsetMinutes?: number;
  };

  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  if (typeof body.lat !== 'number' || !Number.isFinite(body.lat)) throw error(400, 'Invalid lat');
  if (typeof body.lng !== 'number' || !Number.isFinite(body.lng)) throw error(400, 'Invalid lng');

  const fromTs = toTimestamp(body.from, 'from');
  const toTs = toTimestamp(body.to, 'to');
  if (toTs < fromTs) throw error(400, 'to must be greater than or equal to from');

  const offsetMinutes = parseOffsetMinutes(body.timezoneOffsetMinutes);
  const offsetMs = offsetMinutes * 60_000;
  const adjustedFrom = fromTs + offsetMs;
  const adjustedTo = toTs + offsetMs;

  const now = Date.now();
  const label = typeof body.label === 'string' ? body.label.trim() : null;

  const result = await db
    .prepare(
      `UPDATE workouts
       SET location_lat = ?,
           location_lng = ?,
           location_label = ?,
           updated_at = ?,
           synced = 0
       WHERE user_id = ?
          AND start_time >= ?
          AND start_time <= ?`
    )
        .bind(body.lat, body.lng, label || null, now, userId, adjustedFrom, adjustedTo)
    .run();

  return json({
    ok: true,
    updated: result.meta.changes ?? 0,
    from: adjustedFrom,
    to: adjustedTo,
    lat: body.lat,
    lng: body.lng,
    label: label || null,
    timezoneOffsetMinutes: offsetMinutes,
  });
};
