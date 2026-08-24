import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, count, eq, gt, lt, max, or, sql } from 'drizzle-orm';
import {
	calendarPreferences,
	docs,
	pushReminders,
	pushSubscriptions,
	secrets,
	users,
	type DocRow,
	type PushSubscriptionRow,
	type UserRow
} from './schema.ts';
import { randomBytes, randomUUID } from 'node:crypto';

const CONNECTION = process.env.DATABASE_URL ?? 'postgresql://tohab:tohab@localhost:5432/tohab';

const pool = new Pool({ connectionString: CONNECTION, max: 10 });

const schema = { calendarPreferences, docs, pushReminders, pushSubscriptions, secrets, users };
export const db = drizzle(pool, { schema });
export type { DocRow, PushSubscriptionRow, UserRow };

/**
 * Every query runs either on the pool or inside a transaction. With a pool those are
 * different connections, so a transaction's work has to be threaded through explicitly
 * rather than reaching for the module-level `db`.
 */
export type Executor =
	| NodePgDatabase<typeof schema>
	| Parameters<Parameters<typeof db.transaction>[0]>[0];

export const COLLECTIONS = new Set(['tasks', 'projects', 'habits', 'habitLogs', 'activity']);

/** Schema lives in schema.ts and is applied by `drizzle-kit push`. Fail loudly if absent. */
export async function ensureSchema() {
	const { rows } = await pool.query(
		`SELECT to_regclass('public.docs') IS NOT NULL
		    AND to_regclass('public.calendar_preferences') IS NOT NULL
		    AND to_regclass('public.secrets') IS NOT NULL
		    AND to_regclass('public.users') IS NOT NULL
		    AND to_regclass('public.push_subscriptions') IS NOT NULL
		    AND to_regclass('public.push_reminders') IS NOT NULL AS ok`
	);
	if (!rows[0]?.ok) {
		console.error(
			`No schema in ${CONNECTION.replace(/:[^:@]*@/, ':***@')}. Run \`pnpm db:push\` first.`
		);
		process.exit(1);
	}
}

/**
 * Reads a persisted secret, minting one on first use. The insert races harmlessly between
 * replicas: whoever loses the conflict re-reads the winner's value rather than its own.
 */
export async function persistedGenerated(key: string, generate: () => string): Promise<string> {
	const [existing] = await db.select().from(secrets).where(eq(secrets.key, key)).limit(1);
	if (existing) return existing.value;

	const value = generate();
	await db.insert(secrets).values({ key, value }).onConflictDoNothing();
	const [row] = await db.select().from(secrets).where(eq(secrets.key, key)).limit(1);
	return row?.value ?? value;
}

export function persistedSecret(key: string): Promise<string> {
	return persistedGenerated(key, () => randomBytes(32).toString('hex'));
}

/** Every account id, for resolving opaque calendar feed tokens back to their owner. */
export async function knownUsers(): Promise<string[]> {
	const rows = await db.select({ id: users.id }).from(users);
	return rows.map((row) => row.id);
}

export async function calendarAlarmMinutes(userId: string): Promise<number | undefined> {
	const [row] = await db
		.select({ alarmMinutes: calendarPreferences.alarmMinutes })
		.from(calendarPreferences)
		.where(eq(calendarPreferences.userId, userId))
		.limit(1);
	return row?.alarmMinutes;
}

export async function setCalendarAlarmMinutes(userId: string, alarmMinutes: number): Promise<void> {
	const updatedAt = Date.now();
	await db
		.insert(calendarPreferences)
		.values({ userId, alarmMinutes, updatedAt })
		.onConflictDoUpdate({
			target: calendarPreferences.userId,
			set: { alarmMinutes, updatedAt }
		});
}

export async function userCount(): Promise<number> {
	const [row] = await db.select({ total: count() }).from(users);
	return row?.total ?? 0;
}

export async function userById(id: string): Promise<UserRow | undefined> {
	const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	return row;
}

export async function userByEmail(email: string): Promise<UserRow | undefined> {
	const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
	return row;
}

/**
 * Registration is open only until the first account exists, so the insert races with itself
 * at most once. `onConflictDoNothing` plus a re-read means the loser reports the winner's
 * account rather than creating a second one.
 */
export async function createUser(email: string, passwordHash: string): Promise<UserRow> {
	const inserted = await db
		.insert(users)
		.values({ id: randomUUID(), email, passwordHash, createdAt: Date.now() })
		.onConflictDoNothing()
		.returning();
	if (inserted[0]) return inserted[0];

	const existing = await userByEmail(email);
	if (!existing) throw new Error('could not create user');
	return existing;
}

export async function liveDocs(userId: string, collection: string): Promise<DocRow[]> {
	return db
		.select()
		.from(docs)
		.where(
			and(eq(docs.userId, userId), eq(docs.collection, collection), eq(docs.deleted, false))
		);
}

export function docsSince(
	userId: string,
	collection: string,
	cursor: number,
	id: string,
	limit: number
): Promise<DocRow[]> {
	return db
		.select()
		.from(docs)
		.where(
			and(
				eq(docs.userId, userId),
				eq(docs.collection, collection),
				or(gt(docs.rev, cursor), and(eq(docs.rev, cursor), gt(docs.id, id)))
			)
		)
		.orderBy(asc(docs.rev), asc(docs.id))
		.limit(limit);
}

/**
 * Reads the master row for a conflict check, locking it for the rest of the transaction.
 * Without the lock two pooled connections can both pass the `assumedMasterState` gate on
 * the same base state and the second write silently overwrites the first — a lost update
 * the losing client never hears about. Under READ COMMITTED the blocked reader re-reads the
 * committed row once the lock is released, so it correctly sees the conflict.
 */
export async function getDocForUpdate(
	tx: Executor,
	userId: string,
	collection: string,
	id: string
): Promise<DocRow | undefined> {
	const [row] = await tx
		.select()
		.from(docs)
		.where(and(eq(docs.userId, userId), eq(docs.collection, collection), eq(docs.id, id)))
		.limit(1)
		.for('update');
	return row;
}

/**
 * `updatedAt` is the client's own clock and travels with the document as data.
 * `receivedAt` is stamped here from the server clock, giving one trustworthy timeline
 * for auditing and debugging regardless of how wrong any device's clock is.
 */
export async function writeDoc(
	tx: Executor,
	userId: string,
	collection: string,
	doc: Record<string, unknown>
) {
	const deleted = Boolean(doc._deleted);

	await tx
		.insert(docs)
		.values({
			userId,
			collection,
			id: String(doc.id),
			rev: sql<number>`nextval('docs_rev')`,
			deleted,
			updatedAt: Number(doc.updatedAt ?? 0),
			receivedAt: Date.now(),
			data: { ...doc, _deleted: deleted }
		})
		.onConflictDoUpdate({
			target: [docs.userId, docs.collection, docs.id],
			set: {
				rev: sql`excluded.rev`,
				deleted,
				updatedAt: Number(doc.updatedAt ?? 0),
				receivedAt: Date.now(),
				data: { ...doc, _deleted: deleted }
			}
		});
}

export function rowToDoc(row: DocRow): Record<string, unknown> {
	return { ...row.data, _deleted: row.deleted };
}

export function transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
	return db.transaction(fn);
}

export async function stats(userId: string) {
	const rows = await db
		.select({
			collection: docs.collection,
			total: count(),
			// sum() over a boolean is invalid in Postgres, unlike SQLite's integer booleans.
			deleted: sql<number>`count(*) filter (where ${docs.deleted})`.mapWith(Number),
			lastReceivedAt: max(docs.receivedAt),
			lastClientUpdatedAt: max(docs.updatedAt)
		})
		.from(docs)
		.where(eq(docs.userId, userId))
		.groupBy(docs.collection);

	// pg returns bigint as a string; coerce so callers can do arithmetic on these.
	return rows.map((row) => ({
		...row,
		lastReceivedAt: Number(row.lastReceivedAt ?? 0),
		lastClientUpdatedAt: Number(row.lastClientUpdatedAt ?? 0)
	}));
}

/**
 * How far each collection's newest client timestamp drifts from the server's own clock.
 * A large positive skew means some device's clock runs ahead; useful when diagnosing
 * "why did my edit look older than it should".
 */
export async function clockSkew(userId: string) {
	const now = Date.now();
	const rows = await stats(userId);
	return rows.map((row) => ({
		collection: row.collection,
		skewMs: row.lastClientUpdatedAt ? row.lastClientUpdatedAt - now : 0
	}));
}

export async function upsertPushSubscription(input: {
	userId: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	timeZone: string;
	leadMinutes: number;
}): Promise<PushSubscriptionRow | null> {
	const now = Date.now();
	const inserted = await db
		.insert(pushSubscriptions)
		.values({ id: randomUUID(), ...input, createdAt: now, updatedAt: now })
		.onConflictDoNothing({ target: pushSubscriptions.endpoint })
		.returning();
	if (inserted[0]) return inserted[0];

	const updated = await db
		.update(pushSubscriptions)
		.set({
			p256dh: input.p256dh,
			auth: input.auth,
			timeZone: input.timeZone,
			leadMinutes: input.leadMinutes,
			updatedAt: now
		})
		.where(and(eq(pushSubscriptions.endpoint, input.endpoint), eq(pushSubscriptions.userId, input.userId)))
		.returning();
	return updated[0] ?? null;
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
	const removed = await db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
		.returning({ id: pushSubscriptions.id });
	for (const row of removed) await db.delete(pushReminders).where(eq(pushReminders.subscriptionId, row.id));
}

export async function deletePushSubscriptionById(id: string): Promise<void> {
	await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
	await db.delete(pushReminders).where(eq(pushReminders.subscriptionId, id));
}

export function allPushSubscriptions(): Promise<PushSubscriptionRow[]> {
	return db.select().from(pushSubscriptions);
}

export function pushSubscriptionsForUser(userId: string): Promise<PushSubscriptionRow[]> {
	return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

export async function recordPushSuccess(id: string): Promise<void> {
	await db
		.update(pushSubscriptions)
		.set({ lastSuccessAt: Date.now(), failureCount: 0 })
		.where(eq(pushSubscriptions.id, id));
}

export async function recordPushFailure(id: string): Promise<void> {
	await db
		.update(pushSubscriptions)
		.set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
		.where(eq(pushSubscriptions.id, id));
}

export async function claimPushReminder(subscriptionId: string, taskId: string, reminderKey: string): Promise<boolean> {
	// The unique key is claimed before contacting the push service. This coordinates replicas
	// and intentionally favours at-most-once delivery if the process crashes after claiming.
	const claimed = await db
		.insert(pushReminders)
		.values({ subscriptionId, taskId, reminderKey, sentAt: Date.now() })
		.onConflictDoNothing()
		.returning({ subscriptionId: pushReminders.subscriptionId });
	return claimed.length === 1;
}

export async function releasePushReminder(subscriptionId: string, reminderKey: string): Promise<void> {
	await db
		.delete(pushReminders)
		.where(and(eq(pushReminders.subscriptionId, subscriptionId), eq(pushReminders.reminderKey, reminderKey)));
}

export async function prunePushReminders(before: number): Promise<void> {
	await db.delete(pushReminders).where(lt(pushReminders.sentAt, before));
}

export function closeDb() {
	return pool.end();
}
