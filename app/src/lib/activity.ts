import { getDb } from './db/lazy.ts';
import type { Db } from './db/index.ts';
import type { Activity, ActivityEntity, ActivityVerb } from './db/schemas.ts';
import { markLocalWrite } from './db/syncState.svelte.ts';
import { now, uid } from './ids.ts';
import {
	decodeChanges,
	encodeChanges,
	mergeChanges,
	revertPlan,
	type DocChange
} from './activityLog.ts';

export * from './activityLog.ts';

/**
 * The log replicates like every other collection, so it cannot be allowed to grow forever.
 * Oldest entries are dropped once the cap is passed.
 */
export const ACTIVITY_LIMIT = 200;

/** Repeated taps on the same thing — a habit counter climbing — record as one entry. */
const COALESCE_MS = 10_000;

export function activityQuery(db: Db, limit = ACTIVITY_LIMIT) {
	return db.activity.find({ sort: [{ at: 'desc' }], limit });
}

export function activityCountQuery(db: Db) {
	return db.activity.count();
}

export type RecordInput = {
	entity: ActivityEntity;
	entityId: string;
	verb: ActivityVerb;
	subject: string;
	detail?: string;
	changes: DocChange[];
	coalesce?: boolean;
};

async function coalesceTarget(db: Db, input: RecordInput, at: number) {
	if (!input.coalesce) return null;
	const [latest] = await db.activity.find({ sort: [{ at: 'desc' }], limit: 1 }).exec();
	if (!latest || latest.revertedAt !== 0) return null;
	if (at - latest.at > COALESCE_MS) return null;
	if (latest.entity !== input.entity) return null;
	if (latest.entityId !== input.entityId) return null;
	if (latest.verb !== input.verb) return null;
	return latest;
}

async function prune(db: Db) {
	const total = await db.activity.count().exec();
	if (total <= ACTIVITY_LIMIT) return;
	const stale = await db.activity
		.find({ sort: [{ at: 'asc' }], limit: total - ACTIVITY_LIMIT })
		.exec();
	await Promise.all(stale.map((d) => d.remove()));
}

/**
 * Records one user action. Returns the entry id so a caller can offer the immediate undo
 * toast and the history screen's revert through the same code path, or '' if the entry could
 * not be written — losing a history entry must never fail the change it was describing.
 */
export async function record(input: RecordInput): Promise<string> {
	try {
		return await write(input);
	} catch (err) {
		console.warn('activity entry could not be recorded', err);
		return '';
	}
}

async function write(input: RecordInput): Promise<string> {
	const db = await getDb();
	const at = now();

	const target = await coalesceTarget(db, input, at);
	if (target) {
		await target.patch({
			at,
			subject: input.subject,
			detail: input.detail ?? '',
			changes: encodeChanges(mergeChanges(decodeChanges(target.changes), input.changes)),
			updatedAt: at
		});
		return target.id;
	}

	const doc: Activity = {
		id: uid(),
		at,
		entity: input.entity,
		entityId: input.entityId,
		verb: input.verb,
		subject: input.subject,
		detail: input.detail ?? '',
		changes: encodeChanges(input.changes),
		revertedAt: 0,
		updatedAt: at
	};
	await db.activity.insert(doc);
	await prune(db);
	return doc.id;
}

/**
 * Puts every document an entry touched back the way it was. The entry is marked rather than
 * removed, and reverting is not itself recorded — an entry that undid itself and then showed
 * up twice in the list is harder to read than one that says it was undone.
 */
export async function revertActivity(id: string): Promise<boolean> {
	const db = await getDb();
	const entry = await db.activity.findOne(id).exec();
	if (!entry || entry.revertedAt !== 0) return false;

	const ts = now();
	await applyRevert(decodeChanges(entry.changes));
	await entry.patch({ revertedAt: ts, updatedAt: ts });
	return true;
}

/** Undo without an entry behind it — the fallback when recording the entry itself failed. */
export async function applyRevert(changes: DocChange[]) {
	const db = await getDb();
	const ts = now();
	const plan = revertPlan(changes);

	for (const { collection, doc } of plan.restore) {
		await db[collection].upsert({ ...doc, updatedAt: ts } as never);
	}
	for (const { collection, id } of plan.remove) {
		const doc = await db[collection].findOne(id).exec();
		await doc?.remove();
	}
	markLocalWrite();
}

/** Clears the history without touching the tasks and habits it describes. */
export async function clearActivity() {
	const db = await getDb();
	const entries = await db.activity.find().exec();
	await Promise.all(entries.map((d) => d.remove()));
	if (entries.length) markLocalWrite();
}
