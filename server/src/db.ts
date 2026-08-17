import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, count, eq, gt, max, or, sql } from 'drizzle-orm';
import { docs, type DocRow } from './schema.ts';

const CONNECTION = process.env.DATABASE_URL ?? 'postgresql://tohab:tohab@localhost:5432/tohab';

const pool = new Pool({ connectionString: CONNECTION, max: 10 });

const schema = { docs };
export const db = drizzle(pool, { schema });
export type { DocRow };

/**
 * Every query runs either on the pool or inside a transaction. With a pool those are
 * different connections, so a transaction's work has to be threaded through explicitly
 * rather than reaching for the module-level `db`.
 */
export type Executor =
	| NodePgDatabase<typeof schema>
	| Parameters<Parameters<typeof db.transaction>[0]>[0];

export const COLLECTIONS = new Set(['tasks', 'projects', 'habits', 'habitLogs']);

/** Schema lives in schema.ts and is applied by `drizzle-kit push`. Fail loudly if absent. */
export async function ensureSchema() {
	const { rows } = await pool.query(`SELECT to_regclass('public.docs') IS NOT NULL AS ok`);
	if (!rows[0]?.ok) {
		console.error(
			`No schema in ${CONNECTION.replace(/:[^:@]*@/, ':***@')}. Run \`pnpm db:push\` first.`
		);
		process.exit(1);
	}
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

export function closeDb() {
	return pool.end();
}
