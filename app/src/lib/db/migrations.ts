/** parentId is optional, so v1 rows are already valid v2 rows. */
export function migrateTaskV2<T extends Record<string, unknown>>(doc: T): T {
	return doc;
}
