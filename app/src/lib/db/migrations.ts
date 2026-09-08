/** parentId is optional, so v1 rows are already valid v2 rows. */
export function migrateTaskV2<T extends Record<string, unknown>>(doc: T): T {
	return doc;
}

/** reminderMinutes is optional, so v2 rows inherit the automatic reminder default. */
export function migrateTaskV3<T extends Record<string, unknown>>(doc: T): T {
	return doc;
}

/** Independent reminders are optional; existing tasks keep their timed reminder behavior. */
export function migrateTaskV4<T extends Record<string, unknown>>(doc: T): T {
	return doc;
}
