import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { transaction } from '../src/db.ts';
import { calendarPublicationDocs, writeDoc } from '../src/repositories/documents.ts';
import { cleanup, signIn } from './helpers.ts';

const ROOT = (process.env.BASE ?? 'http://localhost:5178/sync').replace(/\/sync\/?$/, '');
const session = await signIn('calendar-api');
const headers = { 'content-type': 'application/json', cookie: session.cookie };

async function writeTask(over: Record<string, unknown>) {
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
		_deleted: false,
		...over
	}));
}

async function feedBody(url: string) {
	const response = await fetch(url);
	assert.equal(response.status, 200);
	return { response, body: await response.text() };
}

function event(body: string, uid: string) {
	const block = body
		.split('BEGIN:VEVENT\r\n')
		.find((candidate) => candidate.includes(`UID:${uid}\r\n`));
	assert.ok(block, `missing event ${uid}`);
	return `BEGIN:VEVENT\r\n${block.split('END:VEVENT\r\n')[0]}END:VEVENT\r\n`;
}

function sequence(block: string) {
	const value = block.match(/\r\nSEQUENCE:(\d+)\r\n/)?.[1];
	assert.ok(value, 'event has no sequence');
	return Number(value);
}

function assertCancellation(body: string, uid: string, previous: string) {
	const cancelled = event(body, uid);
	assert.match(cancelled, /STATUS:CANCELLED/);
	assert.equal(body.split(`UID:${uid}\r\n`).length - 1, 1);
	assert.ok(sequence(cancelled) > sequence(previous));
	const schedule = (block: string) => block.split('\r\n')
		.filter((line) => /^(UID|DTSTART|DTEND|RRULE|RECURRENCE-ID)[:;]/.test(line));
	assert.deepEqual(schedule(cancelled), schedule(previous));
	return cancelled;
}

try {
	const tokenResponse = await fetch(`${ROOT}/calendar/token`, { headers });
	assert.equal(tokenResponse.status, 200);
	const { token, feedUrl } = await tokenResponse.json() as { token: string; feedUrl?: string };
	assert.ok(token);
	assert.ok(feedUrl === undefined || feedUrl.endsWith(`/${token}/tohab.ics`));
	const stableUrl = `${ROOT}/calendar/${token}/tohab.ics`;
	const tombstoneId = randomUUID();
	const tombstoneTitle = 'Never published monthly tombstone';
	await writeTask({
		id: tombstoneId,
		title: tombstoneTitle,
		due: '2026-08-30',
		repeat: 'month:1',
		_deleted: true
	});
	assert.equal(
		(await calendarPublicationDocs(session.userId)).some((row) => row.taskId === tombstoneId),
		false,
		'a first-seen tombstone must have no publication history'
	);
	const unpublished = await feedBody(stableUrl);
	assert.equal(unpublished.body.includes(`task-${tombstoneId}@tohab`), false, 'unpublished tombstone UID leaked');
	assert.equal(unpublished.body.includes(tombstoneTitle), false, 'unpublished tombstone title leaked');

	await writeTask({});
	const first = await feedBody(stableUrl);
	assert.doesNotMatch(first.body, /BEGIN:VALARM/);
	const firstEvent = event(first.body, 'task-calendar-task@tohab');
	assert.doesNotMatch(firstEvent, /STATUS:CANCELLED/);
	const firstSequence = sequence(firstEvent);
	assert.match(firstEvent, /DTSTART:20260825T090000/);
	assert.ok(first.response.headers.get('etag'));

	await writeTask({
		title: 'Calendar task updated',
		notes: 'changed',
		due: '2026-08-26',
		dueTime: '10:30',
		repeat: 'day:1',
		updatedAt: Date.now() + 1
	});
	const updated = await feedBody(stableUrl);
	const updatedEvent = event(updated.body, 'task-calendar-task@tohab');
	assert.equal(sequence(updatedEvent) > firstSequence, true);
	assert.match(updatedEvent, /SUMMARY:Calendar task updated/);
	assert.match(updatedEvent, /DTSTART:20260826T103000/);
	assert.match(updatedEvent, /RRULE:FREQ=DAILY/);

	await writeTask({
		done: true,
		completedAt: Date.now(),
		due: '2026-08-26',
		dueTime: '10:30',
		repeat: 'day:1',
		updatedAt: Date.now() + 2
	});
	const completed = await feedBody(stableUrl);
	const completedEvent = event(completed.body, 'task-calendar-task@tohab');
	assertCancellation(completed.body, 'task-calendar-task@tohab', updatedEvent);
	assert.match(completedEvent, /STATUS:CANCELLED/);
	assert.match(completedEvent, /DTSTART:20260826T103000/);
	assert.equal(completed.body.match(/UID:task-calendar-task@tohab\r\n/g)?.length, 1);
	assert.equal(sequence(completedEvent) > sequence(updatedEvent), true);

	await writeTask({
		id: 'cleared-calendar',
		title: 'Cleared date',
		due: '2026-08-27',
		dueTime: '11:15',
		repeat: 'week:1:1,3',
		recurrenceId: '20260827T111500',
		updatedAt: Date.now() + 3
	});
	const beforeClear = await feedBody(stableUrl);
	assert.match(beforeClear.body, /UID:task-cleared-calendar@tohab/);
	await writeTask({
		id: 'cleared-calendar',
		due: '',
		dueTime: '',
		repeat: '',
		recurrenceId: '',
		updatedAt: Date.now() + 4
	});
	const afterClear = await feedBody(stableUrl);
	const clearedEvent = event(afterClear.body, 'task-cleared-calendar@tohab');
	assertCancellation(afterClear.body, 'task-cleared-calendar@tohab', event(beforeClear.body, 'task-cleared-calendar@tohab'));
	assert.match(clearedEvent, /STATUS:CANCELLED/);
	assert.match(clearedEvent, /DTSTART:20260827T111500/);
	assert.match(clearedEvent, /DTEND:20260827T114500/);
	assert.match(clearedEvent, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE/);
	assert.match(clearedEvent, /RECURRENCE-ID:20260827T111500/);

	for (const [id, title] of [['test-30', 'Test 30'], ['do-that', 'Do that']] as const) {
		await writeTask({
			id, title, due: '2026-08-28', repeat: 'month:1',
			recurrenceId: '20260828T090000', updatedAt: Date.now() + 5
		});
		const beforeDelete = await feedBody(stableUrl);
		await writeTask({ id, _deleted: true, updatedAt: Date.now() + 6 });
		const afterDelete = await feedBody(stableUrl);
		assertCancellation(afterDelete.body, `task-${id}@tohab`, event(beforeDelete.body, `task-${id}@tohab`));
	}
	const deleted = await feedBody(stableUrl);
	for (const [id, title] of [['test-30', 'Test 30'], ['do-that', 'Do that']] as const) {
		const deletedEvent = event(deleted.body, `task-${id}@tohab`);
		assert.match(deletedEvent, /STATUS:CANCELLED/);
		assert.match(deletedEvent, new RegExp(`SUMMARY:${title}`));
	}

	await writeTask({ id: 'never-undated', due: '', _deleted: false, updatedAt: Date.now() + 7 });
	await writeTask({ id: 'never-undated', due: '', _deleted: true, updatedAt: Date.now() + 8 });
	await writeTask({ id: 'still-active', title: 'Still active', due: '2026-08-29', updatedAt: Date.now() + 9 });
	const final = await feedBody(stableUrl);
	assert.doesNotMatch(final.body, /UID:task-never-undated@tohab/);
	assert.match(final.body, /UID:task-calendar-task@tohab/);
	assert.match(final.body, /UID:task-cleared-calendar@tohab/);
	for (const uid of ['task-calendar-task@tohab', 'task-cleared-calendar@tohab', 'task-test-30@tohab', 'task-do-that@tohab']) {
		assert.equal(event(final.body, uid), event(deleted.body, uid), 'retained cancellation must stay unchanged');
	}
	assert.equal(final.body.includes(`task-${tombstoneId}@tohab`), false);
	assert.equal(final.body.includes(tombstoneTitle), false);
	const activeEvent = event(final.body, 'task-still-active@tohab');
	assert.doesNotMatch(activeEvent, /STATUS:CANCELLED/);
	const uids = final.body.match(/UID:[^\r\n]+/g) ?? [];
	assert.equal(uids.length, new Set(uids).size);
	assert.equal(final.body.startsWith('BEGIN:VCALENDAR\r\n'), true);
	assert.equal(final.body.endsWith('END:VCALENDAR\r\n'), true);
	assert.equal(final.body.split('\r\n').filter(Boolean).every((line) => Buffer.byteLength(line) <= 75), true);

	const repeat = await feedBody(stableUrl);
	assert.equal(repeat.response.headers.get('etag'), final.response.headers.get('etag'));
	const cached = await fetch(stableUrl, {
		headers: { 'if-none-match': final.response.headers.get('etag')! }
	});
	assert.equal(cached.status, 304);

	const tokenAgain = await fetch(`${ROOT}/calendar/token`, { headers });
	assert.equal((await tokenAgain.json() as { token: string }).token, token);

	console.log('ok stable schedule-only calendar URL');
} finally {
	await cleanup();
}
