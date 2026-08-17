import { getDb, type Db } from './db/index.ts';
import type { Habit, HabitGoal, HabitLog, HabitKind, ScheduleKind } from './db/schemas.ts';
import { markLocalWrite } from './db/replication.svelte.ts';
import { HABIT_COLORS, logId, type LogMap } from './streaks.ts';
import type { DayKey } from './dates.ts';
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
	await doc.patch(next);
	markLocalWrite();
}

export async function deleteHabit(id: string) {
	const db = await getDb();
	const logs = await db.habitLogs.find({ selector: { habitId: id } }).exec();
	await Promise.all(logs.map((l) => l.remove()));
	const doc = await db.habits.findOne(id).exec();
	await doc?.remove();
	markLocalWrite();
}

export async function setLog(habit: Habit, date: DayKey, value: number) {
	const db = await getDb();
	const clamped = Math.max(0, Math.min(10000, Math.round(value)));
	const id = logId(habit.id, date);
	if (clamped === 0) {
		const existing = await db.habitLogs.findOne(id).exec();
		if (existing) {
			await existing.remove();
			markLocalWrite();
		}
		return;
	}
	await db.habitLogs.upsert({ id, habitId: habit.id, date, value: clamped, updatedAt: now() });
	markLocalWrite();
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
