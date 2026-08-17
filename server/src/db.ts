import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const FILE = process.env.TOHAB_DB ?? './data/tohab.sqlite';

if (FILE !== ':memory:') mkdirSync(dirname(FILE), { recursive: true });

export const db = new DatabaseSync(FILE);

db.exec(`
	PRAGMA journal_mode = WAL;
	PRAGMA foreign_keys = ON;

	CREATE TABLE IF NOT EXISTS docs (
		user_id     TEXT    NOT NULL,
		collection  TEXT    NOT NULL,
		id          TEXT    NOT NULL,
		rev         INTEGER NOT NULL,
		deleted     INTEGER NOT NULL DEFAULT 0,
		updated_at  INTEGER NOT NULL,
		received_at INTEGER NOT NULL DEFAULT 0,
		data        TEXT    NOT NULL,
		PRIMARY KEY (user_id, collection, id)
	);

	CREATE INDEX IF NOT EXISTS docs_cursor ON docs (user_id, collection, rev, id);

	CREATE TABLE IF NOT EXISTS revs (
		user_id TEXT NOT NULL PRIMARY KEY,
		value   INTEGER NOT NULL
	);
`);

// CREATE TABLE above is a no-op on an existing database, so columns added later must be
// migrated in explicitly — and any index over them created only once they exist.
const columns = (db.prepare(`PRAGMA table_info(docs)`).all() as { name: string }[]).map(
	(c) => c.name
);
if (!columns.includes('received_at')) {
	db.exec(`ALTER TABLE docs ADD COLUMN received_at INTEGER NOT NULL DEFAULT 0`);
}

db.exec(`CREATE INDEX IF NOT EXISTS docs_received ON docs (user_id, received_at)`);

export const COLLECTIONS = new Set(['tasks', 'projects', 'habits', 'habitLogs']);

/**
 * A server-owned monotonic revision per user. Pull checkpoints ride on this rather than
 * on client clocks, so a device with a skewed clock can never make the cursor skip
 * documents that have not been replicated yet.
 */
const bumpRev = db.prepare(`
	INSERT INTO revs (user_id, value) VALUES (?, 1)
	ON CONFLICT (user_id) DO UPDATE SET value = value + 1
	RETURNING value
`);

export function nextRev(userId: string): number {
	const row = bumpRev.get(userId) as { value: number };
	return row.value;
}

export type DocRow = {
	id: string;
	rev: number;
	deleted: number;
	updated_at: number;
	received_at: number;
	data: string;
};

const selectSince = db.prepare(`
	SELECT id, rev, deleted, updated_at, received_at, data FROM docs
	WHERE user_id = ? AND collection = ? AND (rev > ? OR (rev = ? AND id > ?))
	ORDER BY rev ASC, id ASC
	LIMIT ?
`);

export function docsSince(
	userId: string,
	collection: string,
	cursor: number,
	id: string,
	limit: number
): DocRow[] {
	return selectSince.all(userId, collection, cursor, cursor, id, limit) as DocRow[];
}

const selectOne = db.prepare(
	`SELECT id, rev, deleted, updated_at, received_at, data FROM docs WHERE user_id = ? AND collection = ? AND id = ?`
);

export function getDoc(userId: string, collection: string, id: string): DocRow | undefined {
	return selectOne.get(userId, collection, id) as DocRow | undefined;
}

const upsert = db.prepare(`
	INSERT INTO docs (user_id, collection, id, rev, deleted, updated_at, received_at, data)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT (user_id, collection, id) DO UPDATE SET
		rev = excluded.rev,
		deleted = excluded.deleted,
		updated_at = excluded.updated_at,
		received_at = excluded.received_at,
		data = excluded.data
`);

/**
 * `updated_at` is the client's own clock and travels with the document as data.
 * `received_at` is stamped here from the server clock, giving one trustworthy timeline
 * for auditing and debugging regardless of how wrong any device's clock is.
 */
export function writeDoc(userId: string, collection: string, doc: Record<string, unknown>) {
	const id = String(doc.id);
	const deleted = doc._deleted ? 1 : 0;
	const updatedAt = Number(doc.updatedAt ?? 0);
	upsert.run(
		userId,
		collection,
		id,
		nextRev(userId),
		deleted,
		updatedAt,
		Date.now(),
		JSON.stringify({ ...doc, _deleted: Boolean(doc._deleted) })
	);
}

export function rowToDoc(row: DocRow): Record<string, unknown> {
	return { ...JSON.parse(row.data), _deleted: row.deleted === 1 };
}

export function transaction<T>(fn: () => T): T {
	db.exec('BEGIN IMMEDIATE');
	try {
		const result = fn();
		db.exec('COMMIT');
		return result;
	} catch (err) {
		db.exec('ROLLBACK');
		throw err;
	}
}

export function stats(userId: string) {
	return db
		.prepare(
			`SELECT collection,
			        COUNT(*)            AS total,
			        SUM(deleted)        AS deleted,
			        MAX(received_at)    AS lastReceivedAt,
			        MAX(updated_at)     AS lastClientUpdatedAt
			 FROM docs WHERE user_id = ? GROUP BY collection`
		)
		.all(userId) as {
		collection: string;
		total: number;
		deleted: number;
		lastReceivedAt: number;
		lastClientUpdatedAt: number;
	}[];
}

/**
 * How far each collection's newest client timestamp drifts from the server's own clock.
 * A large positive skew means some device's clock runs ahead; useful when diagnosing
 * "why did my edit look older than it should".
 */
export function clockSkew(userId: string) {
	const now = Date.now();
	return stats(userId).map((row) => ({
		collection: row.collection,
		skewMs: row.lastClientUpdatedAt ? row.lastClientUpdatedAt - now : 0
	}));
}
