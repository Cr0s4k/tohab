import assert from 'node:assert/strict';
import { parseQuickAdd } from '../src/lib/parse.ts';
import { suggestedReminder, validReminder } from '../src/lib/reminders.ts';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBMigrationPlugin } from 'rxdb/plugins/migration-schema';
import { taskSchema } from '../src/lib/db/schemas.ts';
import { migrateTaskV2, migrateTaskV3, migrateTaskV4 } from '../src/lib/db/migrations.ts';

const base = new Date(2026, 8, 8, 10, 0);
assert.equal(suggestedReminder('tomorrow', base), '2026-09-09T09:00');
assert.equal(suggestedReminder('later', base), '2026-09-08T14:00');
assert.equal(suggestedReminder('hour', base), '2026-09-08T11:00');
assert.equal(suggestedReminder('tomorrow', new Date(2026, 11, 31, 23)), '2027-01-01T09:00');
assert.equal(validReminder('2026-02-30T09:00'), false);
assert.equal(validReminder('2026-09-09T25:00'), false);
assert.equal(validReminder('2026-09-09T09:00'), true);

for (const [syntax, expected] of [
	['!tomorrow', '2026-09-09T09:00'],
	['!tmr 3pm', '2026-09-09T15:00'],
	['!later', '2026-09-08T14:00'],
	['!1h', '2026-09-08T11:00'],
	['!2h30m', '2026-09-08T12:30'],
	['!30m', '2026-09-08T10:30'],
	['!3pm', '2026-09-08T15:00'],
	['!9am', '2026-09-09T09:00'],
	['!mon 9am', '2026-09-14T09:00']
]) {
	const task = parseQuickAdd(`Buy groceries ${syntax}`, base);
	assert.deepEqual(task.reminders, [expected], syntax);
	assert.equal(task.title, 'Buy groceries', syntax);
	assert.equal(task.due, '', 'reminders must not date the task');
	assert.equal(task.dueTime, '', 'reminders must not add a due time');
}
const timed = parseQuickAdd('Call tomorrow 5pm !tomorrow !1h p2 #work', base);
assert.equal(timed.due, '2026-09-09');
assert.equal(timed.dueTime, '17:00');
assert.equal(timed.priority, 2);
assert.equal(timed.project, 'work');
assert.deepEqual(timed.reminders, ['2026-09-09T09:00', '2026-09-08T11:00']);
assert.deepEqual(parseQuickAdd('Call !tomorrow !tomorrow', base).reminders, ['2026-09-09T09:00']);
assert.equal(parseQuickAdd('Call !!1 !tomorrow', base).priority, 1);
assert.equal(parseQuickAdd('Call !nonsense', base).title, 'Call !nonsense');
console.log('ok independent reminder suggestions and shortcuts');

addRxPlugin(RxDBMigrationPlugin);
const storage = getRxStorageMemory();
const previousSchema = structuredClone(taskSchema);
previousSchema.version = 3;
Reflect.deleteProperty(previousSchema.properties, 'reminders');
const previous = await createRxDatabase({ name: 'remindermigration', storage, multiInstance: false });
await previous.addCollections({ tasks: { schema: previousSchema, migrationStrategies: { 1: (doc) => doc, 2: migrateTaskV2, 3: migrateTaskV3 } } });
const legacy = { id: 'legacy', title: 'Existing task', notes: '', done: false, completedAt: 0, due: '2026-09-09', dueTime: '10:00', reminderMinutes: 30, priority: 4, projectId: '', createdAt: 1, updatedAt: 1 };
await previous.tasks.insert(legacy);
await previous.close();
const upgraded = await createRxDatabase({ name: 'remindermigration', storage, multiInstance: false });
try {
	await upgraded.addCollections({ tasks: { schema: taskSchema, migrationStrategies: { 1: (doc) => doc, 2: migrateTaskV2, 3: migrateTaskV3, 4: migrateTaskV4 } } });
	assert.deepEqual((await upgraded.tasks.findOne('legacy').exec())?.toJSON(), legacy, 'migration preserves existing task data and automatic override');
} finally {
	await upgraded.remove();
}
console.log('ok task schema migration preserves existing reminders');
