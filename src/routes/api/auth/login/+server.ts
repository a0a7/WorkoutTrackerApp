import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';

function hashPassword(password: string): Promise<string> {
	const encoder = new TextEncoder();
	return crypto.subtle.digest('SHA-256', encoder.encode(password)).then((buf) =>
		Array.from(new Uint8Array(buf))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')
	);
}

function generateToken(): string {
	return crypto.randomUUID() + '-' + crypto.randomUUID();
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env?.DB;
	const sessions = platform?.env?.SESSIONS;
	if (!db) throw error(503, 'Database not available');

	let body: { email?: string; password?: string };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const { email, password } = body;
	if (!email || !password) throw error(400, 'Email and password required');

	const passwordHash = await hashPassword(password);

	const user = await db
		.prepare('SELECT id, password_hash FROM users WHERE email = ?')
		.bind(email.toLowerCase())
		.first<{ id: string; password_hash: string }>();

	if (!user || user.password_hash !== passwordHash) {
		throw error(401, 'Invalid email or password');
	}

	const token = generateToken();

	if (sessions) {
		await sessions.put(`session:${token}`, user.id, { expirationTtl: 60 * 60 * 24 * 365 });
	}

	return json({ userId: user.id, token, email: email.toLowerCase() });
};
