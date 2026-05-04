import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';

interface DbSet {
	id: string;
	user_id: string;
	local_workout_id: string;
	exercise_id: string;
	exercise_name: string;
	reps: number | null;
	weight: number | null;
	notes: string | null;
	sort_order: number;
	created_at: number;
	updated_at: number;
	deleted: number;
}

function rowToSet(row: DbSet) {
	return {
		id: row.id,
		localWorkoutId: row.local_workout_id,
		exerciseId: row.exercise_id,
		exerciseName: row.exercise_name,
		reps: row.reps,
		weight: row.weight,
		notes: row.notes ?? undefined,
		order: row.sort_order,
		createdAt: row.created_at,
	};
}

// GET /api/sets — fetch all sets for the authenticated user
export const GET: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database not available');
	const userId = await requireAuth(request, platform);

	const result = await db
		.prepare('SELECT * FROM sets WHERE user_id = ? AND deleted = 0 ORDER BY created_at ASC')
		.bind(userId)
		.all<DbSet>();

	return json({ sets: (result.results ?? []).map(rowToSet) });
};

// POST /api/sets — upsert sets for the authenticated user
export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database not available');
	const userId = await requireAuth(request, platform);

	let body: { sets?: unknown[] };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const sets = body.sets;
	if (!Array.isArray(sets)) throw error(400, 'sets must be an array');

	const now = Date.now();
	// "last write wins" by timestamp — the conflict update only fires when the incoming updated_at is
	// strictly greater than the stored value, so equal or older timestamps leave existing data intact.
	const stmt = db.prepare(
		`INSERT INTO sets (id, user_id, local_workout_id, exercise_id, exercise_name, reps, weight, notes, sort_order, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       exercise_id = excluded.exercise_id,
       exercise_name = excluded.exercise_name,
       reps = excluded.reps,
       weight = excluded.weight,
       notes = excluded.notes,
       sort_order = excluded.sort_order,
       updated_at = excluded.updated_at
     WHERE excluded.updated_at > sets.updated_at`
	);

	const batch = sets.map((s: unknown) => {
		const set = s as Record<string, unknown>;
		return stmt.bind(
			set.id,
			userId,
			set.localWorkoutId,
			set.exerciseId ?? '',
			set.exerciseName ?? '',
			set.reps ?? null,
			set.weight ?? null,
			set.notes ?? null,
			set.order ?? 0,
			set.createdAt ?? now,
			now
		);
	});

	if (batch.length > 0) {
		await db.batch(batch);
	}

	return json({ ok: true, count: batch.length });
};
