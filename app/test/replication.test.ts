/**
 * End-to-end replication test against a running sync server.
 * Uses RxDB's in-memory storage so it can run in Node, but exercises the real schemas
 * and the real pull/push handler contract the browser app uses.
 */
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { RxDBDevModePlugin, disableWarnings } from 'rxdb/plugins/dev-mode';
import { RxDBMigrationPlugin } from 'rxdb/plugins/migration-schema';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { Subject } from 'rxjs';
import {
	activitySchema,
	habitLogSchema,
	habitRevisionSchema,
	habitSchema,
	projectSchema,
	taskSchema,
	COLLECTION_NAMES
} from '../src/lib/db/schemas.ts';
import { migrateHabitV3, migrateHabitV4, migrateTaskV2, migrateTaskV3, migrateTaskV4 } from '../src/lib/db/migrations.ts';
import { createReporter } from '../../test/assertions.ts';
import { habitOn, withHabitHistory } from '../src/lib/habitHistory.ts';

import { cleanup, signIn } from './auth.ts';

const BASE = process.env.BASE ?? 'http://localhost:5178/sync';

disableWarnings();
addRxPlugin(RxDBDevModePlugin);
addRxPlugin(RxDBMigrationPlugin);
addRxPlugin(RxDBUpdatePlugin);

const reporter = createReporter();
const check = reporter.check;

async function makeDb(name: string) {
	const db = await createRxDatabase({
		name,
		storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
		multiInstance: false,
		eventReduce: true
	});
	await db.addCollections({
		tasks: { schema: taskSchema, migrationStrategies: { 1: (doc) => doc, 2: migrateTaskV2, 3: migrateTaskV3, 4: migrateTaskV4 } },
		projects: { schema: projectSchema },
		habits: { schema: habitSchema, migrationStrategies: { 1: (doc) => doc, 2: (doc) => doc, 3: migrateHabitV3, 4: migrateHabitV4 } },
		habitRevisions: { schema: habitRevisionSchema },
		habitLogs: { schema: habitLogSchema },
		activity: { schema: activitySchema }
	});
	return db;
}

const headers = { 'content-type': 'application/json', 'x-tohab-habit-history': '1', cookie: (await signIn('rxtest')).cookie };

function startReplication(db: any, name: string) {
	const stream$ = new Subject<any>();
	const state = replicateRxCollection<any, { cursor: number; id: string }>({
		collection: db[name],
		replicationIdentifier: `${name}-${BASE}`,
		live: true,
		retryTime: 500,
		waitForLeadership: false,
		pull: {
			batchSize: 100,
			stream$: stream$.asObservable(),
			async handler(checkpoint, batchSize) {
				const q = new URLSearchParams({
					collection: name,
					limit: String(batchSize),
					cursor: String(checkpoint?.cursor ?? 0),
					id: checkpoint?.id ?? ''
				});
				const res = await fetch(`${BASE}/pull?${q}`, { headers });
				if (!res.ok) throw new Error(`pull ${res.status}`);
				return res.json();
			}
		},
		push: {
			batchSize: 50,
			async handler(rows) {
				const res = await fetch(`${BASE}/push`, {
					method: 'POST',
					headers,
					body: JSON.stringify({ collection: name, rows })
				});
				if (!res.ok) throw new Error(`push ${res.status}`);
				return res.json();
			}
		}
	});
	state.error$.subscribe((e) => console.log(`   [repl:${name}] error`, e.message));
	return { state, stream$ };
}

function task(id: string, over: Record<string, unknown> = {}) {
	return {
		id,
		title: id,
		notes: '',
		done: false,
		completedAt: 0,
		due: '',
		dueTime: '',
		priority: 4,
		projectId: '',
		createdAt: 1,
		updatedAt: Date.now(),
		...over
	};
}

// --- schema validity is checked by dev-mode at addCollections time ---
const deviceA = await makeDb('device_a');
check('schemas accepted by RxDB dev-mode', COLLECTION_NAMES.every((n) => Boolean(deviceA[n])), true);

// A habit with every schema field exercised, so enum/index constraints are proven.
await deviceA.habits.insert({
	id: 'h1',
	startDate: '2026-08-19',
	historyVersion: 1,
	name: 'Drink water',
	emoji: '💧',
	color: 'oklch(0.65 0.16 250)',
	goal: 'build',
	kind: 'quantity',
	target: 8,
	unit: 'glasses',
	scheduleKind: 'weekdays',
	weekdays: [1, 2, 3, 4, 5],
	timesPerWeek: 3,
	archived: false,
	createdAt: Date.now(),
	updatedAt: Date.now()
});
await deviceA.habitLogs.insert({
	id: 'h1:2026-08-19',
	habitId: 'h1',
	date: '2026-08-19',
	value: 8,
	updatedAt: Date.now()
});
await deviceA.habitRevisions.insert({
	id: 'h1', habitId: 'h1', effectiveFrom: '0001-01-01', goal: 'build', kind: 'quantity', target: 8, unit: 'glasses',
	scheduleKind: 'weekdays', weekdays: [1, 2, 3, 4, 5], timesPerWeek: 3, createdAt: 0, updatedAt: Date.now()
});
await deviceA.habitRevisions.insert({
	id: 'h1-new-target', habitId: 'h1', effectiveFrom: '2026-08-20', goal: 'build', kind: 'quantity', target: 12, unit: 'glasses',
	scheduleKind: 'weekdays', weekdays: [1, 2, 3, 4, 5], timesPerWeek: 3, createdAt: Date.now(), updatedAt: Date.now()
});
await deviceA.tasks.insert(task('a1', { title: 'From A', priority: 1, due: '2026-08-20' }));
await deviceA.tasks.insert(task('a1-child', { title: 'Synced subtask', parentId: 'a1' }));
await deviceA.projects.insert({
	id: 'p1',
	name: 'Work',
	color: 'red',
	createdAt: Date.now(),
	updatedAt: Date.now()
});
check('local writes accepted', await deviceA.tasks.count().exec(), 2);

// --- push everything up ---
const replA = COLLECTION_NAMES.map((n) => startReplication(deviceA, n));
await Promise.all(replA.map((r) => r.state.awaitInSync()));

const serverTasks = await (await fetch(`${BASE}/pull?collection=tasks&cursor=0&id=&limit=100`, { headers })).json();
check('task reached the server', serverTasks.documents.map((d: any) => d.title).sort(), ['From A', 'Synced subtask']);
check(
	'parentId reached the server',
	serverTasks.documents.find((d: any) => d.id === 'a1-child')?.parentId,
	'a1'
);
const serverHabits = await (await fetch(`${BASE}/pull?collection=habits&cursor=0&id=&limit=100`, { headers })).json();
check('habit reached the server', serverHabits.documents.map((d: any) => d.name), ['Drink water']);

// --- a second device pulls the same state down ---
const deviceB = await makeDb('device_b');
const replB = COLLECTION_NAMES.map((n) => startReplication(deviceB, n));
await Promise.all(replB.map((r) => r.state.awaitInSync()));

check('B received the task', (await deviceB.tasks.find().exec()).map((d: any) => d.title).sort(), ['From A', 'Synced subtask']);
check('B received parentId', (await deviceB.tasks.findOne('a1-child').exec())?.parentId, 'a1');
check('B received the habit target', (await deviceB.habits.findOne('h1').exec())?.target, 8);
check('B received the local habit start date', (await deviceB.habits.findOne('h1').exec())?.startDate, '2026-08-19');
check('B received baseline and revised rules', (await deviceB.habitRevisions.find().exec()).length, 2);
check('B received dated target', (await deviceB.habitRevisions.findOne('h1-new-target').exec())?.target, 12);
check('B received the weekdays array', (await deviceB.habits.findOne('h1').exec())?.weekdays, [1, 2, 3, 4, 5]);
check('B received the log', (await deviceB.habitLogs.findOne('h1:2026-08-19').exec())?.value, 8);

// --- an edit on B converges back to A ---
const onB = await deviceB.tasks.findOne('a1').exec();
await onB!.patch({ title: 'Edited on B', done: true, updatedAt: Date.now() });
await Promise.all(replB.map((r) => r.state.awaitInSync()));
replA.forEach((r) => r.stream$.next('RESYNC'));
await Promise.all(replA.map((r) => r.state.awaitInSync()));

check('A converged on B’s edit', (await deviceA.tasks.findOne('a1').exec())?.title, 'Edited on B');
check('A converged on the done flag', (await deviceA.tasks.findOne('a1').exec())?.done, true);

// --- a delete on A becomes a tombstone that removes the doc on B ---
await deviceA.tasks.insert(task('a2', { title: 'Doomed' }));
await Promise.all(replA.map((r) => r.state.awaitInSync()));
replB.forEach((r) => r.stream$.next('RESYNC'));
await Promise.all(replB.map((r) => r.state.awaitInSync()));
check('B saw the new task', Boolean(await deviceB.tasks.findOne('a2').exec()), true);

await (await deviceA.tasks.findOne('a2').exec())!.remove();
await Promise.all(replA.map((r) => r.state.awaitInSync()));
replB.forEach((r) => r.stream$.next('RESYNC'));
await Promise.all(replB.map((r) => r.state.awaitInSync()));
check('delete propagated to B', await deviceB.tasks.findOne('a2').exec(), null);

// --- offline edits queue and flush on reconnect ---
await Promise.all(replA.map((r) => r.state.cancel()));
await deviceA.tasks.insert(task('a3', { title: 'Written while offline' }));
check('offline write is local-only', Boolean(await deviceB.tasks.findOne('a3').exec()), false);

const replA2 = COLLECTION_NAMES.map((n) => startReplication(deviceA, n));
await Promise.all(replA2.map((r) => r.state.awaitInSync()));
replB.forEach((r) => r.stream$.next('RESYNC'));
await Promise.all(replB.map((r) => r.state.awaitInSync()));
check('queued offline write flushed after reconnect', (await deviceB.tasks.findOne('a3').exec())?.title, 'Written while offline');

await Promise.all([...replA2, ...replB].map((r) => r.state.cancel()));

// Concurrent offline rule edits have distinct ids, so both survive replication.
// Their deterministic date/time/id order must select the same winner on both devices.
const offlineRule = { habitId: 'h1', effectiveFrom: '2026-09-01', goal: 'build', kind: 'quantity', unit: 'glasses',
	scheduleKind: 'daily', weekdays: [], timesPerWeek: 3, createdAt: Date.now() + 100, updatedAt: Date.now() + 100 };
await deviceA.habitRevisions.insert({ ...offlineRule, id: 'offline-a', target: 16 });
await deviceB.habitRevisions.insert({ ...offlineRule, id: 'offline-b', target: 20 });
const historyA = startReplication(deviceA, 'habitRevisions');
const historyB = startReplication(deviceB, 'habitRevisions');
await Promise.all([historyA.state.awaitInSync(), historyB.state.awaitInSync()]);
historyA.stream$.next('RESYNC');
historyB.stream$.next('RESYNC');
await Promise.all([historyA.state.awaitInSync(), historyB.state.awaitInSync()]);
for (const [label, device] of [['A', deviceA], ['B', deviceB]] as const) {
	const revisions = (await device.habitRevisions.find().exec()).map((revision: any) => revision.toMutableJSON());
	const habit = (await device.habits.findOne('h1').exec())!.toMutableJSON();
	check(`${label} retains both offline revisions`, revisions.length, 4);
	check(`${label} selects the same offline target`, habitOn(withHabitHistory(habit, revisions), '2026-09-02').target, 20);
	check(`${label} keeps the earlier historical target`, habitOn(withHabitHistory(habit, revisions), '2026-08-19').target, 8);
}
await Promise.all([historyA.state.cancel(), historyB.state.cancel()]);
await deviceA.close();
await deviceB.close();

await cleanup();

reporter.finish();
