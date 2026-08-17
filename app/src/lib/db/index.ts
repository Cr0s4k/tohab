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
	habitLogSchema,
	habitSchema,
	projectSchema,
	taskSchema,
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
		habitLogs: { schema: habitLogSchema }
	});

	return db;
}

export function getDb(): Promise<Db> {
	if (!pending) pending = create();
	return pending;
}
