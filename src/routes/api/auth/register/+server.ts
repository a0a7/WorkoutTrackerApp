import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16; // bytes (128-bit salt)

async function hashPassword(password: string): Promise<string> {
	const encoder = new TextEncoder();
	const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
	const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
		'deriveBits',
	]);
	const derived = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
		keyMaterial,
		256
	);
	const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
	const hashHex = Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, '0')).join('');
	return `pbkdf2:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
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
		await sessions.put(`session:${token}`, userId, { expirationTtl: SESSION_TTL_SECONDS });
	}

	return json({ userId, token, email: email.toLowerCase() }, { status: 201 });
};
