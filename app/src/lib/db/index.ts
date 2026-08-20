import {
	addRxPlugin,
	createRxDatabase,
	type RxCollection,
	type RxDatabase,
	type RxStorage
} from 'rxdb';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { dev } from '$app/environment';
import {
	activitySchema,
	habitLogSchema,
	habitSchema,
	projectSchema,
	taskSchema,
	type Activity,
	type Habit,
	type HabitLog,
	type Project,
	type Task
} from './schemas.ts';

export type Collections = {
	tasks: RxCollection<Task>;
	projects: RxCollection<Project>;
	habits: RxCollection<Habit>;
	habitLogs: RxCollection<HabitLog>;
	activity: RxCollection<Activity>;
};

export type Db = RxDatabase<Collections>;

let pending: Promise<Db> | null = null;

async function create(): Promise<Db> {
	addRxPlugin(RxDBLeaderElectionPlugin);
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
		name: 'tohab',
		storage,
		multiInstance: true,
		eventReduce: true,
		cleanupPolicy: {}
	});

	await db.addCollections({
		tasks: { schema: taskSchema },
		projects: { schema: projectSchema },
		habits: { schema: habitSchema },
		habitLogs: { schema: habitLogSchema },
		activity: { schema: activitySchema }
	});

	return db;
}

/** Drops the Dexie databases RxDB keeps for this app, without needing to open them first. */
async function wipeStorage() {
	const found = await indexedDB.databases();
	await Promise.all(
		found
			.filter((d) => d.name?.startsWith('rxdb-dexie-tohab'))
			.map(
				(d) =>
					new Promise<void>((resolve) => {
						const req = indexedDB.deleteDatabase(d.name!);
						req.onsuccess = req.onerror = req.onblocked = () => resolve();
					})
			)
	);
}

/**
 * A schema change without a migration leaves the stored database unopenable, which would
 * otherwise mean a permanently blank app. The local store is a cache of what the server
 * holds, so dropping it and starting over is the recoverable choice.
 */
async function open(): Promise<Db> {
	try {
		return await create();
	} catch (err) {
		console.warn('local database could not be opened; resetting it', err);
		await wipeStorage();
		return create();
	}
}

export function getDb(): Promise<Db> {
	if (!pending) pending = open();
	return pending;
}

/**
 * Deletes the local store outright. Used when the signed-in account changes: RxDB documents
 * carry no owner, so leaving another account's rows behind would push them up as this one's.
 */
export async function removeDb() {
	try {
		const db = await getDb();
		await db.remove();
	} catch {
		await wipeStorage();
	}
	pending = null;
}
