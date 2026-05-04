import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';

// DELETE /api/sets/[id] — soft-delete a set by marking it deleted=1
export const DELETE: RequestHandler = async ({ params, request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database not available');
	const userId = await requireAuth(request, platform);

	const { id } = params;
	if (!id) throw error(400, 'Set ID required');

	// Verify ownership before deleting
	const existing = await db
		.prepare('SELECT user_id FROM sets WHERE id = ?')
		.bind(id)
		.first<{ user_id: string }>();

	if (!existing) throw error(404, 'Set not found');
	if (existing.user_id !== userId) throw error(403, 'Forbidden');

	await db
		.prepare('UPDATE sets SET deleted = 1, updated_at = ? WHERE id = ?')
		.bind(Date.now(), id)
		.run();

	return json({ ok: true });
};
