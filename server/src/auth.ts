import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { persistedSecret } from './repositories/secrets.ts';
import { userById } from './repositories/users.ts';

const scryptAsync = promisify(scrypt);

const KEYLEN = 64;
const COOKIE = 'tohab_session';
/** A personal tracker is opened for months at a time; a short session would only ever
 *  log someone out mid-week for no security gain on a single-user server. */
const SESSION_MS = 365 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const key = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
	return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [scheme, saltHex, keyHex] = stored.split('$');
	if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
	const expected = Buffer.from(keyHex, 'hex');
	const actual = (await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length)) as Buffer;
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Sessions are signed rather than stored, so there is no session table to expire or clean.
 * The trade: a leaked cookie stays valid until it expires. Deleting the `session` row from
 * `secrets` mints a new key and so invalidates every session at once.
 */
function sessionSecret() {
	return persistedSecret('session');
}

function sign(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

export async function issueSession(c: Context, userId: string) {
	const expiresAt = Date.now() + SESSION_MS;
	const payload = `${userId}.${expiresAt}`;
	const token = `${payload}.${sign(payload, await sessionSecret())}`;

	setCookie(c, COOKIE, token, {
		httpOnly: true,
		sameSite: 'Lax',
		secure: isHttps(c),
		path: '/',
		maxAge: Math.floor(SESSION_MS / 1000)
	});
}

export function clearSession(c: Context) {
	setCookie(c, COOKIE, '', {
		httpOnly: true,
		sameSite: 'Lax',
		secure: isHttps(c),
		path: '/',
		maxAge: 0
	});
}

/** nginx terminates TLS, so the scheme has to come from the forwarded header. */
function isHttps(c: Context): boolean {
	const proto = c.req.header('x-forwarded-proto');
	if (proto) return proto.split(',')[0].trim() === 'https';
	return new URL(c.req.url).protocol === 'https:';
}

async function userIdFromCookie(c: Context): Promise<string | null> {
	const token = getCookie(c, COOKIE);
	if (!token) return null;

	const cut = token.lastIndexOf('.');
	if (cut < 0) return null;
	const payload = token.slice(0, cut);
	const provided = Buffer.from(token.slice(cut + 1), 'base64url');
	const expected = Buffer.from(sign(payload, await sessionSecret()), 'base64url');
	if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

	const [userId, expiresAt] = payload.split('.');
	if (!userId || Number(expiresAt) < Date.now()) return null;
	return userId;
}

export type AuthedEnv = { Variables: { userId: string } };

/** Rejects anything without a valid session, and anything whose user has since been deleted. */
export const requireAuth: MiddlewareHandler<AuthedEnv> = async (c, next) => {
	const userId = await userIdFromCookie(c);
	if (!userId || !(await userById(userId))) return c.json({ error: 'unauthorized' }, 401);
	c.set('userId', userId);
	await next();
};
