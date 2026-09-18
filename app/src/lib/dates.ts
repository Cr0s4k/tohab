import {
	addDays,
	differenceInCalendarDays,
	format,
	isValid,
	parseISO,
	startOfWeek as sow
} from 'date-fns';

/** Local calendar day key. All habit and due-date logic is local-day based, never UTC. */
export type DayKey = string;

export function toKey(date: Date): DayKey {
	return format(date, 'yyyy-MM-dd');
}

export function today(): DayKey {
	return toKey(new Date());
}

export function fromKey(key: DayKey): Date {
	return parseISO(key);
}

export function shiftKey(key: DayKey, days: number): DayKey {
	return toKey(addDays(fromKey(key), days));
}

export function weekdayOf(key: DayKey): number {
	return fromKey(key).getDay();
}

export function startOfWeekKey(key: DayKey, weekStartsOn: 0 | 1): DayKey {
	return toKey(sow(fromKey(key), { weekStartsOn }));
}

export function isValidKey(key: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(key) && isValid(parseISO(key));
}

export function daysFromToday(key: DayKey): number {
	return differenceInCalendarDays(fromKey(key), new Date());
}

/** "Today", "Tomorrow", "Yesterday", "Sat 22 Mar" — the Todoist-style relative label. */
export function humanDay(key: DayKey): string {
	const diff = daysFromToday(key);
	if (diff === 0) return 'Today';
	if (diff === 1) return 'Tomorrow';
	if (diff === -1) return 'Yesterday';
	const d = fromKey(key);
	if (diff > 1 && diff < 7) return format(d, 'EEEE');
	if (d.getFullYear() === new Date().getFullYear()) return format(d, 'EEE d MMM');
	return format(d, 'd MMM yyyy');
}

export function humanTime(hhmm: string): string {
	if (!hhmm) return '';
	const [h, m] = hhmm.split(':').map(Number);
	const suffix = h < 12 ? 'am' : 'pm';
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

export function humanDateTime(timestamp: number): string {
	const date = new Date(timestamp);
	return `${humanDay(toKey(date))} · ${humanTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`)}`;
}

export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEKDAY_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
];
