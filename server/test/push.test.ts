import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reminderForTask, validPushEndpoint, validTimeZone, type ReminderTask } from '../src/push.ts';
import { createApp } from '../src/app.ts';
import { pushReminders, pushSubscriptions } from '../src/schema.ts';

const task: ReminderTask = {
	id: 'task-1',
	title: 'Call Omaar',
	due: '2026-08-23',
	dueTime: '16:30',
	done: false
};

assert.equal(validTimeZone('Europe/Madrid'), true);
assert.equal(validTimeZone('Not/AZone'), false);
assert.equal(validPushEndpoint('https://fcm.googleapis.com/example'), true);
assert.equal(validPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/example'), true);
assert.equal(validPushEndpoint('https://web.push.apple.com/Qexample'), true);
assert.equal(validPushEndpoint('https://wns2-db5p.notify.windows.com/w/example'), true);
assert.equal(validPushEndpoint('https://push.attacker.example/endpoint'), false, 'only browser-owned push services are accepted');
assert.equal(validPushEndpoint('http://push.example/test'), false);
assert.equal(validPushEndpoint('https://localhost/push'), false);
assert.equal(validPushEndpoint('https://127.0.0.1/push'), false);
assert.equal(validPushEndpoint('https://192.168.1.2/push'), false);
assert.equal(validPushEndpoint('https://user:pass@push.example/push'), false);

const madrid = reminderForTask(task, 'Europe/Madrid', 10, Date.parse('2026-08-23T14:20:30Z'));
assert.ok(madrid, 'a reminder is due in its delivery window');
assert.equal(madrid?.dueAt, Date.parse('2026-08-23T14:30:00Z'));
assert.equal(madrid?.notifyAt, Date.parse('2026-08-23T14:20:00Z'));
assert.equal(madrid?.key, 'task-1:2026-08-23T16:30:Europe/Madrid:10');
assert.equal(reminderForTask(task, 'Europe/Madrid', 10, Date.parse('2026-08-23T14:10:00Z')), null);
assert.ok(reminderForTask(task, 'Europe/Madrid', 10, Date.parse('2026-08-23T14:35:00Z')), 'a short server outage delivers the reminder late rather than losing it');
assert.equal(reminderForTask(task, 'Europe/Madrid', 10, Date.parse('2026-08-23T14:46:00Z')), null, 'stale reminders are not delivered');
assert.equal(reminderForTask({ ...task, done: true }, 'Europe/Madrid', 10, Date.parse('2026-08-23T14:20:30Z')), null);
assert.equal(reminderForTask({ ...task, dueTime: '' }, 'Europe/Madrid', 10, Date.parse('2026-08-23T14:20:30Z')), null);
assert.equal(reminderForTask(task, 'Europe/Madrid', -1, Date.parse('2026-08-23T14:30:00Z')), null, 'automatic reminders can be disabled');
assert.equal(reminderForTask({ ...task, reminderMinutes: -1 }, 'Europe/Madrid', 10, Date.parse('2026-08-23T14:20:30Z')), null, 'a task can disable its inherited reminder');
assert.equal(reminderForTask({ ...task, reminderMinutes: 30 }, 'Europe/Madrid', 10, Date.parse('2026-08-23T14:00:30Z'))?.notifyAt, Date.parse('2026-08-23T14:00:00Z'), 'a task can override the automatic lead time');
assert.equal(reminderForTask({ ...task, reminderMinutes: 0 }, 'Europe/Madrid', -1, Date.parse('2026-08-23T14:30:00Z'))?.notifyAt, Date.parse('2026-08-23T14:30:00Z'), 'a task can remind at its due time even when automatic reminders are off');

const winter: ReminderTask = { ...task, due: '2026-12-23' };
const winterReminder = reminderForTask(winter, 'Europe/Madrid', 10, Date.parse('2026-12-23T15:20:10Z'));
assert.equal(winterReminder?.dueAt, Date.parse('2026-12-23T15:30:00Z'), 'DST offset is derived from the requested date');

assert.ok(pushSubscriptions);
assert.ok(pushReminders);
const response = await createApp().request('/');
assert.equal(response.status, 200);
assert.equal(await response.text(), 'tohab sync server');
const pushResponse = await createApp().request('/push/config');
assert.equal(pushResponse.status, 401, 'push routes are mounted and protected');
const syncResponse = await createApp().request('/sync/status');
assert.equal(syncResponse.status, 401, 'sync routes are mounted and protected');

const compose = readFileSync(new URL('../../docker-compose.yml', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
assert.match(compose, /VAPID_SUBJECT:\s*\$\{VAPID_SUBJECT:-\}/, 'Compose forwards the configured VAPID contact identity');
assert.match(envExample, /^VAPID_SUBJECT=/m, 'the example environment documents the VAPID subject');
assert.match(readme, /Apple.*\.local|\.local.*Apple/is, 'deployment docs warn that Apple rejects local VAPID identities');

console.log('ok push reminder scheduling');
