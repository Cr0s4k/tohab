import assert from 'node:assert/strict';
import { transaction } from '../src/db.ts';
import { writeDoc } from '../src/repositories/documents.ts';
import { cleanup, signIn } from './helpers.ts';

const ROOT = (process.env.BASE ?? 'http://localhost:5178/sync').replace(/\/sync\/?$/, '');
const session = await signIn('calendar-api');
const headers = { 'content-type': 'application/json', cookie: session.cookie };

try {
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
	const feed = await fetch(stableUrl);
	assert.equal(feed.status, 200);
	assert.doesNotMatch(await feed.text(), /BEGIN:VALARM/);

	const tokenAgain = await fetch(`${ROOT}/calendar/token`, { headers });
	assert.equal((await tokenAgain.json() as { token: string }).token, token);

	console.log('ok stable schedule-only calendar URL');
} finally {
	await cleanup();
}
