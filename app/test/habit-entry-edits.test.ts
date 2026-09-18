import assert from 'node:assert/strict';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { getDb } from './activity-e2e-db.ts';
import { createHabit, setLog } from '../src/lib/habits.ts';
import { migrateHabitLogV1 } from '../src/lib/db/migrations.ts';
import { habitLogSchema } from '../src/lib/db/schemas.ts';
import { today } from '../src/lib/dates.ts';

const db = await getDb();
const day = today();
const habit = await createHabit({
	name: 'Read',
	emoji: '📖',
	color: '',
	goal: 'build',
	kind: 'quantity',
	target: 10,
	unit: 'pages',
	scheduleKind: 'daily',
	weekdays: [],
	timesPerWeek: 7,
	startDate: day
});
const findLog = () => db.habitLogs.findOne(`${habit.id}:${day}`).exec();

await setLog(habit, day, 1);
const first = (await findLog())!.toMutableJSON();
assert.equal(first.editedAt, undefined, 'first logging does not mark an entry edited');
const firstUpdatedAt = first.updatedAt;
const activityCount = await db.activity.count().exec();

await setLog(habit, day, 1);
const unchanged = (await findLog())!.toMutableJSON();
assert.equal(unchanged.updatedAt, firstUpdatedAt, 'unchanged save does not rewrite the log');
assert.equal(unchanged.editedAt, undefined, 'unchanged save does not add an edit marker');
assert.equal(await db.activity.count().exec(), activityCount, 'unchanged save does not add activity');

await setLog(habit, day, 2);
const edited = (await findLog())!.toMutableJSON();
assert.equal(edited.value, 2);
assert.equal(edited.editedAt, edited.updatedAt, 'a real change stores its edit timestamp');
const lastEditedAt = edited.editedAt;

await setLog(habit, day, 2);
assert.equal((await findLog())!.toMutableJSON().editedAt, lastEditedAt, 'unchanged save preserves the last edit time');

await setLog(habit, day, 0);
assert.equal(await findLog(), null, 'clearing removes the entry and its marker');
await setLog(habit, day, 3);
assert.equal((await findLog())!.toMutableJSON().editedAt, undefined, 'relogging a cleared day starts a new entry');

await db.close();

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
const oldSchema = structuredClone(habitLogSchema);
oldSchema.version = 0;
Reflect.deleteProperty(oldSchema.properties, 'editedAt');
const legacy = { id: 'legacy:2026-09-18', habitId: 'legacy', date: '2026-09-18', value: 1, updatedAt: 1 };
const oldDb = await createRxDatabase({ name: 'habitentrymigration', storage, multiInstance: false });
await oldDb.addCollections({ habitLogs: { schema: oldSchema } });
await oldDb.habitLogs.insert(legacy);
await oldDb.close();

const upgraded = await createRxDatabase({ name: 'habitentrymigration', storage, multiInstance: false });
try {
	await upgraded.addCollections({ habitLogs: { schema: habitLogSchema, migrationStrategies: { 1: migrateHabitLogV1 } } });
	assert.deepEqual((await upgraded.habitLogs.findOne(legacy.id).exec())?.toJSON(), legacy, 'legacy logs migrate without becoming edited');
} finally {
	await upgraded.remove();
}

console.log('Habit entry edit checks passed: first log, no-op save, edits, clearing, relogging and migration.');
