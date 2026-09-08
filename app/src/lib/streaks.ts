import type { Habit } from './db/schemas.ts';
import { shiftKey, startOfWeekKey, today, toKey, weekdayOf, type DayKey } from './dates.ts';

export type LogMap = Map<DayKey, number>;

export const HABIT_COLORS = [
	'oklch(0.66 0.16 25)',
	'oklch(0.72 0.15 65)',
	'oklch(0.72 0.15 130)',
	'oklch(0.68 0.13 175)',
	'oklch(0.65 0.16 250)',
	'oklch(0.65 0.17 300)',
	'oklch(0.68 0.16 205)',
	'oklch(0.65 0.17 275)',
	'oklch(0.67 0.17 340)',
	'oklch(0.67 0.13 45)',
	'oklch(0.65 0.14 155)',
	'oklch(0.62 0.12 230)'
];

export const HABIT_EMOJI = [
	'💪',
	'📖',
	'🧘',
	'💧',
	'🏃',
	'🥗',
	'😴',
	'✍️',
	'🎸',
	'🧹',
	'☎️',
	'🚭'
];

export function logId(habitId: string, date: DayKey) {
	return `${habitId}:${date}`;
}

/** Whether the habit's schedule asks for this day. Weekly habits have no fixed days. */
export function isDue(habit: Habit, day: DayKey): boolean {
	if (habit.scheduleKind === 'daily') return true;
	if (habit.scheduleKind === 'weekdays') return habit.weekdays.includes(weekdayOf(day));
	return true;
}

export function valueOn(logs: LogMap, day: DayKey): number {
	return logs.get(day) ?? 0;
}

export function isWeeklyQuantity(habit: Habit): boolean {
	return habit.scheduleKind === 'weekly' && habit.kind === 'quantity';
}

export function periodValue(habit: Habit, logs: LogMap, day: DayKey, weekStartsOn: 0 | 1 = 1): number {
	if (habit.scheduleKind !== 'weekly') return valueOn(logs, day);
	const start = startOfWeekKey(day, weekStartsOn);
	let total = 0;
	for (let i = 0; i < 7; i++) {
		const value = valueOn(logs, shiftKey(start, i));
		total += habit.kind === 'binary' ? Number(value >= habit.target) : value;
	}
	return total;
}

export function isComplete(habit: Habit, logs: LogMap, day: DayKey, weekStartsOn: 0 | 1 = 1): boolean {
	const value = periodValue(habit, logs, day, weekStartsOn);
	return habit.goal === 'break' ? value <= habit.target : value >= periodTarget(habit);
}

/**
 * How far back history is considered. Normally the day the habit was created, but the
 * heatmap lets users backfill days that predate it, so any logged day extends the floor.
 */
function floorDay(habit: Habit, logs: LogMap): DayKey {
	let floor = toKey(new Date(habit.createdAt));
	for (const day of logs.keys()) if (day < floor) floor = day;
	return floor;
}

export function periodTarget(habit: Habit): number {
	return habit.scheduleKind === 'weekly' && habit.kind === 'binary' ? habit.timesPerWeek : habit.target;
}

function weekComplete(habit: Habit, logs: LogMap, week: DayKey, weekStartsOn: 0 | 1): boolean {
	return isComplete(habit, logs, week, weekStartsOn);
}

/**
 * Consecutive streak up to today. An unfinished *today* never breaks a streak — it is
 * simply not counted yet — and days the schedule does not ask for are skipped entirely.
 */
export function currentStreak(
	habit: Habit,
	logs: LogMap,
	weekStartsOn: 0 | 1,
	todayKey = today()
): number {
	const floor = floorDay(habit, logs);

	if (habit.scheduleKind === 'weekly') {
		let week = startOfWeekKey(todayKey, weekStartsOn);
		let streak = 0;
		// A maximum can only be earned when the week has ended.
		if (habit.goal === 'break') {
			if (!weekComplete(habit, logs, week, weekStartsOn)) return 0;
			week = shiftKey(week, -7);
		} else if (!weekComplete(habit, logs, week, weekStartsOn)) week = shiftKey(week, -7);
		while (week >= startOfWeekKey(floor, weekStartsOn)) {
			if (!weekComplete(habit, logs, week, weekStartsOn)) break;
			streak++;
			week = shiftKey(week, -7);
		}
		return streak;
	}

	let day = todayKey;
	let streak = 0;
	if (isDue(habit, day) && !isComplete(habit, logs, day)) day = shiftKey(day, -1);
	while (day >= floor) {
		if (isDue(habit, day)) {
			if (!isComplete(habit, logs, day)) break;
			streak++;
		}
		day = shiftKey(day, -1);
	}
	return streak;
}

export function bestStreak(
	habit: Habit,
	logs: LogMap,
	weekStartsOn: 0 | 1,
	todayKey = today()
): number {
	const floor = floorDay(habit, logs);

	if (habit.scheduleKind === 'weekly') {
		let week = startOfWeekKey(floor, weekStartsOn);
		const last = startOfWeekKey(todayKey, weekStartsOn);
		let best = 0;
		let run = 0;
		while (week <= last) {
			const met = !(habit.goal === 'break' && week === last) && weekComplete(habit, logs, week, weekStartsOn);
			if (met) {
				run++;
				best = Math.max(best, run);
			} else if (week !== last) {
				run = 0;
			}
			week = shiftKey(week, 7);
		}
		return best;
	}

	let day = floor;
	let best = 0;
	let run = 0;
	while (day <= todayKey) {
		if (isDue(habit, day)) {
			if (isComplete(habit, logs, day)) {
				run++;
				best = Math.max(best, run);
			} else if (day !== todayKey) {
				run = 0;
			}
		}
		day = shiftKey(day, 1);
	}
	return best;
}

/** Each scheduled day or calendar week counts once; backfilled history extends creation. */
export function completionWindow(
	habit: Habit, logs: LogMap, days: number, todayKey = today(), weekStartsOn: 0 | 1 = 1
): { due: number; done: number } {
	const floor = floorDay(habit, logs);
	const seen = new Set<string>();
	let due = 0;
	let done = 0;
	for (let i = 0; i < days; i++) {
		const day = shiftKey(todayKey, -i);
		if (day < floor) break;
		if (!isDue(habit, day)) continue;
		const period = habit.scheduleKind === 'weekly' ? startOfWeekKey(day, weekStartsOn) : day;
		if (seen.has(period)) continue;
		seen.add(period);
		due++;
		if (isComplete(habit, logs, day, weekStartsOn)) done++;
	}
	return { due, done };
}

export function completionRate(
	habit: Habit, logs: LogMap, days: number, todayKey = today(), weekStartsOn: 0 | 1 = 1
): number {
	const { due, done } = completionWindow(habit, logs, days, todayKey, weekStartsOn);
	return due === 0 ? 0 : done / due;
}
