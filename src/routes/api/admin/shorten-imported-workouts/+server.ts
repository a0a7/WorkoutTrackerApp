import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';

const WORKOUT_REPAIR_SECRET = 'workout-repair-2026';

export const GET: RequestHandler = async ({ url, request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database not available');

	const userId = await requireAuth(request, platform);

	const secret = url.searchParams.get('secret');
	if (secret !== WORKOUT_REPAIR_SECRET) throw error(403, 'Forbidden');

	const overHours = Number(url.searchParams.get('overHours'));
	const toHours = Number(url.searchParams.get('toHours'));
	if (!Number.isFinite(overHours) || !Number.isFinite(toHours) || overHours <= 0 || toHours <= 0) {
		throw error(400, 'Valid overHours and toHours query parameters are required');
	}
	if (toHours > overHours) {
		throw error(400, 'toHours must be less than or equal to overHours');
	}

	const thresholdMs = Math.round(overHours * 60 * 60 * 1000);
	const replacementMs = Math.round(toHours * 60 * 60 * 1000);
	const now = Date.now();

	const result = await db
		.prepare(
			`UPDATE workouts
			 SET end_time = start_time + ?,
			     updated_at = ?,
			     synced = 0
			 WHERE user_id = ?
			   AND (end_time - start_time) > ?`
		)
		.bind(replacementMs, now, userId, thresholdMs)
		.run();

	return json({
		ok: true,
		changed: result.meta.changes ?? 0,
		overHours,
		toHours,
	});
};