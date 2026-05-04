import { error } from '@sveltejs/kit';

export async function requireAuth(
	request: Request,
	platform: App.Platform | undefined
): Promise<string> {
	const auth = request.headers.get('Authorization');
	if (!auth?.startsWith('Bearer ')) throw error(401, 'Unauthorized');
	const token = auth.slice(7);

	const sessions = platform?.env?.SESSIONS;
	if (!sessions) throw error(503, 'Sessions not available');

	const userId = await sessions.get(`session:${token}`);
	if (!userId) throw error(401, 'Invalid or expired session');

	return userId;
}
