import {
	addRxPlugin,
	createRxDatabase,
	type RxCollection,
	type RxDatabase,
	type RxStorage
} from 'rxdb';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { RxDBMigrationPlugin } from 'rxdb/plugins/migration-schema';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { dev } from '$app/env';
import { migrateHabitV3, migrateHabitV4, migrateTaskV2, migrateTaskV3, migrateTaskV4 } from './migrations.ts';
import {
	activitySchema,
	habitEntryActionSchema,
	habitLogSchema,
	habitRevisionSchema,
	habitSchema,
	projectSchema,
	taskSchema,
	type Activity,
	type Habit,
	type HabitEntryAction,
	type HabitLog,
	type HabitRevision,
	type Project,
	type Task
} from './schemas.ts';

export type Collections = {
	tasks: RxCollection<Task>;
	projects: RxCollection<Project>;
	habits: RxCollection<Habit>;
	habitLogs: RxCollection<HabitLog>;
	habitEntryActions: RxCollection<HabitEntryAction>;
	habitRevisions: RxCollection<HabitRevision>;
	activity: RxCollection<Activity>;
};

export type Db = RxDatabase<Collections>;

let pending: Promise<Db> | null = null;

function currentDatabaseName(): string {
	return typeof localStorage === 'undefined' ? 'tohab' : localStorage.getItem('tohab.dbName') || 'tohab';
}

async function create(): Promise<Db> {
	addRxPlugin(RxDBLeaderElectionPlugin);
	addRxPlugin(RxDBMigrationPlugin);
	addRxPlugin(RxDBUpdatePlugin);

	let storage: RxStorage<unknown, unknown> = getRxStorageDexie();
	if (dev) {
		const { RxDBDevModePlugin, disableWarnings } = await import('rxdb/plugins/dev-mode');
		disableWarnings();
		addRxPlugin(RxDBDevModePlugin);
		// dev-mode refuses to run without a schema validator in front of the storage.
		const { wrappedValidateAjvStorage } = await import('rxdb/plugins/validate-ajv');
		storage = wrappedValidateAjvStorage({ storage });
	}

	const db = await createRxDatabase<Collections>({
		name: currentDatabaseName(),
		storage,
		multiInstance: true,
		eventReduce: true,
		cleanupPolicy: {}
	});

	await db.addCollections({
		// Both fields are optional so older rows remain valid while migrations advance metadata.
		tasks: {
			schema: taskSchema,
			migrationStrategies: { 1: (doc) => doc, 2: migrateTaskV2, 3: migrateTaskV3, 4: migrateTaskV4 }
		},
		projects: { schema: projectSchema },
		habits: { schema: habitSchema, migrationStrategies: { 1: (doc) => doc, 2: (doc) => doc, 3: migrateHabitV3, 4: migrateHabitV4 } },
		habitRevisions: { schema: habitRevisionSchema },
		habitLogs: { schema: habitLogSchema },
		habitEntryActions: { schema: habitEntryActionSchema },
		activity: { schema: activitySchema }
	});

	return db;
}

/** Delete only after every open connection has been closed. A blocked request is a failure,
 * not success: pretending otherwise can reload into the same broken store. */
async function deleteDatabase(name: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const req = indexedDB.deleteDatabase(name);
		req.onsuccess = () => {
			resolve();
		};
		req.onerror = () => {
			reject(req.error ?? new Error(`Could not delete ${name}`));
		};
		// A delete request cannot be cancelled after onblocked. Keep waiting so the UI never
		// reports failure while the browser may still delete the database after another tab closes.
		req.onblocked = () => {};
	});
}

async function wipeStorage(databaseName: string) {
	if (!indexedDB.databases) throw new Error('This browser cannot enumerate local databases safely.');
	const found = await indexedDB.databases();
	for (const db of found.filter((item) => item.name?.startsWith(`rxdb-dexie-${databaseName}`))) {
		await deleteDatabase(db.name!);
	}
}

/** Opening is deliberately non-destructive. The boot UI lets the person retry or explicitly
 * reset after seeing a classified explanation; no catch-all path may erase local-only data. */
export function getDb(): Promise<Db> {
	if (!pending) {
		pending = create().catch((error) => {
			pending = null;
			throw error;
		});
	}
	return pending;
}

export function retryDb(): Promise<Db> {
	pending = null;
	return getDb();
}

/** Close and forget the selected singleton before changing database ownership. */
export async function closeDb(): Promise<void> {
	const opening = pending;
	pending = null;
	if (!opening) return;
	try {
		const db = await opening;
		await db.close();
	} catch {
		// A failed open has no usable connection to close.
	}
}

/** Explicit destructive recovery for the currently selected server/account database. */
export async function removeDb() {
	const databaseName = currentDatabaseName();
	await closeDb();
	await wipeStorage(databaseName);
}
