import { createHmac, timingSafeEqual } from 'node:crypto';

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
};

export type FeedOptions = {
	/** Minutes before a timed task that its alarm fires. 0 disables alarms entirely. */
	alarmMinutes?: number;
	name?: string;
	projects?: Map<string, string>;
	now?: number;
};

/**
 * Feed URLs are handed to third parties (Google fetches them anonymously, and they end up in
 * that history for good), so they must not carry the sync user id: that id is the only
 * credential the sync API has, and leaking it would grant read *and* write access. An HMAC of
 * the id is one-way, so a leaked feed URL exposes nothing but the feed.
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

function escape(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

/** RFC 5545 caps content lines at 75 octets, continued by a leading space. */
function fold(line: string): string {
	const bytes = Buffer.from(line, 'utf8');
	if (bytes.length <= 75) return line;

	const parts: string[] = [];
	let cut = 0;
	while (cut < bytes.length) {
		let take = Math.min(parts.length ? 74 : 75, bytes.length - cut);
		// Never split a multi-byte character: 0b10xxxxxx bytes are continuations.
		while (take > 1 && cut + take < bytes.length && (bytes[cut + take] & 0xc0) === 0x80) take--;
		parts.push(bytes.subarray(cut, cut + take).toString('utf8'));
		cut += take;
	}
	return parts.join('\r\n ');
}

function stampUtc(ms: number): string {
	return `${new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

function dateOnly(due: string): string {
	return due.replace(/-/g, '');
}

function shiftDate(due: string, days: number): string {
	const [y, m, d] = due.split('-').map(Number);
	const shifted = new Date(Date.UTC(y, m - 1, d + days));
	return shifted.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Local wall-clock, deliberately without a TZID or trailing Z. Tohab stores `due`/`dueTime` as
 * whatever the device's calendar showed, with no zone attached, so a floating time is the
 * honest translation: the calendar client renders it in its own zone, and 9am stays 9am after
 * the reader travels.
 */
function floating(due: string, time: string, addMinutes = 0): string {
	const [y, m, d] = due.split('-').map(Number);
	const [hh, mm] = time.split(':').map(Number);
	const at = new Date(Date.UTC(y, m - 1, d, hh, mm + addMinutes));
	return at.toISOString().replace(/[-:]/g, '').slice(0, 15);
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

export function taskToEvent(task: FeedTask, options: FeedOptions = {}): string[] {
	const { alarmMinutes = 0, projects, now = Date.now() } = options;
	const lines: string[] = ['BEGIN:VEVENT', `UID:task-${task.id}@tohab`, `DTSTAMP:${stampUtc(now)}`];

	if (task.dueTime) {
		lines.push(`DTSTART:${floating(task.due, task.dueTime)}`);
		lines.push(`DTEND:${floating(task.due, task.dueTime, TASK_DURATION_MINUTES)}`);
	} else {
		lines.push(`DTSTART;VALUE=DATE:${dateOnly(task.due)}`);
		lines.push(`DTEND;VALUE=DATE:${shiftDate(task.due, 1)}`);
	}

	const rrule = toRrule(task.repeat);
	if (rrule) lines.push(`RRULE:${rrule}`);

	lines.push(`SUMMARY:${escape(task.title || 'Untitled task')}`);
	if (task.notes) lines.push(`DESCRIPTION:${escape(task.notes)}`);

	const project = task.projectId ? projects?.get(task.projectId) : undefined;
	if (project) lines.push(`CATEGORIES:${escape(project)}`);

	const priority = PRIORITY[task.priority];
	if (priority) lines.push(`PRIORITY:${priority}`);

	if (task.updatedAt) lines.push(`LAST-MODIFIED:${stampUtc(task.updatedAt)}`);

	// An alarm relative to an all-day event fires at midnight in most clients, which is noise
	// rather than a reminder, so only timed tasks get one.
	if (alarmMinutes > 0 && task.dueTime) {
		lines.push(
			'BEGIN:VALARM',
			'ACTION:DISPLAY',
			`DESCRIPTION:${escape(task.title || 'Untitled task')}`,
			`TRIGGER;RELATED=START:-PT${alarmMinutes}M`,
			'END:VALARM'
		);
	}

	lines.push('END:VEVENT');
	return lines;
}

export function buildCalendar(tasks: FeedTask[], options: FeedOptions = {}): string {
	const { name = 'Tohab' } = options;

	const due = tasks
		.filter((task) => task.due && !task.done)
		.sort((a, b) => `${a.due}${a.dueTime}`.localeCompare(`${b.due}${b.dueTime}`));

	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//tohab//calendar//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:${escape(name)}`,
		'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
		'X-PUBLISHED-TTL:PT1H',
		...due.flatMap((task) => taskToEvent(task, options)),
		'END:VCALENDAR'
	];

	return `${lines.map(fold).join('\r\n')}\r\n`;
}
