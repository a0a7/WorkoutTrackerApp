import { error } from '@sveltejs/kit';

/** Two hex characters are needed to represent one byte. */
export const HEX_CHARS_PER_BYTE = 2;

/** Convert a Uint8Array to a lowercase hex string. */
export function bytesToHex(buf: Uint8Array): string {
	return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Generate a cryptographically random session token. */
export function generateToken(): string {
	return crypto.randomUUID() + '-' + crypto.randomUUID();
}

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
