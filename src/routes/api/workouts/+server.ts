import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import type { WorkoutCategory } from '$lib/types';

interface DbWorkout {
	id: string;
	user_id: string;
	start_time: number;
	end_time: number;
	category_override: WorkoutCategory | null;
	activity_type: string | null;
	notes: string | null;
	location_lat: number | null;
	location_lng: number | null;
	location_label: string | null;
	synced: number;
	created_at: number;
	updated_at: number;
}

function rowToWorkout(row: DbWorkout) {
	return {
		id: row.id,
		userId: row.user_id,
		startTime: row.start_time,
		endTime: row.end_time,
		categoryOverride: row.category_override ?? undefined,
		activityType: row.activity_type ?? undefined,
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
	const categoryOverride = body.categoryOverride ?? null;
	const activityType = typeof body.activityType === 'string' ? body.activityType.trim() : null;

	await db
		.prepare(
			`INSERT INTO workouts (id, user_id, start_time, end_time, category_override, activity_type, notes, location_lat, location_lng, location_label, synced, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         start_time = excluded.start_time,
         end_time = excluded.end_time,
				 category_override = excluded.category_override,
			 activity_type = excluded.activity_type,
         notes = excluded.notes,
         location_lat = excluded.location_lat,
         location_lng = excluded.location_lng,
         location_label = excluded.location_label,
         synced = 1,
         updated_at = excluded.updated_at
       WHERE excluded.updated_at > workouts.updated_at`
		)
		.bind(
			body.id,
			userId,
			body.startTime,
			body.endTime,
			categoryOverride,
			activityType,
			body.notes ?? null,
			location?.lat ?? null,
			location?.lng ?? null,
			location?.label ?? null,
			now,
			now
		)
		.run();

	return json({ ok: true });
};
