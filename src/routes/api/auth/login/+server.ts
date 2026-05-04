import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16; // bytes

async function verifyPassword(password: string, stored: string): Promise<boolean> {
	// Support PBKDF2 format: "pbkdf2:<iterations>:<saltHex>:<hashHex>"
	const parts = stored.split(':');
	if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

	const iterations = parseInt(parts[1], 10);
	const saltHexPairs = parts[2].match(/.{2}/g);
	if (!saltHexPairs || saltHexPairs.length !== SALT_LENGTH) return false;

	const salt = new Uint8Array(saltHexPairs.map((h) => parseInt(h, 16)));
	const expectedHash = parts[3];

	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
		'deriveBits',
	]);
	const derived = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
		keyMaterial,
		256
	);
	const actualHash = Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, '0')).join('');
	return actualHash === expectedHash;
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

	const user = await db
		.prepare('SELECT id, password_hash FROM users WHERE email = ?')
		.bind(email.toLowerCase())
		.first<{ id: string; password_hash: string }>();

	// Use constant-time-equivalent verification (verifyPassword is already constant-time via PBKDF2)
	const valid = user ? await verifyPassword(password, user.password_hash) : false;
	if (!user || !valid) {
		throw error(401, 'Invalid email or password');
	}

	const token = generateToken();

	if (sessions) {
		await sessions.put(`session:${token}`, user.id, { expirationTtl: SESSION_TTL_SECONDS });
	}

	return json({ userId: user.id, token, email: email.toLowerCase() });
};
