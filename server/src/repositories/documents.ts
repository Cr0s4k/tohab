import { and, asc, eq, gt, max, or, sql } from 'drizzle-orm';
import { db, type Executor } from '../db.ts';
import {
	calendarPublications,
	docs,
	type CalendarPublicationRow,
	type DocRow
} from '../schema.ts';

export const COLLECTIONS = new Set(['tasks', 'projects', 'habits', 'habitRevisions', 'habitLogs', 'activity']);

export async function liveDocs(userId: string, collection: string): Promise<DocRow[]> {
	return db
		.select()
		.from(docs)
		.where(and(eq(docs.userId, userId), eq(docs.collection, collection), eq(docs.deleted, false)));
}

/** Calendar needs task tombstones as well as live tasks so it can publish cancellations. */
export async function calendarDocs(userId: string): Promise<DocRow[]> {
	return db
		.select()
		.from(docs)
		.where(and(eq(docs.userId, userId), eq(docs.collection, 'tasks')));
}

export async function calendarPublicationDocs(userId: string): Promise<CalendarPublicationRow[]> {
	return db
		.select()
		.from(calendarPublications)
		.where(eq(calendarPublications.userId, userId));
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
	const id = String(doc.id);
	const receivedAt = Date.now();
	const previous = collection === 'tasks'
		? await getDocForUpdate(tx, userId, collection, id)
		: undefined;
	const [written] = await tx
		.insert(docs)
		.values({
			userId,
			collection,
			id,
			rev: sql<number>`nextval('docs_rev')`,
			deleted,
			updatedAt: Number(doc.updatedAt ?? 0),
			receivedAt,
			data: { ...doc, _deleted: deleted }
		})
		.onConflictDoUpdate({
			target: [docs.userId, docs.collection, docs.id],
			set: {
				rev: sql`excluded.rev`,
				deleted,
				updatedAt: Number(doc.updatedAt ?? 0),
				receivedAt,
				data: { ...doc, _deleted: deleted }
			}
		})
		.returning({ rev: docs.rev });

	if (collection === 'tasks') {
		await updateCalendarPublication(tx, userId, id, doc, previous, Number(written.rev), receivedAt);
	}

	return written;
}

function calendarEligible(doc: Record<string, unknown> | undefined): boolean {
	return Boolean(doc) && !Boolean(doc?._deleted) && !Boolean(doc?.done) && Boolean(doc?.due);
}

function taskSnapshot(doc: Record<string, unknown>): Record<string, unknown> {
	const snapshot: Record<string, unknown> = {
		id: String(doc.id),
		title: String(doc.title ?? ''),
		notes: String(doc.notes ?? ''),
		done: false,
		due: String(doc.due ?? ''),
		dueTime: String(doc.dueTime ?? ''),
		priority: Number(doc.priority ?? 4),
		projectId: String(doc.projectId ?? ''),
		updatedAt: Number(doc.updatedAt ?? 0)
	};
	if (typeof doc.repeat === 'string' && doc.repeat) snapshot.repeat = doc.repeat;
	if (typeof doc.recurrenceId === 'string' && doc.recurrenceId) snapshot.recurrenceId = doc.recurrenceId;
	return snapshot;
}

function clientLastModified(doc: Record<string, unknown>, fallback: number): number {
	const updatedAt = Number(doc.updatedAt ?? 0);
	return Number.isFinite(updatedAt) ? updatedAt : fallback;
}

async function updateCalendarPublication(
	tx: Executor,
	userId: string,
	taskId: string,
	doc: Record<string, unknown>,
	previous: DocRow | undefined,
	sequence: number,
	receivedAt: number
) {
	const [publication] = await tx
		.select()
		.from(calendarPublications)
		.where(and(eq(calendarPublications.userId, userId), eq(calendarPublications.taskId, taskId)))
		.limit(1)
		.for('update');

	if (calendarEligible(doc)) {
		const data = taskSnapshot(doc);
		await tx
			.insert(calendarPublications)
			.values({
				userId,
				taskId,
				active: true,
				sequence,
				publishedAt: publication?.publishedAt ?? receivedAt,
				changedAt: receivedAt,
				cancelledAt: 0,
				lastModified: clientLastModified(doc, receivedAt),
				data
			})
			.onConflictDoUpdate({
				target: [calendarPublications.userId, calendarPublications.taskId],
				set: {
					active: true,
					sequence,
					changedAt: receivedAt,
					cancelledAt: 0,
					lastModified: clientLastModified(doc, receivedAt),
					data
				}
			});
		return;
	}

	const wasEligible = calendarEligible(previous?.data);
	if (!publication?.active && !wasEligible) return;

	const data = publication?.data ?? (previous ? taskSnapshot(previous.data) : undefined);
	if (!data || !data.due) return;

	await tx
		.insert(calendarPublications)
		.values({
			userId,
			taskId,
			active: false,
			sequence,
			publishedAt: publication?.publishedAt ?? previous?.receivedAt ?? receivedAt,
			changedAt: receivedAt,
			cancelledAt: receivedAt,
			lastModified: clientLastModified(doc, receivedAt),
			data
		})
		.onConflictDoUpdate({
			target: [calendarPublications.userId, calendarPublications.taskId],
			set: {
				active: false,
				sequence,
				changedAt: receivedAt,
				cancelledAt: receivedAt,
				lastModified: clientLastModified(doc, receivedAt),
				data
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
