import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { disconnectStrava, isStravaConnected } from '$lib/server/strava';

export const GET: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database not available');
	const userId = await requireAuth(request, platform);
	const connected = await isStravaConnected(db, userId);
	return json({ connected });
};

export const DELETE: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database not available');
	const userId = await requireAuth(request, platform);
	await disconnectStrava(db, userId);
	return json({ connected: false });
};
