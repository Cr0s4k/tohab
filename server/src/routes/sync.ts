import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { requireAuth, type AuthedEnv } from '../auth.ts';
import { transaction } from '../db.ts';
import {
	COLLECTIONS,
	clockSkew,
	docsSince,
	getDocForUpdate,
	rowToDoc,
	stats,
	writeDoc
} from '../repositories/documents.ts';

type PushRow = {
	assumedMasterState?: Record<string, unknown>;
	newDocumentState: Record<string, unknown>;
};

const listeners = new Map<string, Set<() => void>>();

function notify(userId: string) {
	for (const listener of listeners.get(userId) ?? []) listener();
}

export function createSyncRoutes() {
	const sync = new Hono<AuthedEnv>();
	sync.use('*', requireAuth);

	sync.get('/pull', async (c) => {
		const collection = c.req.query('collection') ?? '';
		if (!COLLECTIONS.has(collection)) return c.json({ error: 'unknown collection' }, 400);

		const userId = c.get('userId');
		const cursor = Number(c.req.query('cursor') ?? 0) || 0;
		const id = c.req.query('id') ?? '';
		const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 100)));
		const rows = await docsSince(userId, collection, cursor, id, limit);
		const last = rows.at(-1);

		return c.json({
			documents: rows.map(rowToDoc),
			checkpoint: last ? { cursor: last.rev, id: last.id } : { cursor, id }
		});
	});

	sync.post('/push', async (c) => {
		const body = (await c.req.json()) as { collection?: string; rows?: PushRow[] };
		const collection = body.collection ?? '';
		if (!COLLECTIONS.has(collection)) return c.json({ error: 'unknown collection' }, 400);

		const userId = c.get('userId');
		const rows = body.rows ?? [];
		const understandsHistory = c.req.header('x-tohab-habit-history') === '1';
		if (collection === 'habitRevisions' && !understandsHistory) {
			return c.json({ error: 'Update Tohab to sync habit history.' }, 426);
		}
		const conflicts = await transaction(async (tx) => {
			const out: Record<string, unknown>[] = [];
			for (const row of rows) {
				const incoming = row.newDocumentState;
				if (!incoming?.id) continue;
				if (collection === 'habits' && incoming.historyVersion && !understandsHistory) {
					throw new HTTPException(426, { message: 'Update Tohab to sync habit history.' });
				}
				if (collection === 'habitLogs' && !understandsHistory && incoming.habitId) {
					const habit = await getDocForUpdate(tx, userId, 'habits', String(incoming.habitId));
					if (habit?.data.historyVersion) throw new HTTPException(426, { message: 'Update Tohab to log habits with saved history.' });
				}

				const existing = await getDocForUpdate(tx, userId, collection, String(incoming.id));
				if (existing) {
					const master = rowToDoc(existing);
					if (collection === 'habits' && !understandsHistory &&
						(master.historyVersion || incoming.historyVersion || await getDocForUpdate(tx, userId, 'habitRevisions', String(incoming.id)))) {
						throw new HTTPException(426, { message: 'Update Tohab to edit habits with saved history.' });
					}
					const assumed = row.assumedMasterState;
					if (!assumed || Number(assumed.updatedAt ?? -1) !== Number(master.updatedAt ?? -2)) {
						out.push(master);
						continue;
					}
					// Older clients replace the whole document without knowing this field.
					if (collection === 'habits' && incoming.startDate === undefined && master.startDate) {
						incoming.startDate = master.startDate;
					}
					if (collection === 'habits' && master.historyVersion) incoming.historyVersion = master.historyVersion;
				}

				await writeDoc(tx, userId, collection, incoming);
			}
			return out;
		});

		if (rows.length > conflicts.length) notify(userId);
		return c.json(conflicts);
	});

	sync.get('/events', (c) => {
		const userId = c.get('userId');
		return streamSSE(c, async (stream) => {
			let wake: (() => void) | null = null;
			let queued = false;
			const push = () => {
				if (wake) wake();
				else queued = true;
			};

			const set = listeners.get(userId) ?? new Set();
			set.add(push);
			listeners.set(userId, set);
			stream.onAbort(() => {
				set.delete(push);
				if (!set.size) listeners.delete(userId);
			});

			await stream.writeSSE({ event: 'ready', data: '1' });
			while (!stream.aborted) {
				const changed = await Promise.race([
					new Promise<boolean>((resolve) => {
						wake = () => resolve(true);
						if (queued) {
							queued = false;
							resolve(true);
						}
					}),
					new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 25_000))
				]);
				wake = null;
				if (stream.aborted) break;
				await stream.writeSSE(changed ? { event: 'change', data: '1' } : { event: 'ping', data: '1' });
			}
		});
	});

	sync.get('/status', async (c) => {
		const userId = c.get('userId');
		return c.json({
			ok: true,
			userId,
			serverTime: Date.now(),
			collections: await stats(userId),
			clockSkew: await clockSkew(userId)
		});
	});

	return sync;
}
