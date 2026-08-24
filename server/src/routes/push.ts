import { Hono } from 'hono';
import { requireAuth, type AuthedEnv } from '../auth.ts';
import {
	deletePushSubscription,
	pushSubscriptionsForUser,
	upsertPushSubscription
} from '../db.ts';
import { validPushEndpoint, validTimeZone } from '../push.ts';
import { sendPush, vapidKeys } from '../pushService.ts';

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
	return {
		endpoint: value.endpoint,
		p256dh: value.keys.p256dh,
		auth: value.keys.auth,
		timeZone: value.timeZone,
		leadMinutes
	};
}

export function createPushRoutes() {
	const push = new Hono<AuthedEnv>();
	push.use('*', requireAuth);

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
		const rows = (await pushSubscriptionsForUser(c.get('userId')).then((subscriptions) =>
			subscriptions.filter((row) => row.endpoint === body.endpoint)
		));
		if (!rows.length) return c.json({ error: 'notifications are not enabled on this device' }, 404);
		const results = await Promise.all(rows.map((row) => sendPush(row, {
			title: 'Tohab notifications are ready',
			body: 'Task reminders will appear here.',
			url: '/tasks',
			badge: 0
		})));
		if (!results.some(Boolean)) {
			return c.json({
				error: 'The push service could not deliver the test notification. Disable and re-enable notifications, then try again.'
			}, 502);
		}
		return c.json({ ok: true });
	});

	return push;
}
