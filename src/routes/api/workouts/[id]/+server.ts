import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';

// DELETE /api/workouts/[id] — delete workout and soft-delete its sets
export const DELETE: RequestHandler = async ({ params, request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database not available');
	const userId = await requireAuth(request, platform);

	const { id } = params;
	if (!id) throw error(400, 'Workout ID required');

	const existing = await db
		.prepare('SELECT user_id FROM workouts WHERE id = ?')
		.bind(id)
		.first<{ user_id: string }>();

	if (!existing) throw error(404, 'Workout not found');
	if (existing.user_id !== userId) throw error(403, 'Forbidden');

	const now = Date.now();
	await db.batch([
		db.prepare('UPDATE sets SET deleted = 1, updated_at = ? WHERE user_id = ? AND local_workout_id = ?').bind(now, userId, id),
		db.prepare('DELETE FROM workouts WHERE id = ? AND user_id = ?').bind(id, userId),
	]);

	return json({ ok: true });
};
