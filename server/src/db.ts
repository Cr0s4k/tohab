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
		data        TEXT    NOT NULL,
		PRIMARY KEY (user_id, collection, id)
	);

	CREATE INDEX IF NOT EXISTS docs_cursor ON docs (user_id, collection, rev, id);

	CREATE TABLE IF NOT EXISTS revs (
		user_id TEXT NOT NULL PRIMARY KEY,
		value   INTEGER NOT NULL
	);
`);

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
	data: string;
};

const selectSince = db.prepare(`
	SELECT id, rev, deleted, updated_at, data FROM docs
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
	`SELECT id, rev, deleted, updated_at, data FROM docs WHERE user_id = ? AND collection = ? AND id = ?`
);

export function getDoc(userId: string, collection: string, id: string): DocRow | undefined {
	return selectOne.get(userId, collection, id) as DocRow | undefined;
}

const upsert = db.prepare(`
	INSERT INTO docs (user_id, collection, id, rev, deleted, updated_at, data)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT (user_id, collection, id) DO UPDATE SET
		rev = excluded.rev,
		deleted = excluded.deleted,
		updated_at = excluded.updated_at,
		data = excluded.data
`);

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
	const rows = db
		.prepare(
			`SELECT collection, COUNT(*) AS total, SUM(deleted) AS deleted
			 FROM docs WHERE user_id = ? GROUP BY collection`
		)
		.all(userId) as { collection: string; total: number; deleted: number }[];
	return rows;
}
