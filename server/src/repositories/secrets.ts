import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db.ts';
import { secrets } from '../schema.ts';

/** Reads a persisted secret, minting one safely when multiple replicas race. */
export async function persistedGenerated(key: string, generate: () => string): Promise<string> {
	const [existing] = await db.select().from(secrets).where(eq(secrets.key, key)).limit(1);
	if (existing) return existing.value;

	const value = generate();
	await db.insert(secrets).values({ key, value }).onConflictDoNothing();
	const [row] = await db.select().from(secrets).where(eq(secrets.key, key)).limit(1);
	return row?.value ?? value;
}

export function persistedSecret(key: string): Promise<string> {
	return persistedGenerated(key, () => randomBytes(32).toString('hex'));
}
