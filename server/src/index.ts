import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import {
	COLLECTIONS,
	clockSkew,
	createUser,
	docsSince,
	ensureSchema,
	getDocForUpdate,
	knownUsers,
	liveDocs,
	persistedSecret,
	rowToDoc,
	stats,
	transaction,
	userByEmail,
	userCount,
	writeDoc
} from './db.ts';
import {
	clearSession,
	hashPassword,
	issueSession,
	requireAuth,
	verifyPassword,
	type AuthedEnv
} from './auth.ts';
import { buildCalendar, feedToken, resolveFeedToken, type FeedTask } from './ics.ts';

const PORT = Number(process.env.PORT ?? 5178);
const DEFAULT_ALARM_MINUTES = 10;

type PushRow = {
	assumedMasterState?: Record<string, unknown>;
	newDocumentState: Record<string, unknown>;
};

/**
 * Empty by default, which is the same-origin deployment: the app is served by nginx (or the
 * Vite proxy in dev) from the origin it calls, so no CORS headers are involved at all. A
 * cross-origin sync server has to name the app's origin here — a session cookie cannot be
 * sent to a wildcard origin.
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
	.split(',')
	.map((o) => o.trim())
	.filter(Boolean);

const app = new Hono();
app.use(
	'*',
	cors({
		origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : null),
		allowHeaders: ['content-type'],
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		credentials: true
	})
);

const listeners = new Map<string, Set<() => void>>();

function notify(userId: string, except?: string) {
	for (const [key, set] of listeners) {
		if (key !== userId) continue;
		for (const fn of set) fn();
	}
	void except;
}

const auth = new Hono<AuthedEnv>();

function credentials(body: unknown): { email: string; password: string } | null {
	const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
	if (typeof email !== 'string' || typeof password !== 'string') return null;
	const trimmed = email.trim().toLowerCase();
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) || password.length < 8) return null;
	return { email: trimmed, password };
}

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
	// Hash even when the account is missing, so a wrong email is not faster than a wrong password.
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

const sync = new Hono<AuthedEnv>();
sync.use('*', requireAuth);

sync.get('/pull', async (c) => {
	const collection = c.req.query('collection') ?? '';
	if (!COLLECTIONS.has(collection)) return c.json({ error: 'unknown collection' }, 400);

	const userId = c.get('userId');
	const cursor = Number(c.req.query('cursor') ?? 0) || 0;
	const id = c.req.query('id') ?? '';
	const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 100)));

	const rows = await docsSince(userId, collection, cursor, id, limit);
	const last = rows.at(-1);

	return c.json({
		documents: rows.map(rowToDoc),
		checkpoint: last ? { cursor: last.rev, id: last.id } : { cursor, id }
	});
});

sync.post('/push', async (c) => {
	const body = (await c.req.json()) as { collection?: string; rows?: PushRow[] };
	const collection = body.collection ?? '';
	if (!COLLECTIONS.has(collection)) return c.json({ error: 'unknown collection' }, 400);

	const userId = c.get('userId');
	const rows = body.rows ?? [];

	const conflicts = await transaction(async (tx) => {
		const out: Record<string, unknown>[] = [];
		for (const row of rows) {
			const incoming = row.newDocumentState;
			if (!incoming?.id) continue;

			const existing = await getDocForUpdate(tx, userId, collection, String(incoming.id));

			// Last-write-wins per document, gated on the client having seen the current master.
			if (existing) {
				const master = rowToDoc(existing);
				const assumed = row.assumedMasterState;
				if (!assumed || Number(assumed.updatedAt ?? -1) !== Number(master.updatedAt ?? -2)) {
					out.push(master);
					continue;
				}
			}

			await writeDoc(tx, userId, collection, incoming);
		}
		return out;
	});

	if (rows.length > conflicts.length) notify(userId);
	return c.json(conflicts);
});

sync.get('/events', (c) => {
	const userId = c.get('userId');

	return streamSSE(c, async (stream) => {
		let wake: (() => void) | null = null;
		const queue: (() => void)[] = [];

		const push = () => {
			if (wake) wake();
			else queue.push(() => {});
		};

		const set = listeners.get(userId) ?? new Set();
		set.add(push);
		listeners.set(userId, set);

		stream.onAbort(() => {
			set.delete(push);
			if (!set.size) listeners.delete(userId);
		});

		await stream.writeSSE({ event: 'ready', data: '1' });

		while (!stream.aborted) {
			const changed = await Promise.race([
				new Promise<boolean>((resolve) => {
					wake = () => resolve(true);
					if (queue.length) {
						queue.length = 0;
						resolve(true);
					}
				}),
				new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 25_000))
			]);
			wake = null;
			if (stream.aborted) break;
			await stream.writeSSE(changed ? { event: 'change', data: '1' } : { event: 'ping', data: '1' });
		}
	});
});

sync.get('/status', async (c) => {
	const userId = c.get('userId');
	return c.json({
		ok: true,
		userId,
		serverTime: Date.now(),
		collections: await stats(userId),
		clockSkew: await clockSkew(userId)
	});
});

const calendar = new Hono<AuthedEnv>();

/** Env wins so a deployment can pin the key; otherwise it is minted once and persisted. */
async function calendarSecret(): Promise<string> {
	return process.env.CALENDAR_SECRET || (await persistedSecret('calendar'));
}

calendar.get('/token', requireAuth, async (c) => {
	return c.json({ token: feedToken(await calendarSecret(), c.get('userId')) });
});

/** The feed itself stays unauthenticated: a calendar client cannot sign in, so the
 *  unguessable token in the URL is the credential. */

calendar.get('/:token/tohab.ics', async (c) => {
	const userId = resolveFeedToken(await calendarSecret(), c.req.param('token'), await knownUsers());
	if (!userId) return c.text('unknown calendar', 404);

	const alarm = Number(c.req.query('alarm') ?? DEFAULT_ALARM_MINUTES);
	const [taskRows, projectRows] = await Promise.all([
		liveDocs(userId, 'tasks'),
		liveDocs(userId, 'projects')
	]);

	const projects = new Map(
		projectRows.map((row) => [String(row.data.id), String(row.data.name ?? '')])
	);

	const body = buildCalendar(taskRows.map((row) => row.data as unknown as FeedTask), {
		alarmMinutes: Number.isFinite(alarm) ? Math.max(0, Math.min(1440, alarm)) : DEFAULT_ALARM_MINUTES,
		name: 'Tohab',
		projects
	});

	c.header('content-type', 'text/calendar; charset=utf-8');
	// Feed readers poll on their own schedule; a short cache keeps repeat fetches cheap.
	c.header('cache-control', 'private, max-age=300');
	return c.body(body);
});

app.route('/auth', auth);
app.route('/sync', sync);
app.route('/calendar', calendar);
app.get('/', (c) => c.text('tohab sync server'));

await ensureSchema();

serve({ fetch: app.fetch, port: PORT }, (info) => {
	console.log(`tohab sync server listening on http://localhost:${info.port}/sync`);
});
