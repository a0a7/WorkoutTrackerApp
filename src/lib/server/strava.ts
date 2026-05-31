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
	notes: string | null;
	location_lat: number | null;
	location_lng: number | null;
	location_label: string | null;
};

type SetRow = {
	exercise_name: string;
	reps: number | null;
	weight: number | null;
	weight_unit: string | null;
	sort_order: number;
	created_at: number;
	updated_at: number;
};

type SyncMapRow = {
	strava_activity_id: string;
	upload_id: string | null;
	source_updated_at: number;
};

type StravaActivityRow = {
	id: number;
	name: string;
	type?: string;
	sport_type?: string;
	start_date?: string;
	elapsed_time?: number;
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
		redirect_uri: config.redirectUri,
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

type StrengthTrainingUploadSet = {
	exercise_type: string;
	repetitions?: number;
	weight?: number;
	duration?: number;
	start_time?: string;
};

type StrengthTrainingUpload = {
	version: '1.0';
	start_time: string;
	utc_offset: number;
	elapsed_time: number;
	creator: { name: string };
	sets: StrengthTrainingUploadSet[];
	description?: string;
};

function formatSetPart(set: SetRow): string {
	const reps = set.reps;
	const weight = set.weight;
	const unit = set.weight_unit === 'kg' ? 'kg' : 'lbs';
	if (reps != null && weight != null) return `${reps}x${weight} ${unit}`;
	if (reps != null) return `${reps} reps`;
	if (weight != null) return `${weight} ${unit}`;
	return '';
}

function toKg(weight: number, unit: string | null): number {
	return unit === 'kg' ? weight : weight * 0.45359237;
}

function describeLocation(workout: WorkoutRow): string | null {
	if (workout.location_label) return workout.location_label;
	if (workout.location_lat != null && workout.location_lng != null) {
		return `${workout.location_lat.toFixed(5)}, ${workout.location_lng.toFixed(5)}`;
	}
	return null;
}

function resolveStravaExerciseType(name: string): string {
	const normalized = name.trim().toLowerCase();

	if (normalized.includes('bench press') || normalized.includes('chest press') || normalized.includes('floor press')) {
		if (normalized.includes('incline') && normalized.includes('dumbbell')) return 'INCLINE_DUMBBELL_BENCH_PRESS';
		if (normalized.includes('incline') && normalized.includes('barbell')) return 'INCLINE_BARBELL_BENCH_PRESS';
		if (normalized.includes('decline') && normalized.includes('dumbbell')) return 'DECLINE_DUMBBELL_BENCH_PRESS';
		if (normalized.includes('close-grip') && normalized.includes('barbell')) return 'CLOSE_GRIP_BARBELL_BENCH_PRESS';
		if (normalized.includes('wide') && normalized.includes('barbell')) return 'WIDE_GRIP_BARBELL_BENCH_PRESS';
		if (normalized.includes('neutral') && normalized.includes('dumbbell')) return 'NEUTRAL_GRIP_DUMBBELL_BENCH_PRESS';
		if (normalized.includes('floor') && normalized.includes('dumbbell')) return 'DUMBBELL_FLOOR_PRESS';
		if (normalized.includes('floor') && normalized.includes('barbell')) return 'FLOOR_BENCH_PRESS';
		if (normalized.includes('smith') && normalized.includes('incline')) return 'SMITH_MACHINE_INCLINE_BENCH_PRESS';
		if (normalized.includes('machine') && normalized.includes('incline')) return 'MACHINE_INCLINE_CHEST_PRESS';
		if (normalized.includes('machine') && normalized.includes('decline')) return 'MACHINE_DECLINE_BENCH_PRESS';
		if (normalized.includes('machine')) return 'MACHINE_CHEST_PRESS';
		if (normalized.includes('dumbbell')) return 'DUMBBELL_BENCH_PRESS';
		if (normalized.includes('barbell')) return 'BARBELL_BENCH_PRESS';
		return 'BENCH_PRESS_GENERIC';
	}

	if (normalized.includes('deadlift')) {
		if (normalized.includes('romanian')) return 'ROMANIAN_DEADLIFTS';
		if (normalized.includes('stiff-leg')) return 'BARBELL_STRAIGHT_LEG_DEADLIFT';
		if (normalized.includes('trap bar')) return 'TRAP_BAR_DEADLIFT';
		if (normalized.includes('sumo')) return 'SUMO_DEADLIFT';
		if (normalized.includes('dumbbell')) return 'DUMBBELL_DEADLIFT';
		if (normalized.includes('barbell')) return 'BARBELL_DEADLIFT';
		return 'DEADLIFT_GENERIC';
	}

	if (normalized.includes('row')) {
		if (normalized.includes('landmine')) return 'LANDMINE_ROW';
		if (normalized.includes('seal')) return 'SEAL_ROW';
		if (normalized.includes('meadows')) return 'MEADOWS_ROW';
		if (normalized.includes('chest-supported')) return 'CHEST_SUPPORTED_ROW';
		if (normalized.includes('hammer strength')) return 'MACHINE_CHEST_SUPPORTED_ROW';
		if (normalized.includes('cable') && normalized.includes('wide')) return 'SEATED_CABLE_ROW';
		if (normalized.includes('cable')) return 'SEATED_CABLE_ROW';
		if (normalized.includes('machine')) return 'MACHINE_SEATED_ROW';
		if (normalized.includes('t-bar')) return 'T_BAR_ROW';
		if (normalized.includes('barbell')) return 'BENT_OVER_BARBELL_ROW';
		if (normalized.includes('dumbbell') || normalized.includes('single-arm')) return 'DUMBBELL_ROW';
		return 'ROW_GENERIC';
	}

	if (normalized.includes('pull-up') || normalized.includes('chin-up') || normalized.includes('lat pulldown') || normalized.includes('pull down')) {
		if (normalized.includes('weighted') && normalized.includes('chin')) return 'WEIGHTED_CHIN_UP';
		if (normalized.includes('weighted') && normalized.includes('pull')) return 'WIDE_PULL_UP';
		if (normalized.includes('assisted') && normalized.includes('chin')) return 'ASSISTED_CHIN_UP';
		if (normalized.includes('neutral')) return 'NEUTRAL_GRIP_LAT_PULLDOWN';
		if (normalized.includes('underhand')) return 'UNDERHAND_LAT_PULLDOWN';
		if (normalized.includes('wide')) return 'WIDE_PULL_UP';
		if (normalized.includes('cable') && normalized.includes('close')) return 'CABLE_LAT_PULLDOWN_CLOSE_GRIP';
		if (normalized.includes('straight-arm')) return 'STRAIGHT_ARM_PULLDOWN';
		if (normalized.includes('pull-up') || normalized.includes('pull up')) return 'PULL_UP_GENERIC';
		return 'LAT_PULLDOWN';
	}

	if (normalized.includes('curl')) {
		if (normalized.includes('hammer')) return 'DUMBBELL_HAMMER_CURL';
		if (normalized.includes('ez-bar') && normalized.includes('preacher')) return 'EZ_BAR_PREACHER_CURL';
		if (normalized.includes('preacher') && normalized.includes('machine')) return 'PREACHER_CURL_MACHINE';
		if (normalized.includes('barbell')) return 'BARBELL_BICEPS_CURL';
		if (normalized.includes('cable') && normalized.includes('reverse')) return 'REVERSE_CABLE_CURLS';
		if (normalized.includes('cable')) return 'CABLE_BICEPS_CURL';
		if (normalized.includes('reverse')) return 'BARBELL_REVERSE_CURL';
		return 'CURL_GENERIC';
	}

	if (normalized.includes('tricep') || normalized.includes('triceps') || normalized.includes('skull crusher') || normalized.includes('dip')) {
		if (normalized.includes('chest dip')) return 'CHEST_DIP';
		if (normalized.includes('bodyweight') && normalized.includes('dip')) return 'BODY_WEIGHT_DIP';
		if (normalized.includes('machine') && normalized.includes('dip')) return 'SEATED_DIP_MACHINE';
		if (normalized.includes('pushdown') && normalized.includes('rope')) return 'CABLE_TRICEPS_PUSHDOWN';
		if (normalized.includes('pushdown')) return 'TRICEPS_PRESSDOWN';
		if (normalized.includes('overhead') && normalized.includes('dumbbell')) return 'OVERHEAD_DUMBBELL_TRICEPS_EXTENSION';
		if (normalized.includes('cable') && normalized.includes('overhead')) return 'CABLE_OVERHEAD_TRICEPS_EXTENSION';
		if (normalized.includes('skull crusher') && normalized.includes('dumbbell')) return 'DUMBBELL_SKULLCRUSHER';
		if (normalized.includes('skull crusher')) return 'SKULL_CRUSHER';
		return 'TRICEPS_EXTENSION_GENERIC';
	}

	if (normalized.includes('squat') || normalized.includes('leg press') || normalized.includes('step up') || normalized.includes('bulgarian split') || normalized.includes('pistol')) {
		if (normalized.includes('front squat')) return 'BARBELL_FRONT_SQUAT';
		if (normalized.includes('back squat')) return 'BARBELL_BACK_SQUAT';
		if (normalized.includes('goblet')) return 'GOBLET_SQUAT';
		if (normalized.includes('hack')) return 'MACHINE_HACK_SQUAT';
		if (normalized.includes('smith')) return 'SMITH_MACHINE_SQUAT';
		if (normalized.includes('leg press')) return 'LEG_PRESS';
		if (normalized.includes('bulgarian')) return 'BARBELL_BULGARIAN_SPLIT_SQUAT';
		if (normalized.includes('step up')) return 'STEP_UP';
		if (normalized.includes('pistol')) return 'PISTOL_SQUAT';
		if (normalized.includes('lunge')) return 'BARBELL_LUNGE';
		if (normalized.includes('zercher')) return 'ZERCHER_SQUAT';
		return 'SQUAT_GENERIC';
	}

	if (normalized.includes('hip thrust') || normalized.includes('glute bridge') || normalized.includes('hip bridge')) {
		if (normalized.includes('machine')) return 'HIP_RAISE';
		if (normalized.includes('barbell')) return 'BARBELL_HIP_THRUST';
		if (normalized.includes('dumbbell')) return 'DUMBBELL_HIP_THRUST';
		return 'GLUTE_BRIDGE';
	}

	if (normalized.includes('calf raise')) {
		if (normalized.includes('seated')) return 'SEATED_CALF_RAISE';
		if (normalized.includes('machine')) return 'MACHINE_CALF_EXTENSION';
		if (normalized.includes('standing')) return 'STANDING_CALF_RAISE';
		return 'CALF_RAISE_GENERIC';
	}

	if (normalized.includes('lateral raise') || normalized.includes('front raise') || normalized.includes('rear delt fly') || normalized.includes('rear delt machine') || normalized.includes('upright row')) {
		if (normalized.includes('cable') && normalized.includes('rear')) return 'CABLE_REAR_DELT_FLY';
		if (normalized.includes('cable') && normalized.includes('lateral')) return 'CABLE_LATERAL_RAISE';
		if (normalized.includes('machine') && normalized.includes('rear')) return 'MACHINE_REAR_DELT_REVERSE_FLY';
		if (normalized.includes('machine') && normalized.includes('lateral')) return 'MACHINE_LATERAL_RAISE';
		if (normalized.includes('front')) return 'PLATE_FRONT_RAISE';
		if (normalized.includes('rear')) return 'DUMBBELL_REAR_DELT_FLY';
		return 'LATERAL_RAISE_GENERIC';
	}

	if (normalized.includes('clean') || normalized.includes('snatch') || normalized.includes('jerk') || normalized.includes('thruster')) {
		if (normalized.includes('clean and jerk')) return 'CLEAN_AND_JERK';
		if (normalized.includes('power snatch')) return 'BARBELL_POWER_SNATCH';
		if (normalized.includes('power clean')) return 'BARBELL_POWER_CLEAN';
		if (normalized.includes('hang clean')) return 'BARBELL_HANG_POWER_CLEAN';
		if (normalized.includes('snatch')) return 'BARBELL_SNATCH';
		if (normalized.includes('clean')) return 'CLEAN';
		if (normalized.includes('thruster')) return 'THRUSTERS';
		return 'OLYMPIC_LIFT_GENERIC';
	}

	if (normalized.includes('carry')) {
		if (normalized.includes('suitcase')) return 'SUITCASE_CARRY';
		if (normalized.includes('farmer')) return 'FARMERS_CARRY';
		return 'CARRY_GENERIC';
	}

	if (normalized.includes('plank') || normalized.includes('crunch') || normalized.includes('sit-up') || normalized.includes('sit up') || normalized.includes('leg raise') || normalized.includes('ab wheel') || normalized.includes('pallof') || normalized.includes('russian twist') || normalized.includes('wood chop') || normalized.includes('hollow') || normalized.includes('dragon flag')) {
		if (normalized.includes('ab wheel')) return 'AB_WHEEL_ROLLOUT';
		if (normalized.includes('pallof')) return 'PALLOF_PRESS';
		if (normalized.includes('russian twist')) return 'RUSSIAN_TWIST';
		if (normalized.includes('sit-up') || normalized.includes('sit up')) return 'SIT_UP_GENERIC';
		if (normalized.includes('leg raise') && normalized.includes('hanging')) return 'HANGING_KNEE_RAISE';
		if (normalized.includes('leg raise')) return 'LYING_KNEE_RAISE';
		if (normalized.includes('plank') && normalized.includes('side')) return 'SIDE_PLANK_HOLD';
		if (normalized.includes('plank')) return 'PLANK_HOLD';
		if (normalized.includes('crunch')) return 'CRUNCH';
		if (normalized.includes('wood chop')) return 'CABLE_WOODCHOP';
		if (normalized.includes('dragon flag')) return 'DRAGON_FLAG';
		if (normalized.includes('hollow')) return 'HOLLOW_ROCK';
		return 'CORE_GENERIC';
	}

	if (normalized.includes('push-up') || normalized.includes('push up') || normalized.includes('dip') || normalized.includes('muscle up') || normalized.includes('inverted row')) {
		if (normalized.includes('handstand')) return 'HANDSTAND_PUSH_UP';
		if (normalized.includes('muscle up')) return 'MUSCLE_UP';
		if (normalized.includes('ring dip')) return 'RING_DIP';
		if (normalized.includes('inverted row')) return 'INVERTED_ROW';
		if (normalized.includes('push-up')) return 'PUSH_UP_GENERIC';
		return 'BODY_WEIGHT_DIP';
	}

	if (normalized.includes('battle rope')) return 'BATTLE_ROPES';
	if (normalized.includes('rowing machine')) return 'ROWING_MACHINE';
	if (normalized.includes('sled push')) return 'SLED_PUSH';

	return 'TOTAL_BODY_GENERIC';
}

function buildWorkoutUploadPayload(workout: WorkoutRow, sets: SetRow[]): { payload: StrengthTrainingUpload; title: string; description: string } {
	const orderedExercises = new Map<string, SetRow[]>();
	for (const set of sets) {
		const exerciseSets = orderedExercises.get(set.exercise_name) ?? [];
		exerciseSets.push(set);
		orderedExercises.set(set.exercise_name, exerciseSets);
	}

	const uploadSets: StrengthTrainingUploadSet[] = [];
	const lines: string[] = [];
	for (const [exercise, exerciseSets] of orderedExercises.entries()) {
		const ordered = [...exerciseSets].sort((a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at);
		for (const set of ordered) {
			const uploadSet: StrengthTrainingUploadSet = {
				exercise_type: resolveStravaExerciseType(exercise)
			};
			if (set.reps != null) uploadSet.repetitions = set.reps;
			if (set.weight != null) uploadSet.weight = Number(toKg(set.weight, set.weight_unit).toFixed(2));
			uploadSets.push(uploadSet);
		}
		lines.push(`${exercise}: ${ordered.map(formatSetPart).filter(Boolean).join(', ')}`);
	}

	const location = describeLocation(workout);
	if (location) {
		lines.unshift(`Location: ${location}`);
	}
	if (workout.notes) {
		lines.unshift(`Notes: ${workout.notes}`);
	}

	const title = `${dayPeriodTitlePart(workout.start_time)} Strength Training - ${sets.length} Sets`;
	const description = `${lines.join('\n')}\n\nSynced from WorkoutTrackerApp`;
	const payload: StrengthTrainingUpload = {
		version: '1.0',
		start_time: new Date(workout.start_time).toISOString(),
		utc_offset: 0,
		elapsed_time: Math.max(1, Math.round((workout.end_time - workout.start_time) / 1000)),
		creator: { name: 'WorkoutTrackerApp' },
		sets: uploadSets,
		description
	};
	return { payload, title, description };
}

async function createStrengthTrainingUpload(
	accessToken: string,
	input: { name: string; description: string; payload: StrengthTrainingUpload; workoutId: string }
): Promise<{ uploadId: string; activityId: string }> {
	const formData = new FormData();
	formData.set('name', input.name);
	formData.set('description', input.description);
	formData.set('trainer', '1');
	formData.set('commute', '0');
	formData.set('activity_type', 'WeightTraining');
	formData.set('data_type', 'json');
	formData.set('external_id', input.workoutId);
	formData.set('file', new Blob([JSON.stringify(input.payload)], { type: 'application/json' }), 'strength-training.json');

	const res = await fetch(`${STRAVA_API_BASE}/uploads`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}` },
		body: formData
	});
	if (!res.ok) throw error(502, `Strava upload failed (${res.status})`);
	const json = (await res.json()) as { id?: number; id_str?: string; activity_id?: number | null; error?: string | null; status?: string };
	if (json.error) throw error(502, `Strava upload failed: ${json.error}`);
	const uploadId = json.id_str ?? (json.id != null ? String(json.id) : '');
	if (!uploadId) throw error(502, 'Strava upload did not return an upload id');
	return { uploadId, activityId: json.activity_id != null ? String(json.activity_id) : '' };
}

async function getUploadStatus(
	accessToken: string,
	uploadId: string
): Promise<{ uploadId: string; activityId: string | null; status: string; error: string | null }> {
	const res = await fetch(`${STRAVA_API_BASE}/uploads/${encodeURIComponent(uploadId)}`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) throw error(502, `Strava upload status failed (${res.status})`);
	const json = (await res.json()) as { id?: number; id_str?: string; activity_id?: number | null; status?: string; error?: string | null };
	return {
		uploadId: json.id_str ?? (json.id != null ? String(json.id) : uploadId),
		activityId: json.activity_id != null ? String(json.activity_id) : null,
		status: json.status ?? '',
		error: json.error ?? null
	};
}

async function listStravaActivities(
	accessToken: string,
	after: number,
	before: number
): Promise<StravaActivityRow[]> {
	const activities: StravaActivityRow[] = [];
	for (let page = 1; page <= 3; page += 1) {
		const params = new URLSearchParams({
			after: String(after),
			before: String(before),
			page: String(page),
			per_page: '100'
		});
		const res = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params.toString()}`, {
			headers: { Authorization: `Bearer ${accessToken}` }
		});
		if (!res.ok) throw error(502, `Strava activities fetch failed (${res.status})`);
		const json = (await res.json()) as StravaActivityRow[];
		activities.push(...json);
		if (json.length < 100) break;
	}
	return activities;
}

function normalizeStravaText(value: string | undefined): string {
	return (value ?? '').trim().toLowerCase();
}

function scoreApproximateActivityMatch(
	workout: WorkoutRow,
	activity: StravaActivityRow,
	targetTitle: string,
	targetDurationMs: number
): number {
	if (!activity.start_date || !Number.isFinite(Date.parse(activity.start_date))) return Number.POSITIVE_INFINITY;
	const startDiffMinutes = Math.abs(Date.parse(activity.start_date) - workout.start_time) / 60000;
	const elapsedMs = Math.max(1, (activity.elapsed_time ?? 0) * 1000);
	const durationDiffMinutes = Math.abs(elapsedMs - targetDurationMs) / 60000;
	const activityName = normalizeStravaText(activity.name);
	const expectedName = normalizeStravaText(targetTitle);
	const typeValue = normalizeStravaText(activity.type) || normalizeStravaText(activity.sport_type);

	let score = startDiffMinutes * 3 + durationDiffMinutes * 1.25;
	if (typeValue.includes('weight')) score -= 30;
	if (activityName.includes('strength training')) score -= 18;
	if (activityName.includes('workout')) score -= 6;
	if (activityName === expectedName) score -= 40;
	else if (activityName.includes(expectedName) || expectedName.includes(activityName)) score -= 18;
	if (startDiffMinutes <= 20) score -= 12;
	if (startDiffMinutes <= 90) score -= 6;
	return score;
}

async function findClosestExistingActivity(
	accessToken: string,
	workout: WorkoutRow,
	sets: SetRow[]
): Promise<string | null> {
	const targetStart = workout.start_time;
	const targetEnd = workout.end_time;
	const targetDurationMs = Math.max(1, targetEnd - targetStart);
	const targetTitle = buildWorkoutUploadPayload(workout, sets).title;
	const after = Math.max(0, Math.floor((targetStart - 7 * 24 * 60 * 60 * 1000) / 1000));
	const before = Math.floor((targetEnd + 7 * 24 * 60 * 60 * 1000) / 1000);
	const activities = await listStravaActivities(accessToken, after, before);
	let bestActivityId: string | null = null;
	let bestScore = Number.POSITIVE_INFINITY;
	for (const activity of activities) {
		const score = scoreApproximateActivityMatch(workout, activity, targetTitle, targetDurationMs);
		if (score < bestScore) {
			bestScore = score;
			bestActivityId = String(activity.id);
		}
	}
	if (bestActivityId == null) return null;
	if (!Number.isFinite(bestScore) || bestScore > 240) return null;
	return bestActivityId;
}

async function waitForUploadActivityId(accessToken: string, uploadId: string): Promise<string> {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const status = await getUploadStatus(accessToken, uploadId);
		if (status.error) throw error(502, `Strava upload failed: ${status.error}`);
		if (status.activityId) return status.activityId;
		if (status.status && !status.status.includes('still being processed')) {
			throw error(502, `Strava upload did not complete: ${status.status}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw error(504, 'Timed out waiting for Strava to process the upload');
}

async function getWorkoutAndSets(
	db: D1Database,
	userId: string,
	workoutId: string
): Promise<{ workout: WorkoutRow; sets: SetRow[]; sourceUpdatedAt: number } | null> {
	const workout = await db
		.prepare('SELECT id, start_time, end_time, updated_at, notes, location_lat, location_lng, location_label FROM workouts WHERE id = ? AND user_id = ?')
		.bind(workoutId, userId)
		.first<WorkoutRow>();
	if (!workout) return null;
	const setRows = await db
		.prepare(
			`SELECT exercise_name, reps, weight, weight_unit, sort_order, created_at, updated_at
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
	const row = await db
		.prepare(
			'SELECT strava_activity_id, upload_id, source_updated_at FROM workout_strava_sync WHERE workout_id = ? AND user_id = ?'
		)
		.bind(workoutId, userId)
		.first<{ strava_activity_id: number | string; upload_id: string | null; source_updated_at: number }>();
	if (!row) return null;
	return {
		strava_activity_id: String(row.strava_activity_id),
		upload_id: row.upload_id ?? null,
		source_updated_at: row.source_updated_at
	};
}

async function saveSyncMap(
	db: D1Database,
	userId: string,
	workoutId: string,
	activityId: string,
	uploadId: string,
	sourceUpdatedAt: number
): Promise<void> {
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO workout_strava_sync (workout_id, user_id, strava_activity_id, upload_id, source_updated_at, last_synced_at, created_at, updated_at)
	       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workout_id) DO UPDATE SET
         user_id = excluded.user_id,
         strava_activity_id = excluded.strava_activity_id,
         upload_id = excluded.upload_id,
         source_updated_at = excluded.source_updated_at,
         last_synced_at = excluded.last_synced_at,
         updated_at = excluded.updated_at`
		)
		.bind(workoutId, userId, activityId, uploadId, sourceUpdatedAt, now, now, now)
		.run();
}

export async function syncWorkoutToStrava(
	db: D1Database,
	platform: App.Platform | undefined,
	userId: string,
	workoutId: string
): Promise<{ pushed: boolean; uploadId?: string; activityId?: string }> {
	const result = await getWorkoutAndSets(db, userId, workoutId);
	if (!result) return { pushed: false };
	const accessToken = await getValidAccessToken(db, platform, userId);
	const { workout, sets, sourceUpdatedAt } = result;
	const existing = await getSyncMap(db, workoutId, userId);
	if (existing && existing.source_updated_at >= sourceUpdatedAt) {
		return { pushed: false, uploadId: existing.upload_id ?? undefined, activityId: existing.strava_activity_id };
	}

	const approximateActivityId = await findClosestExistingActivity(accessToken, workout, sets);
	if (approximateActivityId) {
		await saveSyncMap(db, userId, workoutId, approximateActivityId, null, sourceUpdatedAt);
		return { pushed: true, activityId: approximateActivityId };
	}
	const summary = buildWorkoutUploadPayload(workout, sets);
	const upload = await createStrengthTrainingUpload(accessToken, {
		name: summary.title,
		description: summary.description,
		payload: summary.payload,
		workoutId
	});
	const activityId = upload.activityId || (await waitForUploadActivityId(accessToken, upload.uploadId));
	await saveSyncMap(db, userId, workoutId, activityId, upload.uploadId, sourceUpdatedAt);
	return { pushed: true, uploadId: upload.uploadId, activityId };
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
