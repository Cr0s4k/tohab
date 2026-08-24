import { eq } from 'drizzle-orm';
import { db } from '../db.ts';
import { calendarPreferences } from '../schema.ts';

export async function calendarAlarmMinutes(userId: string): Promise<number | undefined> {
	const [row] = await db
		.select({ alarmMinutes: calendarPreferences.alarmMinutes })
		.from(calendarPreferences)
		.where(eq(calendarPreferences.userId, userId))
		.limit(1);
	return row?.alarmMinutes;
}

export async function setCalendarAlarmMinutes(userId: string, alarmMinutes: number): Promise<void> {
	const updatedAt = Date.now();
	await db
		.insert(calendarPreferences)
		.values({ userId, alarmMinutes, updatedAt })
		.onConflictDoUpdate({
			target: calendarPreferences.userId,
			set: { alarmMinutes, updatedAt }
		});
}
