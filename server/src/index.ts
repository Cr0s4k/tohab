import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import {
	COLLECTIONS,
	clockSkew,
	docsSince,
	getDoc,
	rowToDoc,
	stats,
	transaction,
	writeDoc
} from './db.ts';

const PORT = Number(process.env.PORT ?? 5178);

type PushRow = {
	assumedMasterState?: Record<string, unknown>;
	newDocumentState: Record<string, unknown>;
};

const app = new Hono();
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'x-user-id'] }));

/** Single-user today, but every row is scoped by user id so auth can be added later. */
function userOf(header: string | undefined, query?: string): string {
	return (header || query || 'local').slice(0, 64);
}

const listeners = new Map<string, Set<() => void>>();

function notify(userId: string, except?: string) {
	for (const [key, set] of listeners) {
		if (key !== userId) continue;
		for (const fn of set) fn();
	}
	void except;
}

const sync = new Hono();

sync.get('/pull', (c) => {
	const collection = c.req.query('collection') ?? '';
	if (!COLLECTIONS.has(collection)) return c.json({ error: 'unknown collection' }, 400);

	const userId = userOf(c.req.header('x-user-id'));
	const cursor = Number(c.req.query('cursor') ?? 0) || 0;
	const id = c.req.query('id') ?? '';
	const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 100)));

	const rows = docsSince(userId, collection, cursor, id, limit);
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

	const userId = userOf(c.req.header('x-user-id'));
	const rows = body.rows ?? [];

	const conflicts = transaction(() => {
		const out: Record<string, unknown>[] = [];
		for (const row of rows) {
			const incoming = row.newDocumentState;
			if (!incoming?.id) continue;

			const existing = getDoc(userId, collection, String(incoming.id));

			// Last-write-wins per document, gated on the client having seen the current master.
			if (existing) {
				const master = rowToDoc(existing);
				const assumed = row.assumedMasterState;
				if (!assumed || Number(assumed.updatedAt ?? -1) !== Number(master.updatedAt ?? -2)) {
					out.push(master);
					continue;
				}
			}

			writeDoc(userId, collection, incoming);
		}
		return out;
	});

	if (rows.length > conflicts.length) notify(userId);
	return c.json(conflicts);
});

sync.get('/events', (c) => {
	const userId = userOf(c.req.header('x-user-id'), c.req.query('userId'));

	return streamSSE(c, async (stream) => {
		let wake: (() => void) | null = null;
		const queue: (() => void)[] = [];

		const push = () => {
			if (wake) wake();
			else queue.push(() => {});
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
					if (queue.length) {
						queue.length = 0;
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

sync.get('/status', (c) => {
	const userId = userOf(c.req.header('x-user-id'), c.req.query('userId'));
	return c.json({
		ok: true,
		userId,
		serverTime: Date.now(),
		collections: stats(userId),
		clockSkew: clockSkew(userId)
	});
});

app.route('/sync', sync);
app.get('/', (c) => c.text('tohab sync server'));

serve({ fetch: app.fetch, port: PORT }, (info) => {
	console.log(`tohab sync server listening on http://localhost:${info.port}/sync`);
});
