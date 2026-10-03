import { createHmac, timingSafeEqual } from 'node:crypto';
import ical, {
	ICalCalendarMethod,
	ICalEventStatus,
	type ICalEventData
} from 'ical-generator';

export type FeedTask = {
	id: string;
	title: string;
	notes: string;
	done: boolean;
	due: string;
	dueTime: string;
	priority: number;
	projectId: string;
	repeat?: string;
	updatedAt: number;
	/** Server-owned event revision. It is the document revision, not the client clock. */
	sequence?: number;
	/** Server receipt time used to keep DTSTAMP stable between feed requests. */
	dtstamp?: number;
	/** Optional event modification time override used by cancellation snapshots. */
	lastModified?: number;
	/** The original recurrence instance, when a publication snapshot has one. */
	recurrenceId?: string;
	/** A cancelled entry is a retained tombstone for a formerly published event. */
	status?: 'CANCELLED';
	cancelledAt?: number;
	_deleted?: boolean;
};

export type FeedOptions = {
	name?: string;
	projects?: Map<string, string>;
	now?: number;
	tombstoneRetentionMs?: number;
};

export const DEFAULT_TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Feed URLs are handed to third parties (Google fetches them anonymously, and they end up in
 * that history for good), so they must not carry the user id. An HMAC of the id is one-way,
 * so a leaked feed URL exposes nothing but the feed.
 */
export function feedToken(secret: string, userId: string): string {
	return createHmac('sha256', secret).update(userId).digest('hex').slice(0, 32);
}

/** Build the externally reachable subscription URL when a deployment provides one. */
export function publicCalendarFeedUrl(
	baseUrl: string | undefined,
	token: string
): string | undefined {
	const configured = baseUrl?.trim();
	if (!configured) return undefined;

	const url = new URL(configured);
	if (!['http:', 'https:'].includes(url.protocol)) {
		throw new Error('CALENDAR_PUBLIC_BASE_URL must use http or https');
	}
	if (url.username || url.password) {
		throw new Error('CALENDAR_PUBLIC_BASE_URL must not contain credentials');
	}

	url.search = '';
	url.hash = '';
	url.pathname = `${url.pathname.replace(/\/+$/, '')}/${encodeURIComponent(token)}/tohab.ics`;
	return url.toString();
}

export function resolveFeedToken(
	secret: string,
	token: string,
	users: string[]
): string | undefined {
	const candidate = Buffer.from(token.toLowerCase());
	return users.find((userId) => {
		const expected = Buffer.from(feedToken(secret, userId));
		return expected.length === candidate.length && timingSafeEqual(expected, candidate);
	});
}

/**
 * Local wall-clock, deliberately without a TZID or trailing Z. Tohab stores `due`/`dueTime` as
 * whatever the device's calendar showed, with no zone attached, so a floating time is the
 * honest translation: the calendar client renders it in its own zone, and 9am stays 9am after
 * the reader travels.
 */
function calendarDate(due: string, time = ''): Date {
	const [y, m, d] = due.split('-').map(Number);
	const [hh, mm] = time ? time.split(':').map(Number) : [0, 0];
	return new Date(Date.UTC(y, m - 1, d, hh, mm));
}

function recurrenceDate(value: string): Date {
	const basic = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(value);
	if (basic) {
		return new Date(
			Date.UTC(
				Number(basic[1]),
				Number(basic[2]) - 1,
				Number(basic[3]),
				Number(basic[4] ?? 0),
				Number(basic[5] ?? 0),
				Number(basic[6] ?? 0)
			)
		);
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) throw new Error('Invalid calendar recurrence ID');
	return parsed;
}

function exactRecurrenceId(value: string): string | undefined {
	return /^\d{8}(?:T\d{6}Z?)?$/.test(value) ? value : undefined;
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * The compact rule the app stores on a task — `[!]unit:interval[:extra]`, mirroring
 * `app/src/lib/repeat.ts` — as an RFC 5545 recurrence.
 *
 * `!` rules are deliberately left out: those count from whenever the task is actually
 * completed, so no fixed schedule describes them and only the current due date is known.
 */
export function toRrule(rule: string | undefined): string {
	if (!rule || rule.startsWith('!')) return '';

	const [unit, rawInterval, extra] = rule.split(':');
	const freq = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[unit];
	if (!freq) return '';

	const interval = Number(rawInterval);
	if (!Number.isInteger(interval) || interval < 1 || interval > 999) return '';

	const parts = [`FREQ=${freq}`];
	if (interval > 1) parts.push(`INTERVAL=${interval}`);

	if (unit === 'week' && extra) {
		const days = extra.split(',').map(Number);
		if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return '';
		parts.push(`BYDAY=${days.map((d) => BYDAY[d]).join(',')}`);
	}
	if ((unit === 'month' || unit === 'year') && extra) {
		const day = Number(extra);
		if (!Number.isInteger(day) || day < 1 || day > 31) return '';
		parts.push(`BYMONTHDAY=${day}`);
	}

	return parts.join(';');
}

/** iCalendar priority runs 1 (highest) to 9; 0 means unset, which is Tohab's own P4. */
const PRIORITY: Record<number, number> = { 1: 1, 2: 3, 3: 6 };

const TASK_DURATION_MINUTES = 30;

function eventData(task: FeedTask, options: FeedOptions = {}): ICalEventData {
	const { projects, now = Date.now() } = options;
	const start = calendarDate(task.due, task.dueTime);
	const allDay = !task.dueTime;
	const end = new Date(
		start.getTime() + (allDay ? 24 * 60 : TASK_DURATION_MINUTES) * 60 * 1000
	);
	const rrule = toRrule(task.repeat);
	const project = task.projectId ? projects?.get(task.projectId) : undefined;
	const lastModified = task.lastModified ?? task.updatedAt;

	return {
		id: `task-${task.id}@tohab`,
		sequence: Number.isInteger(task.sequence) && task.sequence! >= 0 ? task.sequence : 0,
		stamp: new Date(task.dtstamp ?? now),
		start,
		end,
		allDay,
		floating: !allDay,
		recurrenceId: task.recurrenceId ? recurrenceDate(task.recurrenceId) : null,
		repeating: rrule ? `RRULE:${rrule}` : null,
		summary: task.title || 'Untitled task',
		description: task.notes || null,
		categories: project ? [{ name: project }] : undefined,
		priority: PRIORITY[task.priority] ?? null,
		lastModified: lastModified ? new Date(lastModified) : null,
		status: task.status === 'CANCELLED' ? ICalEventStatus.CANCELLED : null
	};
}

function calendarFor(options: FeedOptions = {}) {
	return ical({
		name: options.name ?? 'Tohab',
		prodId: '//tohab//calendar//EN',
		scale: 'GREGORIAN',
		method: ICalCalendarMethod.PUBLISH
	}).ttl(60 * 60);
}

export function taskToEvent(task: FeedTask, options: FeedOptions = {}): string[] {
	const calendar = calendarFor(options);
	const event = calendar.createEvent(eventData(task, options));
	const lines = event.toString().trimEnd().split('\r\n');

	// Keep the exact stored RECURRENCE-ID spelling/value, including a possible trailing Z.
	const recurrenceId = task.recurrenceId ? exactRecurrenceId(task.recurrenceId) : undefined;
	if (recurrenceId) {
		const index = lines.findIndex((line) => line.startsWith('RECURRENCE-ID:'));
		if (index >= 0) lines[index] = `RECURRENCE-ID:${recurrenceId}`;
	}
	return lines;
}

export function buildCalendar(tasks: FeedTask[], options: FeedOptions = {}): string {
	const {
		name = 'Tohab',
		now = Date.now(),
		tombstoneRetentionMs = DEFAULT_TOMBSTONE_RETENTION_MS
	} = options;

	const byUid = new Map<string, FeedTask>();
	for (const task of tasks) {
		const cancelled = task.status === 'CANCELLED';
		if (!task.due || (!cancelled && (task.done || task._deleted))) continue;
		if (
			cancelled &&
			task.cancelledAt !== undefined &&
			now - task.cancelledAt > tombstoneRetentionMs
		) {
			continue;
		}

		const uid = `task-${task.id}@tohab`;
		const existing = byUid.get(uid);
		if (!existing || eventWins(task, existing)) byUid.set(uid, task);
	}

	const due = [...byUid.values()].sort((a, b) => {
		const dateOrder = `${a.due}${a.dueTime}`.localeCompare(`${b.due}${b.dueTime}`);
		return dateOrder || `task-${a.id}@tohab`.localeCompare(`task-${b.id}@tohab`);
	});

	const calendar = calendarFor({ ...options, name });
	for (const task of due) calendar.createEvent(eventData(task, options));
	let body = calendar.toString();
	let recurrenceIndex = 0;
	body = body.replace(/RECURRENCE-ID:[^\r\n]*/g, (line) => {
		while (recurrenceIndex < due.length && !due[recurrenceIndex].recurrenceId) recurrenceIndex++;
		const recurrenceId = due[recurrenceIndex++]?.recurrenceId;
		const exact = recurrenceId ? exactRecurrenceId(recurrenceId) : undefined;
		return exact ? `RECURRENCE-ID:${exact}` : line;
	});
	return `${body}\r\n`;
}

function eventWins(candidate: FeedTask, existing: FeedTask): boolean {
	const candidateSequence = Number.isInteger(candidate.sequence) ? candidate.sequence! : -1;
	const existingSequence = Number.isInteger(existing.sequence) ? existing.sequence! : -1;
	if (candidateSequence !== existingSequence) return candidateSequence > existingSequence;
	return candidate.status === 'CANCELLED' && existing.status !== 'CANCELLED';
}
