import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db, transaction, writeDoc } from '../src/db.ts';
import { calendarPreferences } from '../src/schema.ts';
import { cleanup, signIn } from './helpers.ts';

const ROOT = (process.env.BASE ?? 'http://localhost:5178/sync').replace(/\/sync\/?$/, '');
const session = await signIn('calendar-api');
const headers = { 'content-type': 'application/json', cookie: session.cookie };

try {
	const unauthorized = await fetch(`${ROOT}/calendar/settings`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ alarmMinutes: 60 })
	});
	assert.equal(unauthorized.status, 401);

	const tokenResponse = await fetch(`${ROOT}/calendar/token`, { headers });
	assert.equal(tokenResponse.status, 200);
	const { token, feedUrl } = await tokenResponse.json() as { token: string; feedUrl?: string };
	assert.ok(token);
	assert.ok(feedUrl === undefined || feedUrl.endsWith(`/${token}/tohab.ics`));
	await transaction((tx) => writeDoc(tx, session.userId, 'tasks', {
		id: 'calendar-task',
		title: 'Calendar task',
		notes: '',
		done: false,
		due: '2026-08-25',
		dueTime: '09:00',
		priority: 4,
		projectId: '',
		updatedAt: Date.now(),
		_deleted: false
	}));

	const stableUrl = `${ROOT}/calendar/${token}/tohab.ics`;
	const invalid = await fetch(`${ROOT}/calendar/settings`, {
		method: 'POST', headers, body: JSON.stringify({ alarmMinutes: 'later' })
	});
	assert.equal(invalid.status, 400);

	const updated = await fetch(`${ROOT}/calendar/settings`, {
		method: 'POST', headers, body: JSON.stringify({ alarmMinutes: 60 })
	});
	assert.equal(updated.status, 200);
	assert.deepEqual(await updated.json(), { alarmMinutes: 60 });

	const [stored] = await db
		.select()
		.from(calendarPreferences)
		.where(eq(calendarPreferences.userId, session.userId));
	assert.equal(stored?.alarmMinutes, 60);

	const feed = await fetch(stableUrl);
	assert.equal(feed.status, 200);
	assert.match(await feed.text(), /TRIGGER;RELATED=START:-PT60M/);

	const disabled = await fetch(`${ROOT}/calendar/settings`, {
		method: 'POST', headers, body: JSON.stringify({ alarmMinutes: 0 })
	});
	assert.equal(disabled.status, 200);
	const sameFeed = await fetch(stableUrl);
	assert.equal(sameFeed.status, 200);
	assert.doesNotMatch(await sameFeed.text(), /BEGIN:VALARM/);

	const tokenAgain = await fetch(`${ROOT}/calendar/token`, { headers });
	assert.equal((await tokenAgain.json() as { token: string }).token, token);

	console.log('ok stable calendar URL and server-side reminder settings');
} finally {
	await cleanup();
}
