import { Hono } from 'hono';
import { requireAuth, type AuthedEnv } from '../auth.ts';
import {
	calendarAlarmMinutes,
	knownUsers,
	liveDocs,
	persistedSecret,
	setCalendarAlarmMinutes
} from '../db.ts';
import {
	buildCalendar,
	feedToken,
	publicCalendarFeedUrl,
	resolveFeedToken,
	type FeedTask
} from '../ics.ts';

const DEFAULT_ALARM_MINUTES = 10;
const CALENDAR_PUBLIC_BASE_URL = process.env.CALENDAR_PUBLIC_BASE_URL;

if (CALENDAR_PUBLIC_BASE_URL) {
	void publicCalendarFeedUrl(CALENDAR_PUBLIC_BASE_URL, 'configuration-check');
}

function calendarSecret(): Promise<string> {
	return process.env.CALENDAR_SECRET
		? Promise.resolve(process.env.CALENDAR_SECRET)
		: persistedSecret('calendar');
}

export function createCalendarRoutes() {
	const calendar = new Hono<AuthedEnv>();

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

	/** The unguessable token in the URL is the credential for calendar clients. */
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
		c.header('cache-control', 'private, max-age=300');
		return c.body(body);
	});

	return calendar;
}
