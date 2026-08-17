import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const docs = sqliteTable(
	'docs',
	{
		userId: text('user_id').notNull(),
		collection: text('collection').notNull(),
		id: text('id').notNull(),
		/** Server-owned monotonic revision per user; pull checkpoints page through this. */
		rev: integer('rev').notNull(),
		deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
		/** The writing device's own clock, carried on the document and compared for conflicts. */
		updatedAt: integer('updated_at').notNull(),
		/** The server's clock at write time — the one timeline no device can skew. */
		receivedAt: integer('received_at').notNull(),
		data: text('data', { mode: 'json' }).notNull().$type<Record<string, unknown>>()
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.collection, t.id] }),
		index('docs_cursor').on(t.userId, t.collection, t.rev, t.id),
		index('docs_received').on(t.userId, t.receivedAt)
	]
);

export const revs = sqliteTable('revs', {
	userId: text('user_id').primaryKey(),
	value: integer('value').notNull()
});

export type DocRow = typeof docs.$inferSelect;
