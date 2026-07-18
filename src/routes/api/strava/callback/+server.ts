import type { RequestHandler } from '@sveltejs/kit';
import { error, redirect } from '@sveltejs/kit';
import { exchangeCodeAndStoreToken, verifyStravaStateAndGetUserId } from '$lib/server/strava';

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database not available');
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	if (!code || !state) throw error(400, 'Missing Strava callback params');
	const userId = await verifyStravaStateAndGetUserId(platform, state);
	await exchangeCodeAndStoreToken(db, platform, userId, code);
	throw redirect(302, '/settings?strava=connected');
};
