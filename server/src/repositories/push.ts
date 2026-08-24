import { randomUUID } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db.ts';
import { pushReminders, pushSubscriptions, type PushSubscriptionRow } from '../schema.ts';

export async function upsertPushSubscription(input: {
	userId: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	timeZone: string;
	leadMinutes: number;
}): Promise<PushSubscriptionRow | null> {
	const now = Date.now();
	const inserted = await db
		.insert(pushSubscriptions)
		.values({ id: randomUUID(), ...input, createdAt: now, updatedAt: now })
		.onConflictDoNothing({ target: pushSubscriptions.endpoint })
		.returning();
	if (inserted[0]) return inserted[0];

	const updated = await db
		.update(pushSubscriptions)
		.set({
			p256dh: input.p256dh,
			auth: input.auth,
			timeZone: input.timeZone,
			leadMinutes: input.leadMinutes,
			updatedAt: now
		})
		.where(and(eq(pushSubscriptions.endpoint, input.endpoint), eq(pushSubscriptions.userId, input.userId)))
		.returning();
	return updated[0] ?? null;
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
	const removed = await db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
		.returning({ id: pushSubscriptions.id });
	for (const row of removed) {
		await db.delete(pushReminders).where(eq(pushReminders.subscriptionId, row.id));
	}
}

export async function deletePushSubscriptionById(id: string): Promise<void> {
	await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
	await db.delete(pushReminders).where(eq(pushReminders.subscriptionId, id));
}

export function allPushSubscriptions(): Promise<PushSubscriptionRow[]> {
	return db.select().from(pushSubscriptions);
}

export function pushSubscriptionsForUser(userId: string): Promise<PushSubscriptionRow[]> {
	return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

export async function recordPushSuccess(id: string): Promise<void> {
	await db
		.update(pushSubscriptions)
		.set({ lastSuccessAt: Date.now(), failureCount: 0 })
		.where(eq(pushSubscriptions.id, id));
}

export async function recordPushFailure(id: string): Promise<void> {
	await db
		.update(pushSubscriptions)
		.set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
		.where(eq(pushSubscriptions.id, id));
}

export async function claimPushReminder(
	subscriptionId: string,
	taskId: string,
	reminderKey: string
): Promise<boolean> {
	const claimed = await db
		.insert(pushReminders)
		.values({ subscriptionId, taskId, reminderKey, sentAt: Date.now() })
		.onConflictDoNothing()
		.returning({ subscriptionId: pushReminders.subscriptionId });
	return claimed.length === 1;
}

export async function releasePushReminder(subscriptionId: string, reminderKey: string): Promise<void> {
	await db
		.delete(pushReminders)
		.where(and(eq(pushReminders.subscriptionId, subscriptionId), eq(pushReminders.reminderKey, reminderKey)));
}

export async function prunePushReminders(before: number): Promise<void> {
	await db.delete(pushReminders).where(lt(pushReminders.sentAt, before));
}
