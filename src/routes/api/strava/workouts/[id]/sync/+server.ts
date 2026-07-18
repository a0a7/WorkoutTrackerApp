import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { syncWorkoutToStrava } from '$lib/server/strava';

export const POST: RequestHandler = async ({ params, request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database not available');
	const userId = await requireAuth(request, platform);
	const id = params.id;
	if (!id) throw error(400, 'Workout ID required');
	const result = await syncWorkoutToStrava(db, platform, userId, id);
	return json(result);
};
