import {
	bigint,
	boolean,
	index,
	integer,
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

/** Server-owned publication history for calendar events and their retained cancellations. */
export const calendarPublications = pgTable(
	'calendar_publications',
	{
		userId: text('user_id').notNull(),
		taskId: text('task_id').notNull(),
		active: boolean('active').notNull(),
		/** The docs revision that produced this event version and its SEQUENCE value. */
		sequence: bigint('sequence', { mode: 'number' }).notNull(),
		/** First server receipt at which this task became calendar eligible. */
		publishedAt: bigint('published_at', { mode: 'number' }).notNull(),
		/** Server receipt time of the current active/cancelled version. */
		changedAt: bigint('changed_at', { mode: 'number' }).notNull(),
		/** Zero for active entries; set when the cancellation is created. */
		cancelledAt: bigint('cancelled_at', { mode: 'number' }).notNull().default(0),
		/** Client document timestamp retained for LAST-MODIFIED compatibility. */
		lastModified: bigint('last_modified', { mode: 'number' }).notNull(),
		/** The last calendar-eligible task shape, including its date and recurrence. */
		data: jsonb('data').notNull().$type<Record<string, unknown>>()
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.taskId] }),
		index('calendar_publications_retention').on(t.userId, t.cancelledAt)
	]
);

export type CalendarPublicationRow = typeof calendarPublications.$inferSelect;

/**
 * Accounts. `docs.user_id` points here by convention rather than a foreign key: sync writes
 * must not be able to fail on a constraint the client cannot see or repair.
 */
export const users = pgTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	createdAt: bigint('created_at', { mode: 'number' }).notNull()
});

export type UserRow = typeof users.$inferSelect;

/**
 * Server-side values that must survive a restart: the HMAC key that calendar feed URLs are
 * derived from (regenerating it would silently break every subscription already added to
 * someone's calendar client) and the key that signs session cookies.
 */
export const secrets = pgTable('secrets', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

/** Per-account options used when rendering the stable calendar subscription URL. */
export const calendarPreferences = pgTable('calendar_preferences', {
	userId: text('user_id').primaryKey(),
	alarmMinutes: integer('alarm_minutes').notNull().default(10),
	updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
});

/** Browser push endpoints are server-owned credentials and never enter the replicated store. */
export const pushSubscriptions = pgTable(
	'push_subscriptions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull(),
		endpoint: text('endpoint').notNull().unique(),
		p256dh: text('p256dh').notNull(),
		auth: text('auth').notNull(),
		timeZone: text('time_zone').notNull(),
		leadMinutes: integer('lead_minutes').notNull().default(10),
		lastSuccessAt: bigint('last_success_at', { mode: 'number' }).notNull().default(0),
		failureCount: integer('failure_count').notNull().default(0),
		createdAt: bigint('created_at', { mode: 'number' }).notNull(),
		updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
	},
	(t) => [index('push_subscriptions_user').on(t.userId)]
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

/** One row per delivered task occurrence prevents duplicate reminders across scheduler ticks. */
export const pushReminders = pgTable(
	'push_reminders',
	{
		subscriptionId: text('subscription_id').notNull(),
		taskId: text('task_id').notNull(),
		reminderKey: text('reminder_key').notNull(),
		sentAt: bigint('sent_at', { mode: 'number' }).notNull()
	},
	(t) => [
		primaryKey({ columns: [t.subscriptionId, t.reminderKey] }),
		index('push_reminders_sent').on(t.sentAt)
	]
);
