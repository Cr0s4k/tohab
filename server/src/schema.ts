import {
	bigint,
	boolean,
	index,
	jsonb,
	pgSequence,
	pgTable,
	primaryKey,
	text
} from 'drizzle-orm/pg-core';

/**
 * Server-owned revision source for pull checkpoints. A sequence leaves gaps and interleaves
 * across users, both harmless: cursors only ever compare `rev > checkpoint` within one
 * user and collection, and monotonicity is what the checkpoint relies on.
 */
export const docsRev = pgSequence('docs_rev');

export const docs = pgTable(
	'docs',
	{
		userId: text('user_id').notNull(),
		collection: text('collection').notNull(),
		id: text('id').notNull(),
		rev: bigint('rev', { mode: 'number' }).notNull(),
		deleted: boolean('deleted').notNull().default(false),
		/**
		 * Epoch milliseconds from the writing device's own clock, carried on the document and
		 * compared for conflict detection. bigint, not integer: epoch ms overflows int4.
		 */
		updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
		/** Epoch milliseconds from the server's clock — the one timeline no device can skew. */
		receivedAt: bigint('received_at', { mode: 'number' }).notNull(),
		data: jsonb('data').notNull().$type<Record<string, unknown>>()
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.collection, t.id] }),
		index('docs_cursor').on(t.userId, t.collection, t.rev, t.id),
		index('docs_received').on(t.userId, t.receivedAt)
	]
);

export type DocRow = typeof docs.$inferSelect;

/**
 * Server-side values that must survive a restart. Currently just the HMAC key that calendar
 * feed URLs are derived from: regenerating it would silently break every subscription
 * already added to someone's calendar client.
 */
export const secrets = pgTable('secrets', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});
