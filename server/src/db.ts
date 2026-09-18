import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
	calendarPreferences,
	calendarPublications,
	docs,
	pushReminders,
	pushSubscriptions,
	secrets,
	users
} from './schema.ts';

const CONNECTION = process.env.DATABASE_URL ?? 'postgresql://tohab:tohab@localhost:5432/tohab';
const pool = new Pool({ connectionString: CONNECTION, max: 10 });
const schema = { calendarPreferences, calendarPublications, docs, pushReminders, pushSubscriptions, secrets, users };

export const db = drizzle(pool, { schema });
export type Executor =
	| NodePgDatabase<typeof schema>
	| Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Schema lives in schema.ts and is applied by `drizzle-kit push`. Fail loudly if absent. */
export async function ensureSchema() {
	const { rows } = await pool.query(
		`SELECT to_regclass('public.docs') IS NOT NULL
		    AND to_regclass('public.calendar_publications') IS NOT NULL
		    AND to_regclass('public.calendar_preferences') IS NOT NULL
		    AND to_regclass('public.secrets') IS NOT NULL
		    AND to_regclass('public.users') IS NOT NULL
		    AND to_regclass('public.push_subscriptions') IS NOT NULL
		    AND to_regclass('public.push_reminders') IS NOT NULL AS ok`
	);
	if (!rows[0]?.ok) {
		console.error(
			`No schema in ${CONNECTION.replace(/:[^:@]*@/, ':***@')}. Run \`pnpm db:push\` first.`
		);
		process.exit(1);
	}
}

export function transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
	return db.transaction(fn);
}

export function closeDb() {
	return pool.end();
}
