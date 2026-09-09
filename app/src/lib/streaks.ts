import type { HabitView } from './db/schemas.ts';
import { compareRevisions, habitOn, rulesEqual } from './habitHistory.ts';
import { isValidKey, shiftKey, startOfWeekKey, today, weekdayOf, type DayKey } from './dates.ts';

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

/**
 * The deterministic floor for a legacy habit is the UTC calendar day of its creation
 * timestamp, extended by any log already known to this caller. A persisted startDate is
 * authoritative: importing or receiving an old log must never move an explicit start back.
 */
export function habitStartDate(habit: HabitView, logs?: LogMap): DayKey {
	if (habit.startDate && isValidKey(habit.startDate)) return habit.startDate as DayKey;

	let start = new Date(habit.createdAt).toISOString().slice(0, 10) as DayKey;
	for (const day of logs?.keys() ?? []) {
		if (isValidKey(day) && day < start) start = day;
	}
	return start;
}

/** Whether the habit exists for tracking on this calendar day. */
export function isActiveOn(habit: HabitView, day: DayKey, logs?: LogMap): boolean {
	return day >= habitStartDate(habit, logs);
}

/** Whether the habit's schedule asks for this day. Weekly habits have no fixed days. */
export function isDue(habit: HabitView, day: DayKey, logs?: LogMap): boolean {
	if (!isActiveOn(habit, day, logs)) return false;
	const current = habitOn(habit, day);
	if (current.scheduleKind === 'daily') return true;
	if (current.scheduleKind === 'weekdays') return current.weekdays.includes(weekdayOf(day));
	return true;
}

function laterDay(a: DayKey, b: DayKey): DayKey {
	return a > b ? a : b;
}

/**
 * Return the revisions that actually win on each effective day. Offline edits can
 * produce several revisions for one day; the last item under compareRevisions is
 * the same winner that habitOn uses, while earlier items were never observable.
 */
function effectiveRevisions(habit: HabitView, day: DayKey) {
	const revisions = [] as NonNullable<HabitView['revisions']>;
	for (const revision of (habit.revisions ?? []).slice().sort(compareRevisions)) {
		if (revision.effectiveFrom > day) break;
		const previous = revisions.at(-1);
		if (previous?.effectiveFrom === revision.effectiveFrom) revisions[revisions.length - 1] = revision;
		else revisions.push(revision);
	}
	return revisions;
}

/** Latest point at which the currently active cadence (daily-like or weekly) began. */
function cadenceStart(habit: HabitView, day: DayKey, logs: LogMap): DayKey {
	let start = habitStartDate(habit, logs);
	let weekly = habit.scheduleKind === 'weekly';
	for (const revision of effectiveRevisions(habit, day)) {
		const nextWeekly = revision.scheduleKind === 'weekly';
		if (nextWeekly !== weekly) start = laterDay(start, revision.effectiveFrom);
		weekly = nextWeekly;
	}
	return start;
}

/** The first full week that can contribute to a weekly score for a cadence segment. */
function firstScoringWeek(
	habit: HabitView,
	segmentStart: DayKey,
	weekStartsOn: 0 | 1,
	logs: LogMap
): DayKey {
	const week = startOfWeekKey(segmentStart, weekStartsOn);
	if (week === segmentStart) return week;

	// Legacy records had no user-selected start day. Keep their inferred partial week so
	// existing history is not silently rewritten; explicit starts and cadence transitions
	// begin scoring at the next full calendar week.
	const initialLegacyStart = !habit.startDate && segmentStart === habitStartDate(habit, logs);
	return initialLegacyStart ? week : shiftKey(week, 7);
}

function weeklyPeriodIsScorable(
	habit: HabitView,
	day: DayKey,
	weekStartsOn: 0 | 1,
	logs: LogMap
): boolean {
	const period = startOfWeekKey(day, weekStartsOn);
	const segmentStart = cadenceStart(habit, day, logs);
	if (period < firstScoringWeek(habit, segmentStart, weekStartsOn, logs)) return false;
	return weeklyRulesMatch(habit, day, weekStartsOn, logs);
}

function weeklyRulesMatch(habit: HabitView, day: DayKey, weekStartsOn: 0 | 1, logs: LogMap): boolean {
	const period = startOfWeekKey(day, weekStartsOn);
	// A weekly period is one scoring unit. If its calendar days resolve to different
	// tracking rules (for example a Monday edit viewed with a Sunday week start), do
	// not score that mixed period. periodValue still shows only the days matching the
	// requested day's rule so historical display never applies a target retroactively.
	const requested = habitOn(habit, day);
	const floor = habitStartDate(habit, logs);
	for (let i = 0; i < 7; i++) {
		const periodDay = shiftKey(period, i);
		if (periodDay >= floor && !rulesEqual(requested, habitOn(habit, periodDay))) return false;
	}
	return true;
}

export function valueOn(logs: LogMap, day: DayKey): number {
	return logs.get(day) ?? 0;
}

export function isWeeklyQuantity(habit: HabitView): boolean {
	return habit.scheduleKind === 'weekly' && habit.kind === 'quantity';
}

export function periodValue(habit: HabitView, logs: LogMap, day: DayKey, weekStartsOn: 0 | 1 = 1): number {
	const startDate = habitStartDate(habit, logs);
	if (day < startDate) return 0;
	const current = habitOn(habit, day);
	if (current.scheduleKind !== 'weekly') return valueOn(logs, day);
	const weekStart = startOfWeekKey(day, weekStartsOn);
	const requestedRules = habitOn(habit, day);
	let total = 0;
	for (let i = 0; i < 7; i++) {
		const periodDay = shiftKey(weekStart, i);
		if (periodDay < startDate) continue;
		const dayHabit = habitOn(habit, periodDay);
		if (!rulesEqual(requestedRules, dayHabit) || dayHabit.scheduleKind !== 'weekly' || !isDue(habit, periodDay, logs)) continue;
		const value = valueOn(logs, periodDay);
		total += dayHabit.kind === 'binary' ? Number(value >= dayHabit.target) : value;
	}
	return total;
}

export function isComplete(habit: HabitView, logs: LogMap, day: DayKey, weekStartsOn: 0 | 1 = 1): boolean {
	if (!isActiveOn(habit, day, logs)) return false;
	const current = habitOn(habit, day);
	if (current.scheduleKind === 'weekly' && !weeklyRulesMatch(habit, day, weekStartsOn, logs)) return false;
	const value = periodValue(habit, logs, day, weekStartsOn);
	return current.goal === 'break' ? value <= current.target : value >= periodTargetAt(habit, day);
}

function periodTargetAt(habit: HabitView, day: DayKey): number {
	const current = habitOn(habit, day);
	return current.scheduleKind === 'weekly' && current.kind === 'binary' ? current.timesPerWeek : current.target;
}

export function periodTarget(habit: HabitView): number {
	return habit.scheduleKind === 'weekly' && habit.kind === 'binary' ? habit.timesPerWeek : habit.target;
}

function weekComplete(habit: HabitView, logs: LogMap, week: DayKey, weekStartsOn: 0 | 1): boolean {
	// Legacy habits retain their inferred partial first week. Evaluate that period on
	// its first active day; evaluating at the calendar week start would be before the
	// habit floor and incorrectly mark the otherwise valid period incomplete.
	return isComplete(habit, logs, laterDay(week, habitStartDate(habit, logs)), weekStartsOn);
}

/**
 * Consecutive streak up to today. An unfinished *today* never breaks a streak — it is
 * simply not counted yet — and days the schedule does not ask for are skipped entirely.
 */
export function currentStreak(
	habit: HabitView,
	logs: LogMap,
	weekStartsOn: 0 | 1,
	todayKey = today()
): number {
	const floor = habitStartDate(habit, logs);
	if (todayKey < floor) return 0;
	const current = habitOn(habit, todayKey);
	const segmentStart = cadenceStart(habit, todayKey, logs);

	if (current.scheduleKind === 'weekly') {
		const first = firstScoringWeek(habit, segmentStart, weekStartsOn, logs);
		let week = startOfWeekKey(todayKey, weekStartsOn);
		let streak = 0;
		// A maximum can only be earned when the week has ended.
		if (current.goal === 'break') {
			if (weeklyPeriodIsScorable(habit, laterDay(week, floor), weekStartsOn, logs) && !weekComplete(habit, logs, week, weekStartsOn)) return 0;
			week = shiftKey(week, -7);
		} else if (!weekComplete(habit, logs, week, weekStartsOn)) week = shiftKey(week, -7);
		while (week >= first) {
			if (!weeklyPeriodIsScorable(habit, laterDay(week, floor), weekStartsOn, logs)) {
				week = shiftKey(week, -7);
				continue;
			}
			if (!weekComplete(habit, logs, week, weekStartsOn)) break;
			streak++;
			week = shiftKey(week, -7);
		}
		return streak;
	}

	let day = todayKey;
	let streak = 0;
	if (isDue(habit, day, logs) && !isComplete(habit, logs, day)) day = shiftKey(day, -1);
	while (day >= segmentStart) {
		if (isDue(habit, day, logs)) {
			if (!isComplete(habit, logs, day)) break;
			streak++;
		}
		day = shiftKey(day, -1);
	}
	return streak;
}

export function bestStreak(
	habit: HabitView,
	logs: LogMap,
	weekStartsOn: 0 | 1,
	todayKey = today()
): number {
	const floor = habitStartDate(habit, logs);
	if (todayKey < floor) return 0;
	const current = habitOn(habit, todayKey);
	const segmentStart = cadenceStart(habit, todayKey, logs);

	if (current.scheduleKind === 'weekly') {
		let week = firstScoringWeek(habit, segmentStart, weekStartsOn, logs);
		const last = startOfWeekKey(todayKey, weekStartsOn);
		let best = 0;
		let run = 0;
		while (week <= last) {
			if (!weeklyPeriodIsScorable(habit, laterDay(week, floor), weekStartsOn, logs)) {
				week = shiftKey(week, 7);
				continue;
			}
			const met = !(current.goal === 'break' && week === last) && weekComplete(habit, logs, week, weekStartsOn);
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

	let day = segmentStart;
	let best = 0;
	let run = 0;
	while (day <= todayKey) {
		if (isDue(habit, day, logs)) {
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
	habit: HabitView, logs: LogMap, days: number, todayKey = today(), weekStartsOn: 0 | 1 = 1
): { due: number; done: number } {
	const floor = habitStartDate(habit, logs);
	const seen = new Set<string>();
	let due = 0;
	let done = 0;
	for (let i = 0; i < days; i++) {
		const day = shiftKey(todayKey, -i);
		if (day < floor) break;
		if (!isDue(habit, day, logs)) continue;
		const current = habitOn(habit, day);
		const weekly = current.scheduleKind === 'weekly';
		const period = weekly ? startOfWeekKey(day, weekStartsOn) : day;
		if (weekly && !weeklyPeriodIsScorable(habit, day, weekStartsOn, logs)) continue;
		const periodKey = `${weekly ? 'weekly' : 'daily'}:${period}`;
		if (seen.has(periodKey)) continue;
		seen.add(periodKey);
		due++;
		if (isComplete(habit, logs, day, weekStartsOn)) done++;
	}
	return { due, done };
}

export function completionRate(
	habit: HabitView, logs: LogMap, days: number, todayKey = today(), weekStartsOn: 0 | 1 = 1
): number {
	const { due, done } = completionWindow(habit, logs, days, todayKey, weekStartsOn);
	return due === 0 ? 0 : done / due;
}
