import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { requireAuth, type AuthedEnv } from '../auth.ts';
import {
	COLLECTIONS,
	clockSkew,
	docsSince,
	getDocForUpdate,
	rowToDoc,
	stats,
	transaction,
	writeDoc
} from '../db.ts';

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
		const conflicts = await transaction(async (tx) => {
			const out: Record<string, unknown>[] = [];
			for (const row of rows) {
				const incoming = row.newDocumentState;
				if (!incoming?.id) continue;

				const existing = await getDocForUpdate(tx, userId, collection, String(incoming.id));
				if (existing) {
					const master = rowToDoc(existing);
					const assumed = row.assumedMasterState;
					if (!assumed || Number(assumed.updatedAt ?? -1) !== Number(master.updatedAt ?? -2)) {
						out.push(master);
						continue;
					}
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
