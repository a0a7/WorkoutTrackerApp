import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { buildStravaAuthUrl } from '$lib/server/strava';

export const GET: RequestHandler = async ({ request, platform }) => {
	const userId = await requireAuth(request, platform);
	const url = await buildStravaAuthUrl(platform, userId);
	return json({ url });
};
