export type ReminderTask = {
	id: string;
	title: string;
	due: string;
	dueTime: string;
	reminderMinutes?: number;
	reminders?: string[];
	done?: boolean;
	_deleted?: boolean;
};

export type DueReminder = {
	key: string;
	dueAt: number;
	notifyAt: number;
	title: string;
	body?: string;
};

const LATE_GRACE_MS = 15 * 60_000;

export function validPushEndpoint(endpoint: string): boolean {
	try {
		const url = new URL(endpoint);
		if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return false;
		if (url.port && url.port !== '443') return false;
		const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
		const browserPushService =
			host === 'fcm.googleapis.com' ||
			host === 'web.push.apple.com' ||
			host === 'push.services.mozilla.com' ||
			host.endsWith('.push.services.mozilla.com') ||
			host === 'notify.windows.com' ||
			host.endsWith('.notify.windows.com');
		if (!browserPushService) return false;
		if (host === 'localhost' || host.endsWith('.local') || host === '::1') return false;
		if (host.includes(':') && /^(fc|fd|fe8|fe9|fea|feb)/.test(host)) return false;
		const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
		if (match) {
			const octets = match.slice(1).map(Number);
			if (octets.some((part) => part > 255)) return false;
			if (octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || octets[0] >= 224) return false;
			if (octets[0] === 169 && octets[1] === 254) return false;
			if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
			if (octets[0] === 192 && octets[1] === 168) return false;
		}
		return true;
	} catch {
		return false;
	}
}

/** Independent reminders do not depend on the task's date, time, or automatic setting. */
export function remindersForTask(task: ReminderTask, timeZone: string, leadMinutes: number, now = Date.now()): DueReminder[] {
	if (task.done || task._deleted) return [];
	const automatic = reminderForTask(task, timeZone, leadMinutes, now);
	const reminders: DueReminder[] = automatic ? [{ ...automatic, body: `Due at ${task.dueTime}` }] : [];
	for (const value of new Set(Array.isArray(task.reminders) ? task.reminders : [])) {
		if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) continue;
		const [date, time] = value.split('T');
		const notifyAt = zonedDateTime(date, time, timeZone);
		if (notifyAt === null || now < notifyAt || now >= notifyAt + LATE_GRACE_MS) continue;
		reminders.push({
			key: `${task.id}:reminder:${value}:${timeZone}`,
			dueAt: notifyAt,
			notifyAt,
			title: task.title || 'Task reminder',
			body: 'Task reminder'
		});
	}
	return reminders;
}

export function validTimeZone(timeZone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
		return true;
	} catch {
		return false;
	}
}

function partsAt(timestamp: number, timeZone: string) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(new Date(timestamp));
	const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
	return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}

/** Converts a wall-clock date/time in an IANA zone to an instant, including DST at that date. */
export function zonedDateTime(date: string, time: string, timeZone: string): number | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !validTimeZone(timeZone)) return null;
	const [year, month, day] = date.split('-').map(Number);
	const [hour, minute] = time.split(':').map(Number);
	if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
	const desired = Date.UTC(year, month - 1, day, hour, minute);
	let instant = desired;
	for (let pass = 0; pass < 3; pass += 1) {
		const shown = partsAt(instant, timeZone);
		const offset = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second) - instant;
		instant = desired - offset;
	}
	return instant;
}

export function reminderForTask(task: ReminderTask, timeZone: string, leadMinutes: number, now = Date.now()): DueReminder | null {
	if (task.done || task._deleted || !task.dueTime || !Number.isFinite(leadMinutes)) return null;
	const dueAt = zonedDateTime(task.due, task.dueTime, timeZone);
	if (dueAt === null) return null;
	const requestedLead = task.reminderMinutes ?? leadMinutes;
	if (!Number.isFinite(requestedLead) || requestedLead < 0) return null;
	const lead = Math.min(1440, Math.round(requestedLead));
	const notifyAt = dueAt - lead * 60_000;
	if (now < notifyAt || now >= dueAt + LATE_GRACE_MS) return null;
	return {
		key: `${task.id}:${task.due}T${task.dueTime}:${timeZone}:${lead}`,
		dueAt,
		notifyAt,
		title: task.title || 'Task due'
	};
}
