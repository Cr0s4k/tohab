import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { requireAuth, type AuthedEnv } from '../auth.ts';
import {
	calendarDocs,
	calendarPublicationDocs,
	liveDocs
} from '../repositories/documents.ts';
import { persistedSecret } from '../repositories/secrets.ts';
import { knownUsers } from '../repositories/users.ts';
import {
	buildCalendar,
	DEFAULT_TOMBSTONE_RETENTION_MS,
	feedToken,
	publicCalendarFeedUrl,
	resolveFeedToken,
	type FeedTask
} from '../ics.ts';

const CALENDAR_PUBLIC_BASE_URL = process.env.CALENDAR_PUBLIC_BASE_URL;

if (CALENDAR_PUBLIC_BASE_URL) {
	void publicCalendarFeedUrl(CALENDAR_PUBLIC_BASE_URL, 'configuration-check');
}

function calendarSecret(): Promise<string> {
	return process.env.CALENDAR_SECRET
		? Promise.resolve(process.env.CALENDAR_SECRET)
		: persistedSecret('calendar');
}

function calendarTombstoneRetentionMs(): number {
	const days = Number(process.env.CALENDAR_TOMBSTONE_RETENTION_DAYS ?? 90);
	return Number.isFinite(days) && days >= 0
		? days * 24 * 60 * 60 * 1000
		: DEFAULT_TOMBSTONE_RETENTION_MS;
}

function feedTask(data: Record<string, unknown>, id: string, metadata: Partial<FeedTask> = {}): FeedTask {
	const task: FeedTask = {
		id,
		title: String(data.title ?? ''),
		notes: String(data.notes ?? ''),
		done: Boolean(data.done),
		due: String(data.due ?? ''),
		dueTime: String(data.dueTime ?? ''),
		priority: Number(data.priority ?? 4),
		projectId: String(data.projectId ?? ''),
		updatedAt: Number(data.updatedAt ?? 0),
		...metadata
	};
	if (typeof data.repeat === 'string' && data.repeat) task.repeat = data.repeat;
	if (typeof data.recurrenceId === 'string' && data.recurrenceId) task.recurrenceId = data.recurrenceId;
	return task;
}

function feedTasks(
	taskRows: Awaited<ReturnType<typeof calendarDocs>>,
	publications: Awaited<ReturnType<typeof calendarPublicationDocs>>,
	now: number,
	retentionMs: number
): FeedTask[] {
	const byTask = new Map(publications.map((publication) => [publication.taskId, publication]));
	const cutoff = now - retentionMs;
	const tasks: FeedTask[] = [];

	for (const row of taskRows) {
		const data = row.data as Record<string, unknown>;
		const eligible = !row.deleted && !Boolean(data._deleted) && !Boolean(data.done) && Boolean(data.due);
		if (eligible) {
			tasks.push(feedTask(data, row.id, {
				sequence: Number(row.rev),
				dtstamp: Number(row.receivedAt)
			}));
			continue;
		}

		// Only publication history can establish a schedule that needs cancelling.
		const publication = byTask.get(row.id);
		if (publication?.active) {
			// This also repairs a publication row if an older writer changed the task before the
			// publication table existed: the current document revision wins the cancellation.
			if (Number(row.receivedAt) < cutoff) continue;
			tasks.push(feedTask(publication.data, row.id, {
				status: 'CANCELLED',
				sequence: Number(row.rev),
				dtstamp: Number(row.receivedAt),
				lastModified: Number(data.updatedAt ?? publication.lastModified),
				cancelledAt: Number(row.receivedAt)
			}));
			continue;
		}

		if (publication && !publication.active && Number(publication.cancelledAt) >= cutoff) {
			tasks.push(feedTask(publication.data, row.id, {
				status: 'CANCELLED',
				sequence: Number(publication.sequence),
				dtstamp: Number(publication.changedAt),
				lastModified: Number(publication.lastModified),
				cancelledAt: Number(publication.cancelledAt)
			}));
			continue;
		}
	}

	return tasks;
}

export function createCalendarRoutes() {
	const calendar = new Hono<AuthedEnv>();

	calendar.get('/token', requireAuth, async (c) => {
		const token = feedToken(await calendarSecret(), c.get('userId'));
		const feedUrl = publicCalendarFeedUrl(CALENDAR_PUBLIC_BASE_URL, token);
		return c.json(feedUrl ? { token, feedUrl } : { token });
	});

	/** The unguessable token in the URL is the credential for calendar clients. */
	calendar.get('/:token/tohab.ics', async (c) => {
		const userId = resolveFeedToken(await calendarSecret(), c.req.param('token'), await knownUsers());
		if (!userId) return c.text('unknown calendar', 404);

		const [taskRows, projectRows, publicationRows] = await Promise.all([
			calendarDocs(userId),
			liveDocs(userId, 'projects'),
			calendarPublicationDocs(userId)
		]);
		const projects = new Map(
			projectRows.map((row) => [String(row.data.id), String(row.data.name ?? '')])
		);
		const now = Date.now();
		const tombstoneRetentionMs = calendarTombstoneRetentionMs();
		const tasks = feedTasks(taskRows, publicationRows, now, tombstoneRetentionMs);
		const body = buildCalendar(tasks, {
			name: 'Tohab',
			projects,
			now,
			tombstoneRetentionMs
		});
		const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
		const lastModified = Math.max(
			...taskRows.map((row) => Number(row.receivedAt)),
			...projectRows.map((row) => Number(row.receivedAt)),
			...publicationRows.map((row) => Number(row.changedAt)),
			0
		);

		c.header('content-type', 'text/calendar; charset=utf-8');
		c.header('cache-control', 'private, max-age=300');
		c.header('etag', etag);
		if (lastModified > 0) c.header('last-modified', new Date(lastModified).toUTCString());
		if (c.req.header('if-none-match') === etag) return c.body(null, 304);
		return c.body(body);
	});

	return calendar;
}
