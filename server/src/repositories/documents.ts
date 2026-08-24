import { and, asc, eq, gt, max, or, sql } from 'drizzle-orm';
import { db, type Executor } from '../db.ts';
import { docs, type DocRow } from '../schema.ts';

export const COLLECTIONS = new Set(['tasks', 'projects', 'habits', 'habitLogs', 'activity']);

export async function liveDocs(userId: string, collection: string): Promise<DocRow[]> {
	return db
		.select()
		.from(docs)
		.where(and(eq(docs.userId, userId), eq(docs.collection, collection), eq(docs.deleted, false)));
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

/** Locks the master row so concurrent assumed-state checks cannot both win. */
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

export async function stats(userId: string) {
	const rows = await db
		.select({
			collection: docs.collection,
			total: sql<number>`count(*)`.mapWith(Number),
			deleted: sql<number>`count(*) filter (where ${docs.deleted})`.mapWith(Number),
			lastReceivedAt: max(docs.receivedAt),
			lastClientUpdatedAt: max(docs.updatedAt)
		})
		.from(docs)
		.where(eq(docs.userId, userId))
		.groupBy(docs.collection);

	return rows.map((row) => ({
		...row,
		lastReceivedAt: Number(row.lastReceivedAt ?? 0),
		lastClientUpdatedAt: Number(row.lastClientUpdatedAt ?? 0)
	}));
}

export async function clockSkew(userId: string) {
	const now = Date.now();
	const rows = await stats(userId);
	return rows.map((row) => ({
		collection: row.collection,
		skewMs: row.lastClientUpdatedAt ? row.lastClientUpdatedAt - now : 0
	}));
}
