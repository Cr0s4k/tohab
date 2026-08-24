import { Hono } from 'hono';
import {
	clearSession,
	hashPassword,
	issueSession,
	requireAuth,
	verifyPassword,
	type AuthedEnv
} from '../auth.ts';
import { createUser, userByEmail, userCount } from '../db.ts';

function credentials(body: unknown): { email: string; password: string } | null {
	const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
	if (typeof email !== 'string' || typeof password !== 'string') return null;
	const trimmed = email.trim().toLowerCase();
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) || password.length < 8) return null;
	return { email: trimmed, password };
}

export function createAuthRoutes() {
	const auth = new Hono<AuthedEnv>();

	/** Open until the first account exists, then permanently closed: this is a single-user app,
	 *  and an open endpoint on a public host is how it would stop being one. */
	auth.post('/register', async (c) => {
		if ((await userCount()) > 0) return c.json({ error: 'registration closed' }, 403);

		const creds = credentials(await c.req.json().catch(() => null));
		if (!creds) return c.json({ error: 'email and a password of 8+ characters required' }, 400);

		const user = await createUser(creds.email, await hashPassword(creds.password));
		await issueSession(c, user.id);
		return c.json({ userId: user.id, email: user.email });
	});

	auth.post('/login', async (c) => {
		const creds = credentials(await c.req.json().catch(() => null));
		if (!creds) return c.json({ error: 'invalid credentials' }, 401);

		const user = await userByEmail(creds.email);
		const stored = user?.passwordHash ?? (await hashPassword('placeholder'));
		if (!(await verifyPassword(creds.password, stored)) || !user) {
			return c.json({ error: 'invalid credentials' }, 401);
		}

		await issueSession(c, user.id);
		return c.json({ userId: user.id, email: user.email });
	});

	auth.post('/logout', (c) => {
		clearSession(c);
		return c.json({ ok: true });
	});

	/** Lets a cold client tell "never registered" (show sign-up) from "signed out" (show login). */
	auth.get('/state', async (c) => c.json({ registrationOpen: (await userCount()) === 0 }));
	auth.get('/me', requireAuth, async (c) => c.json({ userId: c.get('userId') }));

	return auth;
}
