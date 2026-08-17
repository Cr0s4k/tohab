import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, asc, count, eq, gt, max, or, sql, sum } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { docs, revs, type DocRow } from './schema.ts';

const FILE = process.env.TOHAB_DB ?? './data/tohab.sqlite';

if (FILE !== ':memory:') mkdirSync(dirname(FILE), { recursive: true });

const sqlite = new Database(FILE);
sqlite.pragma('journal_mode = WAL');

// Schema lives in schema.ts and is applied by `drizzle-kit push`, so fail loudly here
// rather than letting every request 500 on a database that was never set up.
const tables = sqlite.pragma('table_list') as { name: string }[];
if (!tables.some((t) => t.name === 'docs')) {
	console.error(
		`No schema in ${FILE}. Run \`pnpm db:push\` (or \`pnpm db:reset\` to start clean) first.`
	);
	process.exit(1);
}

export const db = drizzle(sqlite, { schema: { docs, revs } });
export type { DocRow };

export const COLLECTIONS = new Set(['tasks', 'projects', 'habits', 'habitLogs']);

/**
 * A server-owned monotonic revision per user. Pull checkpoints ride on this rather than
 * on client clocks, so a device with a skewed clock can never make the cursor skip
 * documents that have not been replicated yet.
 */
export function nextRev(userId: string): number {
	const [row] = db
		.insert(revs)
		.values({ userId, value: 1 })
		.onConflictDoUpdate({
			target: revs.userId,
			set: { value: sql`${revs.value} + 1` }
		})
		.returning({ value: revs.value })
		.all();
	return row.value;
}

export function docsSince(
	userId: string,
	collection: string,
	cursor: number,
	id: string,
	limit: number
): DocRow[] {
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
		.limit(limit)
		.all();
}

export function getDoc(userId: string, collection: string, id: string): DocRow | undefined {
	return db
		.select()
		.from(docs)
		.where(and(eq(docs.userId, userId), eq(docs.collection, collection), eq(docs.id, id)))
		.get();
}

/**
 * `updatedAt` is the client's own clock and travels with the document as data.
 * `receivedAt` is stamped here from the server clock, giving one trustworthy timeline
 * for auditing and debugging regardless of how wrong any device's clock is.
 */
export function writeDoc(userId: string, collection: string, doc: Record<string, unknown>) {
	const row = {
		userId,
		collection,
		id: String(doc.id),
		rev: nextRev(userId),
		deleted: Boolean(doc._deleted),
		updatedAt: Number(doc.updatedAt ?? 0),
		receivedAt: Date.now(),
		data: { ...doc, _deleted: Boolean(doc._deleted) }
	};

	db.insert(docs)
		.values(row)
		.onConflictDoUpdate({
			target: [docs.userId, docs.collection, docs.id],
			set: {
				rev: row.rev,
				deleted: row.deleted,
				updatedAt: row.updatedAt,
				receivedAt: row.receivedAt,
				data: row.data
			}
		})
		.run();
}

export function rowToDoc(row: DocRow): Record<string, unknown> {
	return { ...row.data, _deleted: row.deleted };
}

export function transaction<T>(fn: () => T): T {
	return db.transaction(fn);
}

export function stats(userId: string) {
	return db
		.select({
			collection: docs.collection,
			total: count(),
			deleted: sum(docs.deleted).mapWith(Number),
			lastReceivedAt: max(docs.receivedAt),
			lastClientUpdatedAt: max(docs.updatedAt)
		})
		.from(docs)
		.where(eq(docs.userId, userId))
		.groupBy(docs.collection)
		.all();
}

/**
 * How far each collection's newest client timestamp drifts from the server's own clock.
 * A large positive skew means some device's clock runs ahead; useful when diagnosing
 * "why did my edit look older than it should".
 */
export function clockSkew(userId: string) {
	const now = Date.now();
	return stats(userId).map((row) => ({
		collection: row.collection,
		skewMs: row.lastClientUpdatedAt ? row.lastClientUpdatedAt - now : 0
	}));
}
