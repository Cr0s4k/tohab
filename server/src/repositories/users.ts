import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { db } from '../db.ts';
import { users, type UserRow } from '../schema.ts';

export async function knownUsers(): Promise<string[]> {
	const rows = await db.select({ id: users.id }).from(users);
	return rows.map((row) => row.id);
}

export async function userCount(): Promise<number> {
	const [row] = await db.select({ total: count() }).from(users);
	return row?.total ?? 0;
}

export async function userById(id: string): Promise<UserRow | undefined> {
	const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	return row;
}

export async function userByEmail(email: string): Promise<UserRow | undefined> {
	const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
	return row;
}

/** Registration races resolve to the account that won the unique-email insert. */
export async function createUser(email: string, passwordHash: string): Promise<UserRow> {
	const inserted = await db
		.insert(users)
		.values({ id: randomUUID(), email, passwordHash, createdAt: Date.now() })
		.onConflictDoNothing()
		.returning();
	if (inserted[0]) return inserted[0];

	const existing = await userByEmail(email);
	if (!existing) throw new Error('could not create user');
	return existing;
}
