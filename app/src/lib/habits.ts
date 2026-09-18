import { getDb } from './db/lazy.ts';
import type { Db } from './db/index.ts';
import type { Habit, HabitGoal, HabitLog, HabitKind, HabitRevision, ScheduleKind } from './db/schemas.ts';
import { markLocalWrite } from './db/syncState.svelte.ts';
import { HABIT_COLORS, habitStartDate, isPausedOn, logId, type LogMap } from './streaks.ts';
import { humanDay, isValidKey, today, type DayKey } from './dates.ts';
import {
	applyRevert,
	changeSummary,
	record,
	revertActivity,
	type DocChange,
	type RecordInput
} from './activity.ts';
import { now, uid } from './ids.ts';
import { habitEmoji } from './habitEmoji.ts';
import { queueUndo } from './undo.svelte.ts';
import { habitForEdit, habitOn, habitRules, RULE_FIELDS, ruleChangeDate, rulesEqual, withHabitHistory } from './habitHistory.ts';

export * from './streaks.ts';
export * from './habitHistory.ts';

async function recordWithUndo(input: RecordInput, label: string) {
	const entryId = await record(input);
	queueUndo({
		label,
		restore: async () => {
			if (entryId) await revertActivity(entryId);
			else await applyRevert(input.changes);
		}
	});
}

export function habitsQuery(db: Db, includeArchived = false) {
	const selector = includeArchived ? {} : { archived: false };
	return db.habits.find({ selector, sort: [{ createdAt: 'asc' }] });
}

export function habitQuery(db: Db, id: string) {
	return db.habits.findOne(id);
}

export function logsQuery(db: Db, habitId?: string) {
	return db.habitLogs.find(habitId ? { selector: { habitId } } : {});
}

export function revisionsQuery(db: Db, habitId?: string) {
	return db.habitRevisions.find(habitId ? { selector: { habitId } } : {});
}

export function toLogMap(logs: HabitLog[]): LogMap {
	return new Map(logs.map((l) => [l.date, l.value]));
}

export function groupLogs(logs: HabitLog[]): Map<string, LogMap> {
	const out = new Map<string, LogMap>();
	for (const l of logs) {
		let m = out.get(l.habitId);
		if (!m) out.set(l.habitId, (m = new Map()));
		m.set(l.date, l.value);
	}
	return out;
}

export type EditedLogMap = Map<DayKey, number>;

/** Keep edit metadata separate from value maps so streak and progress calculations stay numeric. */
export function groupEditedLogs(logs: HabitLog[]): Map<string, EditedLogMap> {
	const out = new Map<string, EditedLogMap>();
	for (const log of logs) {
		if (typeof log.editedAt !== 'number' || log.editedAt <= 0) continue;
		let dates = out.get(log.habitId);
		if (!dates) out.set(log.habitId, (dates = new Map()));
		dates.set(log.date, log.editedAt);
	}
	return out;
}

export type HabitInput = {
	startDate?: string;
	pauseFrom?: string;
	pauseUntil?: string;
	name: string;
	emoji: string;
	color: string;
	goal: HabitGoal;
	kind: HabitKind;
	target: number;
	unit: string;
	scheduleKind: ScheduleKind;
	weekdays: number[];
	timesPerWeek: number;
};

function normalizedPause(pauseUntil: string | undefined, pauseFrom?: string): { pauseFrom?: string; pauseUntil?: string } {
	const until = pauseUntil?.trim() ?? '';
	if (!until) return {};
	const from = pauseFrom?.trim() || today();
	if (!isValidKey(from) || !isValidKey(until)) throw new Error('Choose valid pause dates.');
	if (until < from) throw new Error('Pause end must be on or after its start.');
	return { pauseFrom: from, pauseUntil: until };
}

export async function createHabit(input: HabitInput) {
	const startDate = input.startDate ?? today();
	if (!isValidKey(startDate)) throw new Error('Choose a valid start date.');
	const db = await getDb();
	const ts = now();
	const count = await db.habits.count().exec();
	const pause = normalizedPause(input.pauseUntil, input.pauseFrom);
	const doc: Habit = {
		id: uid(),
		archived: false,
		createdAt: ts,
		updatedAt: ts,
		...input,
		startDate,
		historyVersion: 1,
		name: input.name.trim(),
		emoji: habitEmoji(input.emoji),
		color: input.color || HABIT_COLORS[count % HABIT_COLORS.length],
		goal: input.goal ?? 'build',
		kind: input.goal === 'break' ? 'quantity' : input.kind,
		target:
			input.goal === 'break'
				? Math.max(0, Math.min(10000, Math.round(input.target)))
				: input.kind === 'binary'
					? 1
					: Math.max(1, Math.min(10000, Math.round(input.target))),
		unit: input.unit.trim(),
		scheduleKind: input.scheduleKind,
		...pause
	};
	if (!pause.pauseUntil) {
		delete doc.pauseFrom;
		delete doc.pauseUntil;
	}
	const baseline: HabitRevision = { ...habitRules(doc), id: doc.id, habitId: doc.id,
		effectiveFrom: '0001-01-01', createdAt: 0, updatedAt: ts };
	await db.habitRevisions.insert(baseline);
	try {
		await db.habits.insert(doc);
	} catch (error) {
		await (await db.habitRevisions.findOne(baseline.id).exec())?.remove();
		throw error;
	}
	markLocalWrite();
	await recordWithUndo(
		{
			entity: 'habit',
			entityId: doc.id,
			verb: 'create',
			subject: doc.name,
			changes: [
				{ collection: 'habits', id: doc.id, before: null, after: doc },
				{ collection: 'habitRevisions', id: baseline.id, before: null, after: baseline }
			]
		},
		`Habit created · ${doc.name}`
	);
	return doc;
}

export async function updateHabit(id: string, patch: Partial<Habit>, options: { weekStartsOn?: 0 | 1 } = {}) {
	const db = await getDb();
	const doc = await db.habits.findOne(id).exec();
	if (!doc) return;
	const before = doc.toMutableJSON();
	const next = { ...patch, updatedAt: now() };
	if (patch.emoji !== undefined) next.emoji = habitEmoji(patch.emoji);
	let clearPause = false;
	if ('pauseFrom' in patch || 'pauseUntil' in patch) {
		const pause = normalizedPause(patch.pauseUntil, patch.pauseFrom ?? before.pauseFrom);
		if (pause.pauseUntil) Object.assign(next, pause);
		else {
			delete next.pauseFrom;
			delete next.pauseUntil;
			clearPause = true;
		}
	}
	// Creation is audit metadata; changing the tracking start must never rewrite it.
	delete next.createdAt;
	delete next.historyVersion;
	if ('startDate' in patch) {
		if (!patch.startDate || !isValidKey(patch.startDate)) throw new Error('Choose a valid start date.');
		const logs = await db.habitLogs.find({ selector: { habitId: id } }).exec();
		const earliest = logs.map((log) => log.date).sort()[0];
		if (earliest && patch.startDate > earliest) {
			throw new Error(`You have an entry on ${humanDay(earliest)}. Choose that date or earlier.`);
		}
	}
	const revisions = (await revisionsQuery(db, id).exec()).map((revision) => revision.toMutableJSON());
	const view = withHabitHistory(before, revisions);
	const previousRules = habitRules(habitForEdit(view));
	const nextRules = habitRules({ ...previousRules, ...patch });
	if (nextRules.goal === 'break') nextRules.kind = 'quantity';
	if (nextRules.goal === 'build' && nextRules.kind === 'binary') nextRules.target = 1;
	if (!Number.isInteger(nextRules.target) || nextRules.target < (nextRules.goal === 'break' ? 0 : 1) || nextRules.target > 10000) {
		throw new Error('Choose a valid target.');
	}
	const rulesChanged = !rulesEqual(previousRules, nextRules);
	// The habit retains its original rules as a fallback while revision sync catches up.
	// Every subsequent rule change lives in the separate revision stream.
	for (const field of RULE_FIELDS) delete next[field];
	const revisionChanges: DocChange[] = [];
	let effectiveFrom = '';
	let inserted: string | undefined;
	if (rulesChanged) {
		const baseline = await db.habitRevisions.findOne(id).exec();
		if (!baseline) {
			const initial: HabitRevision = { ...habitRules(before), id, habitId: id,
				effectiveFrom: '0001-01-01', createdAt: 0, updatedAt: next.updatedAt };
			await db.habitRevisions.insert(initial);
			// The baseline remains when an edit is undone; it is migration metadata,
			// and keeps the original rules available to every device.
		}
		effectiveFrom = ruleChangeDate({ ...view, startDate: patch.startDate ?? view.startDate }, nextRules, options.weekStartsOn ?? 1);
		// Ensure sequential edits on this device win even if they occur in one millisecond.
		const createdAt = Math.max(next.updatedAt, ...revisions.map((revision) => revision.createdAt + 1));
		const revision: HabitRevision = { ...nextRules, id: uid(), habitId: id, effectiveFrom, createdAt, updatedAt: createdAt };
		await db.habitRevisions.insert(revision);
		inserted = revision.id;
		revisionChanges.push({ collection: 'habitRevisions', id: revision.id, before: null, after: revision });
		next.historyVersion = 1;
	}
	let updated;
	try {
		updated = clearPause
			? await doc.incrementalModify((data) => {
				Object.assign(data, next);
				delete data.pauseFrom;
				delete data.pauseUntil;
				return data;
			})
			: await doc.patch(next);
	} catch (error) {
		// Do not leave a failed rule edit effective. A baseline is harmless and can stay.
		if (inserted) await (await db.habitRevisions.findOne(inserted).exec())?.remove();
		throw error;
	}
	markLocalWrite();

	const after = updated.toMutableJSON();
	const detail = changeSummary({ ...before, ...previousRules }, { ...after, ...nextRules });
	if (!detail) return;
	const archiveToggled = before.archived !== after.archived;
	await recordWithUndo(
		{
			entity: 'habit',
			entityId: id,
			verb: archiveToggled ? (after.archived ? 'archive' : 'restore') : 'update',
			subject: after.name,
			detail: archiveToggled ? '' : `${detail}${effectiveFrom ? ` · From ${humanDay(effectiveFrom)}` : ''}`,
			changes: [{ collection: 'habits', id, before, after }, ...revisionChanges]
		},
		`Habit ${archiveToggled ? (after.archived ? 'archived' : 'restored') : 'updated'} · ${after.name}`
	);
}

export async function deleteHabit(id: string) {
	const db = await getDb();
	const doc = await db.habits.findOne(id).exec();
	if (!doc) return;
	const habit = doc.toMutableJSON();

	const logs = await db.habitLogs.find({ selector: { habitId: id } }).exec();
	const entries = logs.map((l) => l.toMutableJSON());
	const revisions = await revisionsQuery(db, id).exec();
	const revisionEntries = revisions.map((revision) => revision.toMutableJSON());
	await Promise.all(logs.map((l) => l.remove()));
	await Promise.all(revisions.map((revision) => revision.remove()));
	await doc.remove();
	markLocalWrite();

	const changes: DocChange[] = [
		{ collection: 'habits', id, before: habit, after: null },
		...revisionEntries.map((revision) => ({ collection: 'habitRevisions' as const, id: revision.id, before: revision, after: null })),
		...entries.map((entry) => ({
			collection: 'habitLogs' as const,
			id: entry.id,
			before: entry,
			after: null
		}))
	];
	await recordWithUndo(
		{
			entity: 'habit',
			entityId: id,
			verb: 'delete',
			subject: habit.name,
			detail: entries.length
				? `${entries.length} logged day${entries.length === 1 ? '' : 's'} removed`
				: '',
			changes
		},
		`Habit deleted · ${habit.name}`
	);
}

function logDetail(habit: Habit, date: DayKey, value: number): string {
	const day = humanDay(date);
	if (value === 0) return `${day} \u00b7 cleared`;
	if (habit.goal !== 'break' && habit.kind === 'binary') return day;
	return `${day} \u00b7 ${value}${habit.unit ? ` ${habit.unit}` : ''}`;
}

export async function setLog(habit: Habit, date: DayKey, value: number) {
	const db = await getDb();
	if (!isValidKey(date)) throw new Error('Choose a valid date.');
	const current = await db.habits.findOne(habit.id).exec();
	if (!current) throw new Error('This habit no longer exists.');
	const currentView = current.toMutableJSON();
	if (isPausedOn(currentView, date)) {
		throw new Error(`This habit is paused through ${humanDay(currentView.pauseUntil!)}.`);
	}
	const existingLogs = (await logsQuery(db, habit.id).exec()).map((log) => log.toMutableJSON());
	if (date < habitStartDate(currentView, toLogMap(existingLogs))) {
		throw new Error('Change the habit’s start date before logging an earlier day.');
	}
	const revisions = (await revisionsQuery(db, habit.id).exec()).map((revision) => revision.toMutableJSON());
	habit = habitOn(withHabitHistory(current.toMutableJSON(), revisions), date);
	const clamped = Math.max(0, Math.min(10000, Math.round(value)));
	const id = logId(habit.id, date);
	const existing = await db.habitLogs.findOne(id).exec();
	const before = existing?.toMutableJSON() ?? null;
	if ((before?.value ?? 0) === clamped) return;

	if (clamped === 0) {
		if (!existing) return;
		await existing.remove();
		markLocalWrite();
		await recordWithUndo(
			{
				entity: 'habitLog',
				entityId: id,
				verb: 'delete',
				subject: habit.name,
				detail: logDetail(habit, date, 0),
				changes: [{ collection: 'habitLogs', id, before, after: null }]
			},
			`Entry cleared · ${habit.name}`
		);
		return;
	}

	const updatedAt = now();
	const after: HabitLog = {
		id,
		habitId: habit.id,
		date,
		value: clamped,
		updatedAt,
		...(before ? { editedAt: updatedAt } : {})
	};
	await db.habitLogs.upsert(after);
	markLocalWrite();
	await recordWithUndo(
		{
			entity: 'habitLog',
			entityId: id,
			verb: 'log',
			subject: habit.name,
			detail: logDetail(habit, date, clamped),
			changes: [{ collection: 'habitLogs', id, before, after }],
			coalesce: true
		},
		`Entry recorded · ${habit.name}`
	);
}

/**
 * One tap for build habits: binary habits toggle, quantity habits increment without clearing existing progress. Break habits always increment: each tap records one slip.
 */
export async function tapLog(habit: Habit, date: DayKey, current: number) {
	if (habit.goal === 'break' || (habit.kind === 'quantity' && habit.scheduleKind === 'weekly')) return setLog(habit, date, current + 1);
	if (habit.kind === 'binary') return setLog(habit, date, current >= habit.target ? 0 : habit.target);
	return setLog(habit, date, current + 1);
}
