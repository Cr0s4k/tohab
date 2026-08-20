/** In-memory stand-in for db/lazy.ts, built from the real schemas. See activity-e2e.hooks.mjs. */
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { RxDBDevModePlugin, disableWarnings } from 'rxdb/plugins/dev-mode';
import { RxDBMigrationPlugin } from 'rxdb/plugins/migration-schema';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import {
	activitySchema,
	habitLogSchema,
	habitSchema,
	projectSchema,
	taskSchema
} from '../src/lib/db/schemas.ts';

disableWarnings();
addRxPlugin(RxDBDevModePlugin);
addRxPlugin(RxDBMigrationPlugin);
addRxPlugin(RxDBUpdatePlugin);

let pending: Promise<unknown> | null = null;

async function create() {
	const db = await createRxDatabase({
		name: 'activitye2e',
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
		eventReduce: true
	});
	await db.addCollections({
		tasks: { schema: taskSchema, migrationStrategies: { 1: (doc) => doc } },
		projects: { schema: projectSchema },
		habits: { schema: habitSchema },
		habitLogs: { schema: habitLogSchema },
		activity: { schema: activitySchema }
	});
	return db;
}

export function getDb(): Promise<any> {
	if (!pending) pending = create();
	return pending as Promise<any>;
}

export async function removeDb() {
	pending = null;
}
