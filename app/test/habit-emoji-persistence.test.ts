import assert from 'node:assert/strict';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { getDb } from './activity-e2e-db.ts';
import { createHabit, updateHabit } from '../src/lib/habits.ts';
import { habitSchema } from '../src/lib/db/schemas.ts';
import { migrateHabitV3, migrateHabitV4 } from '../src/lib/db/migrations.ts';

const db = await getDb();
const emoji = '👩🏿‍❤️‍💋‍👨🏻'; // More than eight code points, but one grapheme.
const habit = await createHabit({
	name: 'Read', emoji: ` ${emoji}📖 `, color: '', goal: 'build', kind: 'binary',
	target: 1, unit: '', scheduleKind: 'daily', weekdays: [], timesPerWeek: 3
});
try {
	assert.equal(habit.emoji, emoji);
	assert.equal((await db.habits.findOne(habit.id).exec()).emoji, emoji);
	await updateHabit(habit.id, { emoji: '👨‍👩‍👧‍👦💪' });
	assert.equal((await db.habits.findOne(habit.id).exec()).emoji, '👨‍👩‍👧‍👦');
	await updateHabit(habit.id, { name: 'Renamed' });
	assert.equal((await db.habits.findOne(habit.id).exec()).emoji, '👨‍👩‍👧‍👦');
	await updateHabit(habit.id, { emoji });
	assert.equal((await db.habits.findOne(habit.id).exec()).emoji, emoji);
} finally {
	await db.close();
}

// Existing databases upgrade without rewriting icons or audit timestamps.
const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
const oldSchema = structuredClone(habitSchema);
oldSchema.version = 3;
oldSchema.properties.emoji = { type: 'string', maxLength: 8 };
const legacy = { ...habit, emoji: '💪📖' };
const oldDb = await createRxDatabase({ name: 'habitemojimigration', storage, multiInstance: false });
await oldDb.addCollections({ habits: { schema: oldSchema, migrationStrategies: {
	1: (doc) => doc, 2: (doc) => doc, 3: migrateHabitV3
} } });
await oldDb.habits.insert(legacy);
await oldDb.close();
const upgraded = await createRxDatabase({ name: 'habitemojimigration', storage, multiInstance: false });
try {
	await upgraded.addCollections({ habits: { schema: habitSchema, migrationStrategies: {
		1: (doc) => doc, 2: (doc) => doc, 3: migrateHabitV3, 4: migrateHabitV4
	} } });
	const migrated = await upgraded.habits.findOne(habit.id).exec();
	assert.deepEqual(migrated?.toJSON(), legacy);
	await migrated!.patch({ emoji });
	assert.equal((await upgraded.habits.findOne(habit.id).exec())?.emoji, emoji);
} finally {
	await upgraded.remove();
}
console.log('Habit emoji persistence passed: create, update, long sequences and schema migration.');
