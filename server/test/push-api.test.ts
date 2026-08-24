import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.ts';
import { claimPushReminder, releasePushReminder } from '../src/repositories/push.ts';
import { pushSubscriptions } from '../src/schema.ts';
import { cleanup, signIn } from './helpers.ts';

const ROOT = (process.env.BASE ?? 'http://localhost:5178/sync').replace(/\/sync\/?$/, '');
const session = await signIn('push-api');
const headers = { 'content-type': 'application/json', cookie: session.cookie };
const endpoint = `https://fcm.googleapis.com/fcm/send/test-${process.pid}`;

try {
	const unauthorized = await fetch(`${ROOT}/push/config`);
	assert.equal(unauthorized.status, 401);

	const config = await fetch(`${ROOT}/push/config`, { headers });
	assert.equal(config.status, 200);
	const configBody = await config.json() as { available?: boolean; publicKey?: string };
	assert.equal(configBody.available, true);
	assert.ok((configBody.publicKey?.length ?? 0) > 40);

	const privateEndpoint = await fetch(`${ROOT}/push/subscription`, {
		method: 'POST', headers,
		body: JSON.stringify({ endpoint: 'https://127.0.0.1/push', keys: { p256dh: 'a'.repeat(32), auth: 'b'.repeat(16) }, timeZone: 'Europe/Madrid', leadMinutes: 30 })
	});
	assert.equal(privateEndpoint.status, 400);

	const subscribed = await fetch(`${ROOT}/push/subscription`, {
		method: 'POST', headers,
		body: JSON.stringify({ endpoint, keys: { p256dh: 'a'.repeat(32), auth: 'b'.repeat(16) }, timeZone: 'Europe/Madrid', leadMinutes: 30 })
	});
	assert.equal(subscribed.status, 200);
	const [stored] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
	assert.equal(stored?.userId, session.userId);
	assert.equal(stored?.timeZone, 'Europe/Madrid');
	assert.equal(stored?.leadMinutes, 30);
	assert.equal(stored?.failureCount, 0);
	assert.equal(stored?.lastSuccessAt, 0);

	const testPush = await fetch(`${ROOT}/push/test`, {
		method: 'POST', headers, body: JSON.stringify({ endpoint })
	});
	assert.equal(testPush.status, 502);
	assert.match((await testPush.json() as { error: string }).error, /could not deliver/);

	const other = await signIn('push-api-other');
	const stolen = await fetch(`${ROOT}/push/subscription`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', cookie: other.cookie },
		body: JSON.stringify({ endpoint, keys: { p256dh: 'c'.repeat(32), auth: 'd'.repeat(16) }, timeZone: 'UTC', leadMinutes: 60 })
	});
	assert.equal(stolen.status, 409, 'another account cannot claim an existing endpoint');
	const [stillOwned] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
	assert.equal(stillOwned?.userId, session.userId);

	const claims = await Promise.all([
		claimPushReminder(stored!.id, 'task-claim', 'claim-key'),
		claimPushReminder(stored!.id, 'task-claim', 'claim-key')
	]);
	assert.deepEqual(claims.sort(), [false, true], 'only one concurrent reminder worker claims delivery');
	await releasePushReminder(stored!.id, 'claim-key');

	const removed = await fetch(`${ROOT}/push/subscription`, {
		method: 'DELETE', headers, body: JSON.stringify({ endpoint })
	});
	assert.equal(removed.status, 200);
	assert.equal((await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))).length, 0);

	console.log('ok authenticated push subscription lifecycle');
} finally {
	await cleanup();
}
