import assert from 'node:assert/strict';
import { getDb } from './activity-e2e-db.ts';
import { createHabit, deleteHabit, setLog, touchEntry } from '../src/lib/habits.ts';
import { exportBackup } from '../src/lib/backup.ts';
import { revertActivity } from '../src/lib/activity.ts';

const db = await getDb();
const day = '2026-09-10';
const habit = await createHabit({
	name: 'Take sun',
	emoji: '☀️',
	color: '',
	goal: 'build',
	kind: 'quantity',
	target: 20,
	unit: 'minutes',
	scheduleKind: 'daily',
	weekdays: [],
	timesPerWeek: 7,
	startDate: '2026-09-01'
});

assert.equal(await db.habitEntryActions.findOne(`${habit.id}:${day}`).exec(), null);

// First logging is also an action; it does not depend on an earlier log row.
const firstLogDay = '2026-09-09';
await setLog(habit, firstLogDay, 5);
assert.ok(await db.habitEntryActions.findOne(`${habit.id}:${firstLogDay}`).exec());

// Even a clear on an otherwise empty day leaves the marker behind.
const emptyClearDay = '2026-09-12';
await setLog(habit, emptyClearDay, 0);
assert.equal(await db.habitLogs.findOne(`${habit.id}:${emptyClearDay}`).exec(), null);
assert.ok(await db.habitEntryActions.findOne(`${habit.id}:${emptyClearDay}`).exec());

// Opening an entry editor is itself a durable action, even when the person backs out.
await touchEntry(habit, day);
let action = await db.habitEntryActions.findOne(`${habit.id}:${day}`).exec();
assert.ok(action);
assert.ok(action.lastActionAt > 0);
const openedAt = action.lastActionAt;

await setLog(habit, day, 10);
action = await db.habitEntryActions.findOne(`${habit.id}:${day}`).exec();
assert.ok(action);
assert.ok(action.lastActionAt >= openedAt);
assert.equal((await db.habitLogs.findOne(`${habit.id}:${day}`).exec()).value, 10);

// A submitted unchanged value still records the action without adding another history entry.
const activityBeforeNoop = await db.activity.count().exec();
const logBeforeNoop = (await db.habitLogs.findOne(`${habit.id}:${day}`).exec()).updatedAt;
await setLog(habit, day, 10);
assert.equal((await db.activity.count().exec()), activityBeforeNoop);
assert.equal((await db.habitLogs.findOne(`${habit.id}:${day}`).exec()).updatedAt, logBeforeNoop);
assert.ok((await db.habitEntryActions.findOne(`${habit.id}:${day}`).exec()).lastActionAt >= openedAt);

// Clearing removes the log row but never removes the interaction marker.
await setLog(habit, day, 0);
assert.equal(await db.habitLogs.findOne(`${habit.id}:${day}`).exec(), null);
assert.ok(await db.habitEntryActions.findOne(`${habit.id}:${day}`).exec());
await setLog(habit, day, 15);
assert.equal((await db.habitLogs.findOne(`${habit.id}:${day}`).exec()).value, 15);
assert.ok(await db.habitEntryActions.findOne(`${habit.id}:${day}`).exec());

// Reverting the log action leaves the marker because it is intentionally outside the undo snapshot.
const undoDay = '2026-09-11';
await setLog(habit, undoDay, 5);
const logAction = (await db.activity.find().exec())
	.map((entry: any) => entry.toMutableJSON())
	.filter((entry: any) => entry.entity === 'habitLog' && entry.entityId === `${habit.id}:${undoDay}`)
	.sort((a: any, b: any) => b.at - a.at)[0];
assert.ok(logAction);
assert.equal(await revertActivity(logAction.id), true);
assert.equal(await db.habitLogs.findOne(`${habit.id}:${undoDay}`).exec(), null);
assert.ok(await db.habitEntryActions.findOne(`${habit.id}:${undoDay}`).exec());

// The marker is included in deletion undo and in backups, so it survives the full lifecycle.
const backup = await exportBackup();
assert.ok(backup.data.habitEntryActions.some((entry) => entry.id === `${habit.id}:${day}`));
await deleteHabit(habit.id);
assert.equal((await db.habitEntryActions.find({ selector: { habitId: habit.id } }).exec()).length, 0);
const deletion = (await db.activity.find().exec())
	.map((entry: any) => entry.toMutableJSON())
	.filter((entry: any) => entry.entity === 'habit' && entry.entityId === habit.id && entry.verb === 'delete')
	.sort((a: any, b: any) => b.at - a.at)[0];
assert.ok(deletion);
assert.equal(await revertActivity(deletion.id), true);
assert.ok(await db.habitEntryActions.findOne(`${habit.id}:${day}`).exec());

await db.close();
console.log('Habit entry action persistence passed: open, no-op, clear, undo, delete and backup.');
