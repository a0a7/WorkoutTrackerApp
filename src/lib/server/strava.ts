import { error } from '@sveltejs/kit';

type StravaTokenRow = {
	user_id: string;
	athlete_id: number | null;
	access_token: string;
	refresh_token: string;
	expires_at: number;
};

type WorkoutRow = {
	id: string;
	start_time: number;
	end_time: number;
	updated_at: number;
};

type SetRow = {
	exercise_name: string;
	reps: number | null;
	weight: number | null;
	sort_order: number;
	created_at: number;
	updated_at: number;
};

type SyncMapRow = {
	strava_activity_id: number;
	source_updated_at: number;
};

type StravaConfig = {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
};

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const WORKOUT_GAP_MS = 90 * 60 * 1000;
const STRAVA_CALLBACK_PATH = '/api/strava/callback';

function normalizeRedirectUri(value: string): string {
	try {
		const url = new URL(value);
		if (url.pathname === '/' || url.pathname === '') {
			url.pathname = STRAVA_CALLBACK_PATH;
		} else if (!url.pathname.endsWith(STRAVA_CALLBACK_PATH)) {
			url.pathname = `${url.pathname.replace(/\/$/, '')}${STRAVA_CALLBACK_PATH}`;
		}
		return url.toString();
	} catch {
		return value;
	}
}

function requiredStravaConfig(platform: App.Platform | undefined): StravaConfig {
	const env = platform?.env;
	if (!env) throw error(503, 'Platform bindings unavailable');
	const clientId = env.STRAVA_CLIENT_ID;
	const clientSecret = env.STRAVA_CLIENT_SECRET;
	const redirectUri = env.STRAVA_REDIRECT_URI;
	if (!clientId || !clientSecret || !redirectUri) {
		throw error(503, 'Strava integration is not configured');
	}
	return { clientId, clientSecret, redirectUri: normalizeRedirectUri(redirectUri) };
}

async function getStoredToken(db: D1Database, userId: string): Promise<StravaTokenRow | null> {
	return (
		(await db
			.prepare(
				'SELECT user_id, athlete_id, access_token, refresh_token, expires_at FROM user_strava_tokens WHERE user_id = ?'
			)
			.bind(userId)
			.first<StravaTokenRow>()) ?? null
	);
}

async function saveToken(
	db: D1Database,
	userId: string,
	token: { access_token: string; refresh_token: string; expires_at: number; athlete_id?: number | null }
): Promise<void> {
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO user_strava_tokens (user_id, athlete_id, access_token, refresh_token, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         athlete_id = excluded.athlete_id,
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`
		)
		.bind(
			userId,
			token.athlete_id ?? null,
			token.access_token,
			token.refresh_token,
			token.expires_at * 1000,
			now,
			now
		)
		.run();
}

async function refreshAccessToken(
	config: StravaConfig,
	refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_at: number; athlete_id?: number | null }> {
	const body = new URLSearchParams({
		client_id: config.clientId,
		client_secret: config.clientSecret,
		grant_type: 'refresh_token',
		refresh_token: refreshToken
	});
	const res = await fetch(STRAVA_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body
	});
	if (!res.ok) throw error(502, `Strava token refresh failed (${res.status})`);
	const json = (await res.json()) as {
		access_token: string;
		refresh_token: string;
		expires_at: number;
		athlete?: { id?: number };
	};
	return {
		access_token: json.access_token,
		refresh_token: json.refresh_token,
		expires_at: json.expires_at,
		athlete_id: json.athlete?.id ?? null
	};
}

export async function getValidAccessToken(
	db: D1Database,
	platform: App.Platform | undefined,
	userId: string
): Promise<string> {
	const config = requiredStravaConfig(platform);
	const stored = await getStoredToken(db, userId);
	if (!stored) throw error(400, 'Strava account not connected');
	if (stored.expires_at - 60_000 > Date.now()) return stored.access_token;
	const refreshed = await refreshAccessToken(config, stored.refresh_token);
	await saveToken(db, userId, refreshed);
	return refreshed.access_token;
}

async function sha256Hex(input: string): Promise<string> {
	const bytes = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function base64UrlEncode(input: string): string {
	return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
	const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
	return atob(padded);
}

export async function buildStravaAuthUrl(
	platform: App.Platform | undefined,
	userId: string
): Promise<string> {
	const config = requiredStravaConfig(platform);
	const ts = Date.now();
	const nonce = crypto.randomUUID();
	const payload = `${userId}.${ts}.${nonce}`;
	const sig = (await sha256Hex(`${payload}.${config.clientSecret}`)).slice(0, 32);
	const state = base64UrlEncode(`${payload}.${sig}`);
	const params = new URLSearchParams({
		client_id: config.clientId,
		redirect_uri: config.redirectUri,
		response_type: 'code',
		approval_prompt: 'auto',
		scope: 'activity:write',
		state
	});
	return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export async function verifyStravaStateAndGetUserId(
	platform: App.Platform | undefined,
	state: string
): Promise<string> {
	const config = requiredStravaConfig(platform);
	let decoded = '';
	try {
		decoded = base64UrlDecode(state);
	} catch {
		throw error(400, 'Invalid Strava state');
	}
	const parts = decoded.split('.');
	if (parts.length !== 4) throw error(400, 'Invalid Strava state');
	const [userId, tsRaw, nonce, sig] = parts;
	if (!userId || !tsRaw || !nonce || !sig) throw error(400, 'Invalid Strava state');
	const ts = Number(tsRaw);
	if (!Number.isFinite(ts)) throw error(400, 'Invalid Strava state');
	if (Date.now() - ts > 10 * 60_000) throw error(400, 'Expired Strava state');
	const expected = (await sha256Hex(`${userId}.${ts}.${nonce}.${config.clientSecret}`)).slice(0, 32);
	if (expected !== sig) throw error(400, 'Invalid Strava state');
	return userId;
}

export async function exchangeCodeAndStoreToken(
	db: D1Database,
	platform: App.Platform | undefined,
	userId: string,
	code: string
): Promise<void> {
	const config = requiredStravaConfig(platform);
	const body = new URLSearchParams({
		client_id: config.clientId,
		client_secret: config.clientSecret,
		code,
		grant_type: 'authorization_code'
	});
	const res = await fetch(STRAVA_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body
	});
	if (!res.ok) throw error(502, `Strava auth exchange failed (${res.status})`);
	const json = (await res.json()) as {
		access_token: string;
		refresh_token: string;
		expires_at: number;
		athlete?: { id?: number };
	};
	await saveToken(db, userId, {
		access_token: json.access_token,
		refresh_token: json.refresh_token,
		expires_at: json.expires_at,
		athlete_id: json.athlete?.id ?? null
	});
}

export async function isStravaConnected(db: D1Database, userId: string): Promise<boolean> {
	const row = await getStoredToken(db, userId);
	return Boolean(row);
}

function dayPeriodTitlePart(startTime: number): string {
	const h = new Date(startTime).getHours();
	if (h < 12) return 'Morning';
	if (h < 17) return 'Afternoon';
	if (h < 21) return 'Evening';
	return 'Night';
}

function formatSetPart(set: SetRow): string {
	const reps = set.reps;
	const weight = set.weight;
	if (reps != null && weight != null) return `${reps}x${weight}`;
	if (reps != null) return `${reps} reps`;
	if (weight != null) return `${weight}`;
	return '';
}

function buildWorkoutSummary(workout: WorkoutRow, sets: SetRow[]): { name: string; description: string } {
	const grouped = new Map<string, SetRow[]>();
	for (const s of sets) {
		const list = grouped.get(s.exercise_name) ?? [];
		list.push(s);
		grouped.set(s.exercise_name, list);
	}
	const lines: string[] = [];
	for (const [exercise, exSets] of grouped.entries()) {
		const ordered = [...exSets].sort((a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at);
		const allSame =
			ordered.length > 0 &&
			ordered.every((s) => s.reps === ordered[0].reps && s.weight === ordered[0].weight) &&
			ordered[0].reps != null &&
			ordered[0].weight != null;
		const detail = allSame
			? `${ordered.length}x${ordered[0].reps}x${ordered[0].weight}`
			: ordered.map(formatSetPart).filter(Boolean).join(', ');
		lines.push(`${exercise}: ${detail}`);
	}
	const title = `${dayPeriodTitlePart(workout.start_time)} Weightlifting - ${sets.length} Sets`;
	const description = `${lines.join('\n')}\n\nUnits: lbs · Automatically synced from Logbook`;
	return { name: title, description };
}

async function stravaCreateActivity(
	accessToken: string,
	input: { name: string; description: string; startTime: number; elapsedSec: number }
): Promise<number> {
	const body = new URLSearchParams({
		name: input.name,
		type: 'WeightTraining',
		sport_type: 'WeightTraining',
		start_date_local: new Date(input.startTime).toISOString(),
		elapsed_time: String(Math.max(1, input.elapsedSec)),
		description: input.description,
		trainer: '1'
	});
	const res = await fetch(`${STRAVA_API_BASE}/activities`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body
	});
	if (!res.ok) throw error(502, `Strava create failed (${res.status})`);
	const json = (await res.json()) as { id: number };
	return json.id;
}

async function stravaUpdateActivity(
	accessToken: string,
	activityId: number,
	input: { name: string; description: string; type: string }
): Promise<void> {
	const body = new URLSearchParams({
		name: input.name,
		description: input.description,
		type: input.type
	});
	const res = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body
	});
	if (!res.ok) throw error(502, `Strava update failed (${res.status})`);
}

async function getWorkoutAndSets(
	db: D1Database,
	userId: string,
	workoutId: string
): Promise<{ workout: WorkoutRow; sets: SetRow[]; sourceUpdatedAt: number } | null> {
	const workout = await db
		.prepare('SELECT id, start_time, end_time, updated_at FROM workouts WHERE id = ? AND user_id = ?')
		.bind(workoutId, userId)
		.first<WorkoutRow>();
	if (!workout) return null;
	const setRows = await db
		.prepare(
			`SELECT exercise_name, reps, weight, sort_order, created_at, updated_at
       FROM sets
       WHERE user_id = ? AND local_workout_id = ? AND deleted = 0
       ORDER BY created_at ASC, sort_order ASC`
		)
		.bind(userId, workoutId)
		.all<SetRow>();
	const sets = setRows.results ?? [];
	if (sets.length === 0) return null;
	const latestSetUpdated = sets.reduce((max, s) => Math.max(max, s.updated_at), 0);
	return {
		workout,
		sets,
		sourceUpdatedAt: Math.max(workout.updated_at, latestSetUpdated)
	};
}

async function getSyncMap(db: D1Database, workoutId: string, userId: string): Promise<SyncMapRow | null> {
	return (
		(await db
			.prepare(
				'SELECT strava_activity_id, source_updated_at FROM workout_strava_sync WHERE workout_id = ? AND user_id = ?'
			)
			.bind(workoutId, userId)
			.first<SyncMapRow>()) ?? null
	);
}

async function saveSyncMap(
	db: D1Database,
	userId: string,
	workoutId: string,
	activityId: number,
	sourceUpdatedAt: number
): Promise<void> {
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO workout_strava_sync (workout_id, user_id, strava_activity_id, source_updated_at, last_synced_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workout_id) DO UPDATE SET
         user_id = excluded.user_id,
         strava_activity_id = excluded.strava_activity_id,
         source_updated_at = excluded.source_updated_at,
         last_synced_at = excluded.last_synced_at,
         updated_at = excluded.updated_at`
		)
		.bind(workoutId, userId, activityId, sourceUpdatedAt, now, now, now)
		.run();
}

export async function syncWorkoutToStrava(
	db: D1Database,
	platform: App.Platform | undefined,
	userId: string,
	workoutId: string
): Promise<{ pushed: boolean; activityId?: number }> {
	const result = await getWorkoutAndSets(db, userId, workoutId);
	if (!result) return { pushed: false };
	const accessToken = await getValidAccessToken(db, platform, userId);
	const { workout, sets, sourceUpdatedAt } = result;
	const summary = buildWorkoutSummary(workout, sets);
	const elapsedSec = Math.max(1, Math.round((workout.end_time - workout.start_time) / 1000));
	const existing = await getSyncMap(db, workoutId, userId);
	let activityId: number;
	if (!existing) {
		activityId = await stravaCreateActivity(accessToken, {
			name: summary.name,
			description: summary.description,
			startTime: workout.start_time,
			elapsedSec
		});
	} else {
		activityId = existing.strava_activity_id;
		await stravaUpdateActivity(accessToken, activityId, {
			name: summary.name,
			description: summary.description,
			type: 'WeightTraining'
		});
	}
	await saveSyncMap(db, userId, workoutId, activityId, sourceUpdatedAt);
	return { pushed: true, activityId };
}

export async function syncDueWorkoutsToStrava(
	db: D1Database,
	platform: App.Platform | undefined,
	userId: string
): Promise<number> {
	if (!(await isStravaConnected(db, userId))) return 0;
	const now = Date.now();
	const due = await db
		.prepare(
			`SELECT w.id
       FROM workouts w
       LEFT JOIN (
         SELECT local_workout_id, MAX(updated_at) AS max_set_updated_at
         FROM sets
         WHERE user_id = ? AND deleted = 0
         GROUP BY local_workout_id
       ) su ON su.local_workout_id = w.id
       LEFT JOIN workout_strava_sync ws ON ws.workout_id = w.id AND ws.user_id = w.user_id
       WHERE w.user_id = ?
         AND (? - w.end_time) >= ?
         AND COALESCE(su.max_set_updated_at, w.updated_at) >= 0
         AND (
           ws.workout_id IS NULL OR
           MAX(w.updated_at, COALESCE(su.max_set_updated_at, 0)) > ws.source_updated_at
         )
       ORDER BY w.end_time DESC
       LIMIT 25`
		)
		.bind(userId, userId, now, WORKOUT_GAP_MS)
		.all<{ id: string }>();
	let synced = 0;
	for (const row of due.results ?? []) {
		try {
			const result = await syncWorkoutToStrava(db, platform, userId, row.id);
			if (result.pushed) synced += 1;
		} catch {
			// continue syncing other due workouts
		}
	}
	return synced;
}
