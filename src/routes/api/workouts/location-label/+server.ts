import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';

export const PATCH: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  if (!db) throw error(503, 'Database not available');
  const userId = await requireAuth(request, platform);

  let body: { lat?: number; lng?: number; label?: string | null };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const lat = body.lat;
  const lng = body.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') throw error(400, 'Location coordinates required');

  const label = typeof body.label === 'string' ? body.label.trim() : null;
  const roundedLat = Number(lat.toFixed(3));
  const roundedLng = Number(lng.toFixed(3));
  const now = Date.now();

  await db
    .prepare(
      `UPDATE workouts
       SET location_label = ?, updated_at = ?
       WHERE user_id = ?
         AND location_lat IS NOT NULL
         AND location_lng IS NOT NULL
         AND ABS(location_lat - ?) < 0.0005
         AND ABS(location_lng - ?) < 0.0005`
    )
    .bind(label || null, now, userId, roundedLat, roundedLng)
    .run();

  return json({ ok: true });
};
