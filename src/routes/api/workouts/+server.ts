import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';

interface DbWorkout {
	id: string;
	user_id: string;
	start_time: number;
	end_time: number;
	notes: string | null;
	location_lat: number | null;
	location_lng: number | null;
	location_label: string | null;
	synced: number;
	created_at: number;
}

function rowToWorkout(row: DbWorkout) {
	return {
		id: row.id,
		userId: row.user_id,
		startTime: row.start_time,
		endTime: row.end_time,
		notes: row.notes ?? undefined,
		location:
			row.location_lat != null && row.location_lng != null
				? { lat: row.location_lat, lng: row.location_lng, label: row.location_label ?? undefined }
				: undefined,
		synced: Boolean(row.synced),
		sets: [],
	};
}

// GET /api/workouts — fetch all workouts for the authenticated user
export const GET: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database not available');
	const userId = await requireAuth(request, platform);

	const result = await db
		.prepare('SELECT * FROM workouts WHERE user_id = ? ORDER BY start_time DESC')
		.bind(userId)
		.all<DbWorkout>();

	return json({ workouts: (result.results ?? []).map(rowToWorkout) });
};

// POST /api/workouts — upsert a workout for the authenticated user
export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database not available');
	const userId = await requireAuth(request, platform);

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const now = Date.now();
	const location = body.location as { lat?: number; lng?: number; label?: string } | undefined;

	await db
		.prepare(
			`INSERT INTO workouts (id, user_id, start_time, end_time, notes, location_lat, location_lng, location_label, synced, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         notes = excluded.notes,
         location_lat = excluded.location_lat,
         location_lng = excluded.location_lng,
         location_label = excluded.location_label,
         synced = 1`
		)
		.bind(
			body.id,
			userId,
			body.startTime,
			body.endTime,
			body.notes ?? null,
			location?.lat ?? null,
			location?.lng ?? null,
			location?.label ?? null,
			now
		)
		.run();

	return json({ ok: true });
};
