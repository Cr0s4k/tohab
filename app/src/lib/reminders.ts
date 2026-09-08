import { toKey, humanDay, humanTime } from './dates.ts';

export function reminderStamp(date: Date): string {
	return `${toKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Todoist's Tomorrow is 9 AM; Later is four hours ahead, rounded down to the hour. */
export function suggestedReminder(kind: 'tomorrow' | 'later' | 'hour', base = new Date()): string {
	const date = new Date(base);
	if (kind === 'tomorrow') {
		date.setDate(date.getDate() + 1);
		date.setHours(9, 0, 0, 0);
	} else if (kind === 'later') {
		date.setTime(date.getTime() + 4 * 60 * 60_000);
		date.setMinutes(0, 0, 0);
	} else {
		date.setTime(date.getTime() + 60 * 60_000);
	}
	return reminderStamp(date);
}

export function reminderLabel(value: string): string {
	const [date, time] = value.split('T');
	return `${humanDay(date)} · ${humanTime(time)}`;
}

export function validReminder(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) && reminderStamp(date) === value;
}
