import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import webpush from 'web-push';
import {
	COLLECTIONS,
	allPushSubscriptions,
	calendarAlarmMinutes,
	clockSkew,
	createUser,
	deletePushSubscription,
	deletePushSubscriptionById,
	docsSince,
	ensureSchema,
	getDocForUpdate,
	knownUsers,
	liveDocs,
	persistedGenerated,
	persistedSecret,
	claimPushReminder,
	prunePushReminders,
	pushSubscriptionsForUser,
	recordPushFailure,
	recordPushSuccess,
	releasePushReminder,
	rowToDoc,
	setCalendarAlarmMinutes,
	stats,
	transaction,
	upsertPushSubscription,
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
import {
	buildCalendar,
	feedToken,
	publicCalendarFeedUrl,
	resolveFeedToken,
	type FeedTask
} from './ics.ts';
import { reminderForTask, validPushEndpoint, validTimeZone, type ReminderTask } from './push.ts';

const PORT = Number(process.env.PORT ?? 5178);
const DEFAULT_ALARM_MINUTES = 10;
const CALENDAR_PUBLIC_BASE_URL = process.env.CALENDAR_PUBLIC_BASE_URL;

if (CALENDAR_PUBLIC_BASE_URL) {
	void publicCalendarFeedUrl(CALENDAR_PUBLIC_BASE_URL, 'configuration-check');
}

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
		allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
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
	const token = feedToken(await calendarSecret(), c.get('userId'));
	const feedUrl = publicCalendarFeedUrl(CALENDAR_PUBLIC_BASE_URL, token);
	return c.json(feedUrl ? { token, feedUrl } : { token });
});

calendar.post('/settings', requireAuth, async (c) => {
	const value = (await c.req.json().catch(() => null)) as { alarmMinutes?: unknown } | null;
	if (typeof value?.alarmMinutes !== 'number' || !Number.isFinite(value.alarmMinutes)) {
		return c.json({ error: 'valid alarmMinutes required' }, 400);
	}

	const normalized = Math.max(0, Math.min(1440, Math.round(value.alarmMinutes)));
	await setCalendarAlarmMinutes(c.get('userId'), normalized);
	return c.json({ alarmMinutes: normalized });
});

/** The feed itself stays unauthenticated: a calendar client cannot sign in, so the
 *  unguessable token in the URL is the credential. */

calendar.get('/:token/tohab.ics', async (c) => {
	const userId = resolveFeedToken(await calendarSecret(), c.req.param('token'), await knownUsers());
	if (!userId) return c.text('unknown calendar', 404);

	const [alarmMinutes, taskRows, projectRows] = await Promise.all([
		calendarAlarmMinutes(userId),
		liveDocs(userId, 'tasks'),
		liveDocs(userId, 'projects')
	]);

	const projects = new Map(
		projectRows.map((row) => [String(row.data.id), String(row.data.name ?? '')])
	);

	const body = buildCalendar(taskRows.map((row) => row.data as unknown as FeedTask), {
		alarmMinutes: alarmMinutes ?? DEFAULT_ALARM_MINUTES,
		name: 'Tohab',
		projects
	});

	c.header('content-type', 'text/calendar; charset=utf-8');
	// Feed readers poll on their own schedule; a short cache keeps repeat fetches cheap.
	c.header('cache-control', 'private, max-age=300');
	return c.body(body);
});

const push = new Hono<AuthedEnv>();
push.use('*', requireAuth);

type VapidPair = { publicKey: string; privateKey: string };
let cachedVapid: VapidPair | null = null;

async function vapidKeys(): Promise<VapidPair> {
	if (cachedVapid) return cachedVapid;
	const fromEnv = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
		? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
		: null;
	const pair = fromEnv ?? JSON.parse(await persistedGenerated('vapid', () => JSON.stringify(webpush.generateVAPIDKeys()))) as VapidPair;
	if (!pair.publicKey || !pair.privateKey) throw new Error('invalid VAPID key pair');
	webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@tohab.local', pair.publicKey, pair.privateKey);
	cachedVapid = pair;
	return pair;
}

function pushBody(body: unknown) {
	const value = (body ?? {}) as {
		endpoint?: unknown;
		keys?: { p256dh?: unknown; auth?: unknown };
		timeZone?: unknown;
		leadMinutes?: unknown;
	};
	if (typeof value.endpoint !== 'string' || !validPushEndpoint(value.endpoint)) return null;
	if (typeof value.keys?.p256dh !== 'string' || value.keys.p256dh.length < 16) return null;
	if (typeof value.keys.auth !== 'string' || value.keys.auth.length < 8) return null;
	if (typeof value.timeZone !== 'string' || !validTimeZone(value.timeZone)) return null;
	const leadMinutes = Math.max(0, Math.min(1440, Math.round(Number(value.leadMinutes ?? 10))));
	if (!Number.isFinite(leadMinutes)) return null;
	return { endpoint: value.endpoint, p256dh: value.keys.p256dh, auth: value.keys.auth, timeZone: value.timeZone, leadMinutes };
}

async function sendPush(subscription: Awaited<ReturnType<typeof allPushSubscriptions>>[number], payload: Record<string, unknown>) {
	await vapidKeys();
	try {
		await webpush.sendNotification(
			{ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
			JSON.stringify(payload),
			{ TTL: 3600, urgency: 'high' }
		);
		await recordPushSuccess(subscription.id);
		return true;
	} catch (error) {
		const status = Number((error as { statusCode?: number }).statusCode ?? 0);
		if (status === 404 || status === 410) await deletePushSubscriptionById(subscription.id);
		else {
			await recordPushFailure(subscription.id);
			console.error(`push delivery failed (${status || 'network'})`);
		}
		return false;
	}
}

push.get('/config', async (c) => c.json({ available: true, publicKey: (await vapidKeys()).publicKey }));

push.post('/subscription', async (c) => {
	const body = pushBody(await c.req.json().catch(() => null));
	if (!body) return c.json({ error: 'valid subscription, time zone and lead time required' }, 400);
	const subscription = await upsertPushSubscription({ userId: c.get('userId'), ...body });
	if (!subscription) return c.json({ error: 'subscription belongs to another account' }, 409);
	return c.json({ ok: true });
});

push.delete('/subscription', async (c) => {
	const body = (await c.req.json().catch(() => null)) as { endpoint?: unknown } | null;
	if (typeof body?.endpoint !== 'string') return c.json({ error: 'endpoint required' }, 400);
	await deletePushSubscription(c.get('userId'), body.endpoint);
	return c.json({ ok: true });
});

push.post('/test', async (c) => {
	const body = (await c.req.json().catch(() => null)) as { endpoint?: unknown } | null;
	if (typeof body?.endpoint !== 'string') return c.json({ error: 'endpoint required' }, 400);
	const rows = (await pushSubscriptionsForUser(c.get('userId'))).filter((row) => row.endpoint === body.endpoint);
	if (!rows.length) return c.json({ error: 'notifications are not enabled on this device' }, 404);
	const results = await Promise.all(rows.map((row) => sendPush(row, {
		title: 'Tohab notifications are ready',
		body: 'Task reminders will appear here.',
		url: '/tasks',
		badge: 0
	})));
	if (!results.some(Boolean)) {
		return c.json({ error: 'The push service could not deliver the test notification. Disable and re-enable notifications, then try again.' }, 502);
	}
	return c.json({ ok: true });
});

let pushRunActive = false;
export async function runPushReminders(now = Date.now()) {
	if (pushRunActive) return;
	pushRunActive = true;
	try {
		const subscriptions = await allPushSubscriptions();
		const tasksByUser = new Map<string, ReminderTask[]>();
		for (const subscription of subscriptions) {
			let tasks = tasksByUser.get(subscription.userId);
			if (!tasks) {
				tasks = (await liveDocs(subscription.userId, 'tasks')).map((row) => row.data as unknown as ReminderTask);
				tasksByUser.set(subscription.userId, tasks);
			}
			const openCount = tasks.filter((task) => !task.done && !task._deleted).length;
			for (const task of tasks) {
				const reminder = reminderForTask(task, subscription.timeZone, subscription.leadMinutes, now);
				if (!reminder || !await claimPushReminder(subscription.id, task.id, reminder.key)) continue;
				const sent = await sendPush(subscription, {
					title: reminder.title,
					body: `Due at ${task.dueTime}`,
					url: '/tasks',
					badge: openCount,
					tag: reminder.key
				});
				if (!sent) await releasePushReminder(subscription.id, reminder.key);
			}
		}
		await prunePushReminders(now - 90 * 24 * 60 * 60 * 1000);
	} finally {
		pushRunActive = false;
	}
}

app.route('/auth', auth);
app.route('/sync', sync);
app.route('/calendar', calendar);
app.route('/push', push);
app.get('/', (c) => c.text('tohab sync server'));

await ensureSchema();
await vapidKeys();
void runPushReminders().catch((error) => console.error('push reminder scan failed', error));
const pushTimer = setInterval(() => {
	void runPushReminders().catch((error) => console.error('push reminder scan failed', error));
}, 60_000);
pushTimer.unref();

serve({ fetch: app.fetch, port: PORT }, (info) => {
	console.log(`tohab sync server listening on http://localhost:${info.port}/sync`);
});
