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

// RxDB has no insertion-order sort. Remember the last activity write so entries created in
// the same millisecond still coalesce with the action immediately before them.
let lastWrittenActivityId: string | null = null;

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
	const remembered = lastWrittenActivityId
		? await db.activity.findOne(lastWrittenActivityId).exec()
		: null;
	const [latestByTime] = await db.activity.find({ sort: [{ at: 'desc' }], limit: 1 }).exec();
	const latest = remembered && (!latestByTime || remembered.at >= latestByTime.at) ? remembered : latestByTime;
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
		lastWrittenActivityId = target.id;
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
	lastWrittenActivityId = doc.id;
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
	// Undo must obey the same start-date constraint as editing. Include logs restored
	// by this action, and ignore logs the action is about to remove.
	if (plan.restore.some(({ collection }) => collection === 'habits')) {
		const logs = new Map((await db.habitLogs.find().exec()).map((log) => [log.id, log.toMutableJSON()]));
		for (const item of plan.remove) if (item.collection === 'habitLogs') logs.delete(item.id);
		for (const item of plan.restore) {
			if (item.collection === 'habitLogs') logs.set(String(item.doc.id), item.doc as never);
		}
		for (const { collection, doc } of plan.restore) {
			if (collection !== 'habits' || typeof doc.startDate !== 'string') continue;
			if ([...logs.values()].some((log) => log.habitId === doc.id && log.date < String(doc.startDate))) {
				throw new Error('Cannot undo this start date: an earlier day has an entry.');
			}
		}
	}

	for (const { collection, doc } of plan.restore) {
		const restored = { ...doc, updatedAt: ts };
		if (collection === 'habits' && !('startDate' in doc)) {
			const current = await db.habits.findOne(String(doc.id)).exec();
			if (current?.startDate) Object.assign(restored, { startDate: current.startDate });
		}
		if (collection === 'habits' && !('historyVersion' in doc)) {
			const current = await db.habits.findOne(String(doc.id)).exec();
			if (current?.historyVersion) Object.assign(restored, { historyVersion: current.historyVersion });
		}
		await db[collection].upsert(restored as never);
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
	lastWrittenActivityId = null;
	if (entries.length) markLocalWrite();
}
