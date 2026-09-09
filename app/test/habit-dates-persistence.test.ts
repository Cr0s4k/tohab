import assert from 'node:assert/strict';
import { getDb } from './activity-e2e-db.ts';
import { createHabit, updateHabit, setLog, habitStartDate, toLogMap } from '../src/lib/habits.ts';
import { applyRevert } from '../src/lib/activity.ts';
import { exportBackup, importBackup } from '../src/lib/backup.ts';
import { today } from '../src/lib/dates.ts';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { habitSchema } from '../src/lib/db/schemas.ts';

const db = await getDb();
const input = { name: 'Read', emoji: '📖', color: '', goal: 'build' as const, kind: 'quantity' as const,
	target: 10, unit: 'pages', scheduleKind: 'daily' as const, weekdays: [], timesPerWeek: 3 };
const habit = await createHabit(input);
assert.equal(habit.startDate, today());
await assert.rejects(createHabit({ ...input, startDate: '2026-02-30' }), /valid start date/);
await updateHabit(habit.id, { startDate: '2026-08-01', createdAt: 0 });
const dated = (await db.habits.findOne(habit.id).exec()).toMutableJSON();
assert.equal(dated.createdAt, habit.createdAt);
await setLog(dated, '2026-08-03', 10);
await assert.rejects(updateHabit(habit.id, { startDate: '2026-08-04' }), /entry on/);
await assert.rejects(setLog(dated, '2026-07-31', 10), /start date/);
assert.equal((await db.habitLogs.findOne(`${habit.id}:2026-08-03`).exec()).value, 10);
await assert.rejects(applyRevert([{ collection: 'habits', id: habit.id,
	before: { ...dated, startDate: '2026-08-04' }, after: dated }]), /earlier day has an entry/);
assert.equal((await db.habits.findOne(habit.id).exec()).startDate, '2026-08-01');

const oldSnapshot = { ...dated, name: 'Old title' };
delete oldSnapshot.startDate;
delete oldSnapshot.historyVersion;
await applyRevert([{ collection: 'habits', id: habit.id, before: oldSnapshot, after: dated }]);
assert.equal((await db.habits.findOne(habit.id).exec()).startDate, '2026-08-01');
const backup = await exportBackup();
assert.equal(backup.data.habits[0].startDate, '2026-08-01');
delete backup.data.habits[0].startDate;
await importBackup(JSON.stringify(backup));
assert.equal((await db.habits.findOne(habit.id).exec()).startDate, '2026-08-01');
backup.data.habits[0].startDate = '2026-08-04';
await assert.rejects(importBackup(JSON.stringify(backup)), /conflicts with a habit start date/);
assert.equal((await db.habits.findOne(habit.id).exec()).startDate, '2026-08-01');

// Legacy history can arrive after its habit, and never changes an explicit date.
const legacy = { ...oldSnapshot, id: 'legacy', createdAt: Date.parse('2026-08-10T23:30:00Z') };
await db.habits.insert(legacy);
await db.habitLogs.insert({ id: 'legacy:2026-08-02', habitId: 'legacy', date: '2026-08-02', value: 10, updatedAt: Date.now() });
const logs = toLogMap((await db.habitLogs.find({ selector: { habitId: 'legacy' } }).exec()).map((log: any) => log.toMutableJSON()));
assert.equal(habitStartDate(legacy, logs), '2026-08-02');
assert.equal(habitStartDate({ ...legacy, startDate: '2026-08-05' }, logs), '2026-08-05');
await db.close();
const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
const oldSchema = structuredClone(habitSchema);
oldSchema.version = 0;
Reflect.deleteProperty(oldSchema.properties, 'startDate');
Reflect.deleteProperty(oldSchema.properties, 'historyVersion');
const oldDb = await createRxDatabase({ name: 'habitdatemigration', storage, multiInstance: false });
await oldDb.addCollections({ habits: { schema: oldSchema } });
await oldDb.habits.insert(legacy);
await oldDb.close();
const upgraded = await createRxDatabase({ name: 'habitdatemigration', storage, multiInstance: false });
try {
	await upgraded.addCollections({ habits: { schema: habitSchema, migrationStrategies: { 1: (doc) => doc, 2: (doc) => doc, 3: (doc) => doc } } });
	assert.deepEqual((await upgraded.habits.findOne('legacy').exec())?.toJSON(), legacy);
} finally {
	await upgraded.remove();
}
console.log('Habit date persistence passed: defaults, validation, logs, undo, backups and legacy history.');
