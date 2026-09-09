import assert from 'node:assert/strict';
import { getDb } from './activity-e2e-db.ts';
import { createHabit, updateHabit, deleteHabit, setLog, revisionsQuery, withHabitHistory, habitOn, habitForEdit } from '../src/lib/habits.ts';
import { decodeChanges, revertActivity } from '../src/lib/activity.ts';
import { exportBackup, importBackup } from '../src/lib/backup.ts';
import { shiftKey, startOfWeekKey, today } from '../src/lib/dates.ts';

const db = await getDb();
const day = today();
const yesterday = shiftKey(day, -1);
const habit = await createHabit({ name: 'Read', emoji: '📖', color: '', goal: 'build', kind: 'quantity',
	target: 10, unit: 'pages', scheduleKind: 'daily', weekdays: [], timesPerWeek: 3, startDate: yesterday });
const view = async () => withHabitHistory((await db.habits.findOne(habit.id).exec()).toMutableJSON(),
	(await revisionsQuery(db, habit.id).exec()).map((revision: any) => revision.toMutableJSON()));
await setLog(habit, yesterday, 10);
await updateHabit(habit.id, { target: 20 });
assert.equal(habitOn(await view(), yesterday).target, 10, 'yesterday keeps its old target');
assert.equal(habitOn(await view(), day).target, 20, 'today uses the changed target');
assert.equal((await db.habitLogs.findOne(`${habit.id}:${yesterday}`).exec()).value, 10);
assert.equal((await revisionsQuery(db, habit.id).exec()).length, 2, 'baseline and first revision');
await updateHabit(habit.id, { name: 'Read books' });
assert.equal((await revisionsQuery(db, habit.id).exec()).length, 2, 'renaming does not change rules');
await updateHabit(habit.id, { target: 20 });
assert.equal((await revisionsQuery(db, habit.id).exec()).length, 2, 'saving unchanged rules is a no-op');

const entries = await db.activity.find().exec();
const edit = entries.find((entry: any) => decodeChanges(entry.changes).some((change) => change.collection === 'habitRevisions' && change.after?.target === 20));
assert.ok(edit);
await revertActivity(edit.id);
assert.equal(habitOn(await view(), day).target, 10, 'undo removes the changed rule');
assert.equal((await revisionsQuery(db, habit.id).exec()).length, 1, 'undo retains baseline for old-client protection');

await updateHabit(habit.id, { scheduleKind: 'weekly', target: 50 }, { weekStartsOn: 1 });
const nextMonday = shiftKey(startOfWeekKey(day, 1), 7);
assert.equal(habitOn(await view(), day).scheduleKind, 'daily', 'weekly changes do not split this week');
assert.equal(habitOn(await view(), nextMonday).scheduleKind, 'weekly');
assert.equal(habitForEdit(await view()).target, 50, 'editor can see the pending target');
await updateHabit(habit.id, { target: 60 }, { weekStartsOn: 1 });
assert.equal(habitForEdit(await view()).target, 60, 'sequential same-day edits have deterministic ordering');
assert.equal(habitOn(await view(), yesterday).target, 10);

const backup = await exportBackup();
assert.equal(backup.data.habitRevisions.length, 3);
await deleteHabit(habit.id);
assert.equal((await revisionsQuery(db, habit.id).exec()).length, 0, 'deletion includes revisions');
const deletion = (await db.activity.find().exec()).find((entry: any) => entry.entityId === habit.id && entry.verb === 'delete');
await revertActivity(deletion.id);
assert.equal(habitForEdit(await view()).target, 60, 'undo deletion restores history');
await deleteHabit(habit.id);
const result = await importBackup(JSON.stringify(backup));
assert.equal(result.skipped, 0);
assert.equal(habitOn(await view(), yesterday).target, 10, 'backup restores historical rules');
assert.equal(habitForEdit(await view()).target, 60, 'backup restores pending rules');
const oldBackup = await exportBackup();
delete oldBackup.data.habits[0].historyVersion;
delete oldBackup.data.habits[0].startDate;
oldBackup.data.habitRevisions = [];
await importBackup(JSON.stringify(oldBackup));
assert.equal((await db.habits.findOne(habit.id).exec()).historyVersion, 1, 'legacy import cannot remove history protection');
assert.equal(habitForEdit(await view()).target, 60);
await db.close();
console.log('Habit history persistence passed: effective dates, pending edits, undo, deletion and backup round trips.');
