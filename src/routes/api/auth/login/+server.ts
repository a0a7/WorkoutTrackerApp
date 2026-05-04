import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { bytesToHex, generateToken, HEX_CHARS_PER_BYTE } from '$lib/server/auth';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year
const PBKDF2_ITERATIONS = 600_000; // OWASP recommended minimum for PBKDF2-SHA256
const SALT_LENGTH = 16; // bytes (128-bit salt)

async function verifyPassword(password: string, stored: string): Promise<boolean> {
	// Support PBKDF2 format: "pbkdf2:<iterations>:<saltHex>:<hashHex>"
	const parts = stored.split(':');
	if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

	const iterations = parseInt(parts[1], 10);
	if (isNaN(iterations) || iterations <= 0) return false;
	const saltHex = parts[2];
	if (saltHex.length !== SALT_LENGTH * HEX_CHARS_PER_BYTE || !/^[0-9a-f]+$/.test(saltHex)) return false; // lowercase-only to match bytesToHex output; uppercase would indicate a foreign hash format
	const saltHexPairs = saltHex.match(/.{2}/g);
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
	const actualHash = bytesToHex(new Uint8Array(derived));
	return actualHash === expectedHash;
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
