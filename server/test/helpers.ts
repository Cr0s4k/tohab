/**
 * Tests need several accounts, but registration closes after the first one. Rather than put a
 * bypass in the auth path, they mint users straight into the database and then sign in over
 * HTTP like a browser would, so the session cookie under test is a real one.
 */
import { and, eq, like } from 'drizzle-orm';
import { closeDb, db } from '../src/db.ts';
import { createUser } from '../src/repositories/users.ts';
import { calendarPreferences, docs, pushReminders, pushSubscriptions, users } from '../src/schema.ts';
import { hashPassword } from '../src/auth.ts';

const EMAIL_SUFFIX = '@test.invalid';
const ROOT = (process.env.BASE ?? 'http://localhost:5178/sync').replace(/\/sync\/?$/, '');
const PASSWORD = 'test-password';

export type TestSession = { userId: string; email: string; password: string; cookie: string };

export async function signIn(label: string): Promise<TestSession> {
	const email = `${label}-${process.pid}${EMAIL_SUFFIX}`;
	const user = await createUser(email, await hashPassword(PASSWORD));

	const res = await fetch(`${ROOT}/auth/login`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password: PASSWORD })
	});
	if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);

	const cookie = res.headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');

	return { userId: user.id, email, password: PASSWORD, cookie };
}

/**
 * Leaves the database as the run found it. Without this, a test run would permanently close
 * registration on a development database, since the first account is the only one allowed.
 */
export async function cleanup() {
	const rows = await db
		.select({ id: users.id })
		.from(users)
		.where(like(users.email, `%${EMAIL_SUFFIX}`));

	for (const row of rows) {
		await db.delete(calendarPreferences).where(eq(calendarPreferences.userId, row.id));
		const subscriptions = await db
			.select({ id: pushSubscriptions.id })
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.userId, row.id));
		for (const subscription of subscriptions) {
			await db.delete(pushReminders).where(eq(pushReminders.subscriptionId, subscription.id));
		}
		await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, row.id));
		await db.delete(docs).where(eq(docs.userId, row.id));
		await db.delete(users).where(and(eq(users.id, row.id)));
	}

	await closeDb();
}
