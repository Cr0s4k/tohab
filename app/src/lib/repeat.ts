import {
	fromKey,
	shiftKey,
	startOfWeekKey,
	today,
	toKey,
	weekdayOf,
	type DayKey
} from './dates.ts';

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

export type Repeat = {
	unit: RepeatUnit;
	interval: number;
	/** Weekly rules: local weekday numbers, 0 = Sunday. Empty keeps the due date's own weekday. */
	weekdays: number[];
	/** Monthly and yearly rules: 0 keeps the due date's own day of the month. */
	monthDay: number;
	/** Todoist's `every!`: the next date counts from the day it was completed, not the due date. */
	fromCompletion: boolean;
};

/**
 * Rules live on the task as one string — `[!]unit:interval[:extra]`, e.g. `day:3`,
 * `week:2:1`, `month:1:15`. One field rather than five keeps the schema, the sync payload
 * and the backup format flat, and the shape is small enough to read in a debugger.
 */
export function formatRule(r: Repeat): string {
	const extra =
		r.unit === 'week' && r.weekdays.length
			? `:${[...new Set(r.weekdays)].sort((a, b) => a - b).join(',')}`
			: (r.unit === 'month' || r.unit === 'year') && r.monthDay
				? `:${r.monthDay}`
				: '';
	return `${r.fromCompletion ? '!' : ''}${r.unit}:${r.interval}${extra}`;
}

const UNITS: RepeatUnit[] = ['day', 'week', 'month', 'year'];

export function parseRule(rule: string): Repeat | null {
	if (!rule) return null;
	const fromCompletion = rule.startsWith('!');
	const [unit, rawInterval, extra] = (fromCompletion ? rule.slice(1) : rule).split(':');
	if (!UNITS.includes(unit as RepeatUnit)) return null;

	const interval = Number(rawInterval);
	if (!Number.isInteger(interval) || interval < 1 || interval > 999) return null;

	let weekdays: number[] = [];
	let monthDay = 0;
	if (unit === 'week' && extra) {
		weekdays = extra.split(',').map(Number);
		if (weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return null;
		weekdays = [...new Set(weekdays)].sort((a, b) => a - b);
	}
	if ((unit === 'month' || unit === 'year') && extra) {
		monthDay = Number(extra);
		if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31) return null;
	}

	return { unit: unit as RepeatUnit, interval, weekdays, monthDay, fromCompletion };
}

export function isRepeating(rule: string | undefined): boolean {
	return Boolean(rule && parseRule(rule));
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDINALS = ['th', 'st', 'nd', 'rd'];

function ordinal(n: number): string {
	const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (ORDINALS[n % 10] ?? 'th');
	return `${n}${suffix}`;
}

function everyN(interval: number, unit: string): string {
	if (interval === 1) return `Every ${unit}`;
	if (interval === 2) return `Every other ${unit}`;
	return `Every ${interval} ${unit}s`;
}

const PLAIN: Record<RepeatUnit, string> = {
	day: 'Daily',
	week: 'Weekly',
	month: 'Monthly',
	year: 'Yearly'
};

export function describeRepeat(rule: string): string {
	const r = parseRule(rule);
	if (!r) return '';
	const suffix = r.fromCompletion ? ' after completing' : '';

	if (r.unit === 'week' && r.weekdays.length) {
		const key = r.weekdays.join(',');
		const group = key === '1,2,3,4,5' ? 'weekday' : key === '0,6' ? 'weekend' : '';
		const named =
			group ||
			(r.weekdays.length === 1
				? DAY_NAMES[r.weekdays[0]]
				: r.weekdays.map((d) => DAY_SHORT[d]).join(', '));
		if (r.interval === 1) return `Every ${named}${suffix}`;
		if (r.interval === 2 && !named.includes(',')) return `Every other ${named}${suffix}`;
		return `${everyN(r.interval, 'week')} on ${named}${suffix}`;
	}

	const on = r.monthDay ? ` on the ${ordinal(r.monthDay)}` : '';
	if (r.interval === 1) return `${PLAIN[r.unit]}${on}${suffix}`;
	return `${everyN(r.interval, r.unit)}${on}${suffix}`;
}

/** Last day of the target month when the wanted day overflows it — 31 Jan + 1mo is 28 Feb. */
function clamped(year: number, month: number, day: number): DayKey {
	const last = new Date(year, month + 1, 0).getDate();
	return toKey(new Date(year, month, Math.min(day, last)));
}

function weekOccurrence(r: Repeat, from: DayKey, inclusive: boolean): DayKey {
	if (!r.weekdays.length) return shiftKey(from, inclusive ? 0 : 7 * r.interval);
	if (inclusive && r.weekdays.includes(weekdayOf(from))) return from;

	/**
	 * Fortnight-and-longer rules hold their phase only once the series has a day to count
	 * from: reading "every other Monday" off a Wednesday means the coming Monday, not the one
	 * after it. From a Monday it does skip a week, and every hop after that keeps the phase.
	 */
	const phased = r.interval > 1 && r.weekdays.includes(weekdayOf(from));
	const anchor = startOfWeekKey(from, 1);
	for (let i = 1; i <= 7 * (r.interval + 1); i++) {
		const day = shiftKey(from, i);
		if (!r.weekdays.includes(weekdayOf(day))) continue;
		if (!phased) return day;
		const weeks = Math.round(
			(fromKey(startOfWeekKey(day, 1)).getTime() - fromKey(anchor).getTime()) / 604_800_000
		);
		if (weeks % r.interval === 0) return day;
	}
	return shiftKey(from, 7 * r.interval);
}

function monthOccurrence(r: Repeat, from: DayKey, inclusive: boolean, months: number): DayKey {
	const base = fromKey(from);
	const wanted = r.monthDay || base.getDate();
	const here = clamped(base.getFullYear(), base.getMonth(), wanted);
	if (inclusive ? here >= from : here > from) return here;
	return clamped(base.getFullYear(), base.getMonth() + months, wanted);
}

function occurrence(r: Repeat, from: DayKey, inclusive: boolean): DayKey {
	if (r.unit === 'day') return shiftKey(from, inclusive ? 0 : r.interval);
	if (r.unit === 'week') return weekOccurrence(r, from, inclusive);
	if (r.unit === 'month') return monthOccurrence(r, from, inclusive, r.interval);
	return monthOccurrence(r, from, inclusive, r.interval * 12);
}

/** The first date the rule lands on, counting `from` itself. Used when a rule has no due date yet. */
export function firstDue(rule: string, from: DayKey = today()): DayKey {
	const r = parseRule(rule);
	return r ? occurrence(r, from, true) : '';
}

export function nextDue(rule: string, after: DayKey): DayKey {
	const r = parseRule(rule);
	return r ? occurrence(r, after, false) : '';
}

/**
 * Where a completed repeating task lands next. Date-based rules count from the date it was
 * due, `!` rules from today, and either way the result is rolled past today: completing a
 * daily task that went three weeks unloved should offer tomorrow, not three weeks ago.
 */
export function advanceDue(rule: string, due: DayKey, from: DayKey = today()): DayKey {
	const r = parseRule(rule);
	if (!r) return '';
	let next = occurrence(r, r.fromCompletion || !due ? from : due, false);
	for (let guard = 0; guard < 500 && next <= from; guard++) next = occurrence(r, next, false);
	return next;
}

/** The chips both the compose sheet and the editor offer; anything else comes from typing. */
export const REPEAT_PRESETS: { label: string; value: string }[] = [
	{ label: 'None', value: '' },
	{ label: 'Daily', value: 'day:1' },
	{ label: 'Weekdays', value: 'week:1:1,2,3,4,5' },
	{ label: 'Weekly', value: 'week:1' },
	{ label: 'Fortnightly', value: 'week:2' },
	{ label: 'Monthly', value: 'month:1' },
	{ label: 'Yearly', value: 'year:1' }
];
