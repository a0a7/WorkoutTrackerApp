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
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw error(400, 'Invalid email');
	if (password.length < 6) throw error(400, 'Password must be at least 6 characters');

	const existing = await db
		.prepare('SELECT id FROM users WHERE email = ?')
		.bind(email.toLowerCase())
		.first<{ id: string }>();
	if (existing) throw error(409, 'Email already registered');

	const userId = crypto.randomUUID();
	const passwordHash = await hashPassword(password);
	const token = generateToken();
	const now = Date.now();

	await db
		.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
		.bind(userId, email.toLowerCase(), passwordHash, now)
		.run();

	if (sessions) {
		await sessions.put(`session:${token}`, userId, { expirationTtl: 60 * 60 * 24 * 365 });
	}

	return json({ userId, token, email: email.toLowerCase() }, { status: 201 });
};
