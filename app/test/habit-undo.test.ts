import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { getDb } from './activity-e2e-db.ts';
import { createHabit, deleteHabit, setLog, tapLog, updateHabit } from '../src/lib/habits.ts';
import { createTask, toggleTask } from '../src/lib/tasks.ts';
import { runUndo, undoState } from '../src/lib/undo.svelte.ts';
import { today, shiftKey } from '../src/lib/dates.ts';

const db = await getDb();
const input = {
	name: 'Water', emoji: '', color: '', goal: 'build' as const,
	kind: 'quantity' as const, target: 8, unit: 'glasses',
	scheduleKind: 'daily' as const, weekdays: [], timesPerWeek: 7,
	startDate: shiftKey(today(), -2)
};
const entries = () => db.activity.find().exec();
const log = (id: string) => db.habitLogs.findOne(`${id}:${today()}`).exec();

// Every mutation queues exactly once; undo consumes it without another notification.
async function expectUndo(label: string, action: () => Promise<unknown>) {
	const previousId = undoState.current?.id;
	const before = await entries();
	await action();
	assert.equal(undoState.current?.label, label);
	if (previousId !== undefined) assert.equal(undoState.current?.id, previousId + 1);
	const added = (await entries()).filter((entry: any) => !before.some((old: any) => old.id === entry.id));
	assert.equal(added.length, 1);
	await runUndo();
	assert.equal(undoState.current, null);
	assert.ok((await db.activity.findOne(added[0].id).exec()).revertedAt > 0);
	assert.equal((await entries()).length, before.length + 1);
	await runUndo();
}

let createdId = '';
await expectUndo('Habit created · Water', async () => {
	createdId = (await createHabit(input)).id;
});
assert.equal(await db.habits.findOne(createdId).exec(), null);
assert.equal(await db.habitRevisions.findOne(createdId).exec(), null);

const habit = await createHabit(input);
await expectUndo('Habit updated · Tea', () => updateHabit(habit.id, { name: 'Tea', target: 4 }));
assert.equal((await db.habits.findOne(habit.id).exec()).name, 'Water');
assert.equal((await db.habitRevisions.find({ selector: { habitId: habit.id } }).exec()).length, 1);

await expectUndo('Habit archived · Water', () => updateHabit(habit.id, { archived: true }));
assert.equal((await db.habits.findOne(habit.id).exec()).archived, false);
await updateHabit(habit.id, { archived: true });
await expectUndo('Habit restored · Water', () => updateHabit(habit.id, { archived: false }));
assert.equal((await db.habits.findOne(habit.id).exec()).archived, true);
await updateHabit(habit.id, { archived: false });

await expectUndo('Habit updated · Water', () => updateHabit(habit.id, { pauseUntil: today() }));
assert.equal((await db.habits.findOne(habit.id).exec()).pauseUntil, undefined);
await updateHabit(habit.id, { pauseUntil: today() });
await expectUndo('Habit updated · Water', () => updateHabit(habit.id, { pauseUntil: '' }));
assert.equal((await db.habits.findOne(habit.id).exec()).pauseUntil, today());
await updateHabit(habit.id, { pauseUntil: '' });

await expectUndo('Entry recorded · Water', () => tapLog(habit, today(), 0));
assert.equal(await log(habit.id), null);

// Rapid quantity taps replace one toast and undo the same coalesced run as Activity.
const beforeTaps = (await entries()).length;
await tapLog(habit, today(), 0);
const firstId = undoState.current!.id;
await tapLog(habit, today(), 1);
await tapLog(habit, today(), 2);
assert.equal(undoState.current!.id, firstId + 2);
assert.equal((await entries()).length, beforeTaps + 1);
assert.equal((await log(habit.id)).value, 3);
await runUndo();
assert.equal(await log(habit.id), null);

await setLog(habit, today(), 5);
await expectUndo('Entry cleared · Water', () => setLog(habit, today(), 0));
assert.equal((await log(habit.id)).value, 5);
await expectUndo('Entry recorded · Water', () => setLog(habit, today(), 7));
assert.equal((await log(habit.id)).value, 5);

const binary = await createHabit({ ...input, name: 'Read', kind: 'binary', target: 1 });
await tapLog(binary, today(), 0);
await expectUndo('Entry cleared · Read', () => tapLog(binary, today(), 1));
assert.equal((await log(binary.id)).value, 1);
const breaking = await createHabit({ ...input, name: 'Coffee', goal: 'break', target: 0 });
await expectUndo('Entry recorded · Coffee', () => tapLog(breaking, today(), 0));
assert.equal(await log(breaking.id), null);

// No-ops and rejected writes must not replace a task's pending undo.
const task = await createTask({ title: 'Task alongside habits' });
assert.ok(task);
await toggleTask(task.id);
const taskUndo = undoState.current;
const beforeNoops = (await entries()).length;
await updateHabit(habit.id, { name: habit.name });
await updateHabit('missing', { archived: true });
await deleteHabit('missing');
await setLog(habit, today(), 5);
await setLog(habit, shiftKey(today(), -1), 0);
await assert.rejects(setLog(habit, shiftKey(today(), -3), 1));
await assert.rejects(updateHabit(habit.id, { startDate: 'invalid' }));
assert.equal(undoState.current, taskUndo);
assert.equal((await entries()).length, beforeNoops);
await runUndo();
assert.equal((await db.tasks.findOne(task.id).exec()).done, false);

// Habit and task actions use the same single pending slot in either order.
await setLog(habit, today(), 6);
await toggleTask(task.id);
assert.equal(undoState.current?.label, 'Task completed');
await runUndo();
assert.equal((await log(habit.id)).value, 6);
await toggleTask(task.id);
await expectUndo('Habit deleted · Water', () => deleteHabit(habit.id));
assert.equal((await db.tasks.findOne(task.id).exec()).done, true);
assert.equal((await db.habits.findOne(habit.id).exec()).name, 'Water');
assert.equal((await log(habit.id)).value, 6);
assert.ok(await db.habitRevisions.findOne(habit.id).exec());

// A failed history write still offers undo using the captured document changes.
const failingInsert = mock.method(db.activity, 'insert', async () => { throw new Error('History unavailable'); });
const warning = mock.method(console, 'warn', () => {});
try {
	const fallback = await createHabit(input);
	await runUndo();
	assert.equal(await db.habits.findOne(fallback.id).exec(), null);
	assert.equal(await db.habitRevisions.findOne(fallback.id).exec(), null);
	await updateHabit(habit.id, { name: 'Fallback' });
	await runUndo();
	assert.equal((await db.habits.findOne(habit.id).exec()).name, 'Water');
	await setLog(habit, today(), 9);
	await runUndo();
	assert.equal((await log(habit.id)).value, 6);
	await setLog(habit, today(), 0);
	await runUndo();
	assert.equal((await log(habit.id)).value, 6);
	await deleteHabit(habit.id);
	await runUndo();
	assert.ok(await db.habits.findOne(habit.id).exec());
	assert.equal((await log(habit.id)).value, 6);
	assert.equal(warning.mock.callCount(), 5);
} finally {
	failingInsert.mock.restore();
	warning.mock.restore();
}

// A replacement habit action gets the unchanged 2.2-second task undo window.
mock.timers.enable({ apis: ['setTimeout'] });
try {
	await updateHabit(habit.id, { name: 'First' });
	mock.timers.tick(2100);
	assert.equal(undoState.current?.label, 'Habit updated · First');
	await updateHabit(habit.id, { name: 'Second' });
	mock.timers.tick(2199);
	assert.equal(undoState.current?.label, 'Habit updated · Second');
	mock.timers.tick(1);
	assert.equal(undoState.current, null);
	await runUndo();
	assert.equal((await db.habits.findOne(habit.id).exec()).name, 'Second');
} finally {
	mock.timers.reset();
}

await db.close();
console.log('Habit undo checks passed');
