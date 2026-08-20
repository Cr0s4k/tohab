import { getDb } from './db/lazy.ts';
import type { Db } from './db/index.ts';
import type { Habit, HabitGoal, HabitLog, HabitKind, ScheduleKind } from './db/schemas.ts';
import { markLocalWrite } from './db/syncState.svelte.ts';
import { HABIT_COLORS, logId, type LogMap } from './streaks.ts';
import { humanDay, type DayKey } from './dates.ts';
import { changeSummary, record } from './activity.ts';
import { now, uid } from './ids.ts';

export * from './streaks.ts';

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

export type HabitInput = {
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

export async function createHabit(input: HabitInput) {
	const db = await getDb();
	const ts = now();
	const count = await db.habits.count().exec();
	const doc: Habit = {
		id: uid(),
		archived: false,
		createdAt: ts,
		updatedAt: ts,
		...input,
		name: input.name.trim(),
		color: input.color || HABIT_COLORS[count % HABIT_COLORS.length],
		goal: input.goal ?? 'build',
		kind: input.goal === 'break' ? 'quantity' : input.kind,
		target:
			input.goal === 'break'
				? Math.max(0, Math.min(10000, Math.round(input.target)))
				: input.kind === 'binary'
					? 1
					: Math.max(1, Math.min(10000, Math.round(input.target))),
		unit: input.goal === 'break' ? '' : input.unit,
		scheduleKind: input.goal === 'break' ? 'daily' : input.scheduleKind
	};
	await db.habits.insert(doc);
	markLocalWrite();
	await record({
		entity: 'habit',
		entityId: doc.id,
		verb: 'create',
		subject: doc.name,
		changes: [{ collection: 'habits', id: doc.id, before: null, after: doc }]
	});
	return doc;
}

export async function updateHabit(id: string, patch: Partial<Habit>) {
	const db = await getDb();
	const doc = await db.habits.findOne(id).exec();
	if (!doc) return;
	const next = { ...patch, updatedAt: now() };
	if (next.goal === 'break') {
		next.kind = 'quantity';
		next.unit = '';
		next.scheduleKind = 'daily';
	}
	const before = doc.toMutableJSON();
	const updated = await doc.patch(next);
	markLocalWrite();

	const after = updated.toMutableJSON();
	const detail = changeSummary(before, after);
	if (!detail) return;
	const archiveToggled = before.archived !== after.archived;
	await record({
		entity: 'habit',
		entityId: id,
		verb: archiveToggled ? (after.archived ? 'archive' : 'restore') : 'update',
		subject: after.name,
		detail: archiveToggled ? '' : detail,
		changes: [{ collection: 'habits', id, before, after }]
	});
}

export async function deleteHabit(id: string) {
	const db = await getDb();
	const doc = await db.habits.findOne(id).exec();
	if (!doc) return;
	const habit = doc.toMutableJSON();

	const logs = await db.habitLogs.find({ selector: { habitId: id } }).exec();
	const entries = logs.map((l) => l.toMutableJSON());
	await Promise.all(logs.map((l) => l.remove()));
	await doc.remove();
	markLocalWrite();

	await record({
		entity: 'habit',
		entityId: id,
		verb: 'delete',
		subject: habit.name,
		detail: entries.length
			? `${entries.length} logged day${entries.length === 1 ? '' : 's'} removed`
			: '',
		changes: [
			{ collection: 'habits', id, before: habit, after: null },
			...entries.map((entry) => ({
				collection: 'habitLogs' as const,
				id: entry.id,
				before: entry,
				after: null
			}))
		]
	});
}

function logDetail(habit: Habit, date: DayKey, value: number): string {
	const day = humanDay(date);
	if (value === 0) return `${day} \u00b7 cleared`;
	if (habit.goal !== 'break' && habit.kind === 'binary') return day;
	return `${day} \u00b7 ${value}${habit.unit ? ` ${habit.unit}` : ''}`;
}

export async function setLog(habit: Habit, date: DayKey, value: number) {
	const db = await getDb();
	const clamped = Math.max(0, Math.min(10000, Math.round(value)));
	const id = logId(habit.id, date);
	const existing = await db.habitLogs.findOne(id).exec();
	const before = existing?.toMutableJSON() ?? null;

	if (clamped === 0) {
		if (!existing) return;
		await existing.remove();
		markLocalWrite();
		await record({
			entity: 'habitLog',
			entityId: id,
			verb: 'delete',
			subject: habit.name,
			detail: logDetail(habit, date, 0),
			changes: [{ collection: 'habitLogs', id, before, after: null }]
		});
		return;
	}

	const after = { id, habitId: habit.id, date, value: clamped, updatedAt: now() };
	await db.habitLogs.upsert(after);
	markLocalWrite();
	await record({
		entity: 'habitLog',
		entityId: id,
		verb: 'log',
		subject: habit.name,
		detail: logDetail(habit, date, clamped),
		changes: [{ collection: 'habitLogs', id, before, after }],
		coalesce: true
	});
}

/**
 * One tap for build habits: binary habits toggle, quantity habits increment and wrap once
 * past target. Break habits always increment: each tap records one slip.
 */
export async function tapLog(habit: Habit, date: DayKey, current: number) {
	if (habit.goal === 'break') return setLog(habit, date, current + 1);
	if (habit.kind === 'binary') return setLog(habit, date, current >= habit.target ? 0 : habit.target);
	return setLog(habit, date, current >= habit.target ? 0 : current + 1);
}
