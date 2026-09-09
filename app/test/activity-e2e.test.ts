import { getDb } from './activity-e2e-db.ts';
import {
	createProject,
	createTask,
	carryOverOverdueTasks,
	deleteProject,
	deleteTask,
	toggleTask,
	updateTask
} from '../src/lib/tasks.ts';
import { createHabit, deleteHabit, setLog, tapLog, updateHabit } from '../src/lib/habits.ts';
import { activityQuery, decodeChanges, revertActivity } from '../src/lib/activity.ts';
import { undoState, runUndo } from '../src/lib/undo.svelte.ts';
import { exportBackup, importBackup } from '../src/lib/backup.ts';
import { humanDay, shiftKey, today } from '../src/lib/dates.ts';
import { createReporter } from '../../test/assertions.ts';

const reporter = createReporter();
const eq = reporter.eq;

const db = await getDb();
const log = async () => (await activityQuery(db).exec()).map((e: any) => e.toMutableJSON());
const latest = async () => (await log())[0];

/**
 * Several of these actions land in the same millisecond, so "the newest entry" is ambiguous
 * in a way it never is when a human is tapping. Pick the pending entry that matches instead.
 */
const pending = async (entity: string, verb: string) =>
	(await log()).find((e: any) => e.entity === entity && e.verb === verb && e.revertedAt === 0);

// --- subtasks reject invalid relationships before writing -----------------------------
const parent = await createTask({ title: 'Parent' });
const child = await createTask({ title: 'Child', parentId: parent!.id });
const grandchild = await createTask({ title: 'Grandchild', parentId: child!.id });
eq('nested parent ids persist', [child?.parentId, grandchild?.parentId], [parent!.id, child!.id]);
eq('missing parent is rejected', await createTask({ title: 'Orphan', parentId: 'missing' }), null);
const brokenParent = await createTask({ title: 'Broken parent' });
await (await db.tasks.findOne(brokenParent!.id).exec()).patch({ parentId: 'missing-ancestor' });
eq(
	'create rejects a parent with a missing ancestor',
	await createTask({ title: 'Broken child', parentId: brokenParent!.id }),
	null
);
const reparentTarget = await createTask({ title: 'Reparent target' });
let rejected = '';
try {
	await updateTask(reparentTarget!.id, { parentId: brokenParent!.id });
} catch (error) {
	rejected = (error as Error).message;
}
eq('update rejects a parent with a missing ancestor', rejected, 'Parent hierarchy is invalid');
eq(
	'missing-ancestor rejection leaves task unchanged',
	(await db.tasks.findOne(reparentTarget!.id).exec()).parentId ?? '',
	''
);
rejected = '';
try {
	await updateTask(parent!.id, { parentId: grandchild!.id });
} catch (error) {
	rejected = (error as Error).message;
}
eq('cycle is rejected', rejected, 'A task cannot be its own descendant');
eq('cycle rejection leaves parent unchanged', (await db.tasks.findOne(parent!.id).exec()).parentId ?? '', '');
rejected = '';
try {
	await updateTask(child!.id, { parentId: child!.id });
} catch (error) {
	rejected = (error as Error).message;
}
eq('self-parent is rejected', rejected, 'A task cannot be its own parent');
const backup = await exportBackup();
eq(
	'backup exports parentId',
	(backup.data.tasks.find((row: any) => row.id === child!.id) as any).parentId,
	parent!.id
);
await updateTask(child!.id, { parentId: '' });
await importBackup(JSON.stringify(backup));
eq('backup import restores parentId', (await db.tasks.findOne(child!.id).exec()).parentId, parent!.id);

// --- create is recorded ---------------------------------------------------------------
const t1 = await createTask({ title: 'Buy oat milk', priority: 1 });
let e = await pending('task', 'create');
eq('create recorded', [e.entity, e.verb, e.subject], ['task', 'create', 'Buy oat milk']);
eq('create has one change', decodeChanges(e.changes).length, 1);

// --- undoing a create removes the task -----------------------------------------------
eq('reverted', await revertActivity(e.id), true);
eq('task gone after undo', await db.tasks.findOne(t1!.id).exec(), null);
eq('entry marked undone', (await log()).find((x: any) => x.id === e.id).revertedAt > 0, true);
eq('not revertible twice', await revertActivity(e.id), false);

// --- edit records which fields moved, and undo puts them back -------------------------
const t2 = await createTask({ title: 'Call the plumber' });
await updateTask(t2!.id, { title: 'Call the electrician', priority: 2 });
e = await pending('task', 'update');
eq('edit recorded', [e.verb, e.detail], ['update', 'Changed title and priority']);
eq('edit reverted', await revertActivity(e.id), true);
let back = await db.tasks.findOne(t2!.id).exec();
eq('title restored', back.title, 'Call the plumber');
eq('priority restored', back.priority, 4);

// A no-op edit is not worth a history entry.
const beforeNoop = (await log()).length;
await updateTask(t2!.id, { title: 'Call the plumber' });
eq('no-op edit not recorded', (await log()).length, beforeNoop);

// --- complete / reopen, and the undo toast routed through the same revert -------------
await toggleTask(t2!.id);
e = await pending('task', 'complete');
eq('completion recorded', e.verb, 'complete');
eq('task is done', (await db.tasks.findOne(t2!.id).exec()).done, true);
eq('undo toast queued', undoState.current?.label, 'Task completed');
await runUndo();
eq('toast undo reopened the task', (await db.tasks.findOne(t2!.id).exec()).done, false);
eq('toast undo marked the entry', (await log()).find((x: any) => x.id === e.id).revertedAt > 0, true);

// --- completion is independent, and deletion promotes only direct children -------------
await toggleTask(parent!.id);
eq('completing parent leaves child open', (await db.tasks.findOne(child!.id).exec()).done, false);
await toggleTask(parent!.id); // reopen before deletion
await deleteTask(child!.id);
eq('deleted child is gone', await db.tasks.findOne(child!.id).exec(), null);
eq('direct child is promoted to deleted parent', (await db.tasks.findOne(grandchild!.id).exec()).parentId, parent!.id);
e = await pending('task', 'delete');
eq('promotion is included in delete activity', decodeChanges(e.changes).length, 2);
eq('promoting delete can be undone', await revertActivity(e.id), true);
eq('undo restores deleted child parent', (await db.tasks.findOne(child!.id).exec()).parentId, parent!.id);
eq('undo restores grandchild chain', (await db.tasks.findOne(grandchild!.id).exec()).parentId, child!.id);

// --- deleting a task, then restoring it from history ---------------------------------
await deleteTask(t2!.id);
eq('task deleted', await db.tasks.findOne(t2!.id).exec(), null);
e = await pending('task', 'delete');
eq('delete recorded', e.verb, 'delete');
eq('task delete reverted', await revertActivity(e.id), true);
back = await db.tasks.findOne(t2!.id).exec();
eq('deleted task came back', back?.title, 'Call the plumber');

// --- a project delete that moved tasks is undone as one action -----------------------
const p1 = await createProject('Groceries');
const a = await createTask({ title: 'Apples', projectId: p1.id });
const b = await createTask({ title: 'Bread', projectId: p1.id });
await deleteProject(p1.id);
eq('project gone', await db.projects.findOne(p1.id).exec(), null);
eq('its tasks moved to Inbox', (await db.tasks.findOne(a!.id).exec()).projectId, '');
e = await pending('project', 'delete');
eq('project delete recorded', [e.verb, e.subject, e.detail], [
	'delete',
	'Groceries',
	'2 tasks moved to Inbox'
]);
eq('it captured project plus both tasks', decodeChanges(e.changes).length, 3);
eq('project delete queues immediate undo', undoState.current?.label, 'Project deleted · 2 tasks moved');
eq('project delete reverted', await revertActivity(e.id), true);
eq('project restored', (await db.projects.findOne(p1.id).exec())?.name, 'Groceries');
eq('task a back in the project', (await db.tasks.findOne(a!.id).exec()).projectId, p1.id);
eq('task b back in the project', (await db.tasks.findOne(b!.id).exec()).projectId, p1.id);

// --- overdue carry-over is one reversible journal action -----------------------------
const overdue = await createTask({ title: 'Overdue note', due: shiftKey(today(), -2) });
const carried = await carryOverOverdueTasks(shiftKey(today(), 1));
eq('overdue task moved to tomorrow', carried > 0 && (await db.tasks.findOne(overdue!.id).exec()).due, shiftKey(today(), 1));
eq('carry-over queues undo', undoState.current?.label, 'Moved 1 overdue task');
await runUndo();
eq('carry-over undo restores overdue date', (await db.tasks.findOne(overdue!.id).exec()).due, shiftKey(today(), -2));
const customCarryTarget = shiftKey(today(), 4);
await carryOverOverdueTasks(customCarryTarget);
eq('carry-over accepts a custom date', (await db.tasks.findOne(overdue!.id).exec()).due, customCarryTarget);
await runUndo();
eq('custom carry-over undo restores overdue date', (await db.tasks.findOne(overdue!.id).exec()).due, shiftKey(today(), -2));

// --- habits ---------------------------------------------------------------------------
const h = await createHabit({
	startDate: '2026-08-18',
	name: 'Water',
	emoji: '',
	color: '',
	goal: 'build',
	kind: 'quantity',
	target: 8,
	unit: 'glasses',
	scheduleKind: 'daily',
	weekdays: [],
	timesPerWeek: 7
});
e = await pending('habit', 'create');
eq('habit create recorded', [e.entity, e.verb, e.subject], ['habit', 'create', 'Water']);

await updateHabit(h.id, { archived: true });
e = await pending('habit', 'archive');
eq('archiving reads as archiving, not an edit', e.verb, 'archive');
eq('archive reverted', await revertActivity(e.id), true);
eq('unarchived by undo', (await db.habits.findOne(h.id).exec()).archived, false);

await updateHabit(h.id, { pauseUntil: shiftKey(today(), 1) });
const pausedHabit = (await db.habits.findOne(h.id).exec()).toMutableJSON();
eq('pause window persists', [pausedHabit.pauseFrom, pausedHabit.pauseUntil], [today(), shiftKey(today(), 1)]);
let pauseRejected = '';
try {
	await setLog(pausedHabit, today(), 1);
} catch (error) {
	pauseRejected = (error as Error).message;
}
eq('paused day rejects a log', pauseRejected, `This habit is paused through ${humanDay(shiftKey(today(), 1))}.`);
await updateHabit(h.id, { pauseUntil: '' });
const resumedHabit = (await db.habits.findOne(h.id).exec()).toMutableJSON();
eq('resume clears pause window', [resumedHabit.pauseFrom, resumedHabit.pauseUntil], [undefined, undefined]);

// Repeated taps on one day fold into a single entry, undone in one go.
const fresh = await db.habits.findOne(h.id).exec();
const habit = fresh.toMutableJSON();
const before = (await log()).length;
await tapLog(habit, '2026-08-20', 0);
await tapLog(habit, '2026-08-20', 1);
await tapLog(habit, '2026-08-20', 2);
eq('three taps made one entry', (await log()).length, before + 1);
eq('log value climbed', (await db.habitLogs.findOne(`${h.id}:2026-08-20`).exec()).value, 3);
e = await pending('habitLog', 'log');
eq('log entry detail shows the total', [e.verb, e.detail], [
	'log',
	`${humanDay('2026-08-20')} · 3 glasses`
]);
eq('log run reverted', await revertActivity(e.id), true);
eq(
	'undoing the run clears the day entirely',
	await db.habitLogs.findOne(`${h.id}:2026-08-20`).exec(),
	null
);

// Clearing a day is recorded, and undoing it restores the value.
await setLog(habit, '2026-08-19', 5);
await setLog(habit, '2026-08-19', 0);
e = await pending('habitLog', 'delete');
eq('clearing recorded', [e.entity, e.verb], ['habitLog', 'delete']);
eq('clearing reverted', await revertActivity(e.id), true);
eq('cleared day restored', (await db.habitLogs.findOne(`${h.id}:2026-08-19`).exec()).value, 5);

// Deleting a habit takes its logs, and undo brings both back.
await setLog(habit, '2026-08-18', 4);
await deleteHabit(h.id);
eq('habit gone', await db.habits.findOne(h.id).exec(), null);
eq('its logs gone', (await db.habitLogs.find({ selector: { habitId: h.id } }).exec()).length, 0);
e = await pending('habit', 'delete');
eq('habit delete recorded', [e.verb, e.subject], ['delete', 'Water']);
eq('habit delete captured the habit, baseline and both logs', decodeChanges(e.changes).length, 4);
eq('habit delete queues immediate undo', undoState.current?.label, 'Habit deleted · Water');
eq('habit delete reverted', await revertActivity(e.id), true);
eq('habit restored', (await db.habits.findOne(h.id).exec())?.name, 'Water');
eq(
	'its logs restored',
	(await db.habitLogs.find({ selector: { habitId: h.id } }).exec()).length,
	2
);

// Optional task reminders can return to inheriting the automatic default.
const reminded = await createTask({
	title: 'Reminder persistence',
	due: '2026-08-25',
	dueTime: '09:00',
	reminderMinutes: 30
});
eq('custom reminder persists', (await db.tasks.findOne(reminded!.id).exec()).reminderMinutes, 30);
await updateTask(reminded!.id, { reminderMinutes: undefined });
eq('automatic reminder removes the override', (await db.tasks.findOne(reminded!.id).exec()).reminderMinutes, undefined);

const custom = await createTask({ title: 'Undated reminder', reminders: ['2026-09-09T09:00'] });
eq('independent reminder persists without a date', (await db.tasks.findOne(custom!.id).exec()).reminders, ['2026-09-09T09:00']);
eq('independent reminder does not give the task a time', (await db.tasks.findOne(custom!.id).exec()).dueTime, '');
await updateTask(custom!.id, { due: '2026-09-15' });
eq('rescheduling preserves independent reminder', (await db.tasks.findOne(custom!.id).exec()).reminders, ['2026-09-09T09:00']);
await updateTask(custom!.id, { reminders: [] });
eq('independent reminder removal persists', (await db.tasks.findOne(custom!.id).exec()).reminders, []);
e = (await log()).find((entry: any) => entry.entityId === custom!.id && entry.detail === 'Changed reminders');
await revertActivity(e.id);
eq('undo restores removed reminder', (await db.tasks.findOne(custom!.id).exec()).reminders, ['2026-09-09T09:00']);
await updateTask(custom!.id, { repeat: 'day:1', due: '2026-09-09', dueTime: '10:00', reminderMinutes: 10 });
await toggleTask(custom!.id);
eq('one-off reminders do not carry into the next task occurrence', (await db.tasks.findOne(custom!.id).exec()).reminders, []);
eq('relative reminders carry into the next task occurrence', (await db.tasks.findOne(custom!.id).exec()).reminderMinutes, 10);
await runUndo();
eq('undoing occurrence completion restores one-off reminders', (await db.tasks.findOne(custom!.id).exec()).reminders, ['2026-09-09T09:00']);
const reminderBackup = await exportBackup();
await updateTask(custom!.id, { reminders: [] });
await importBackup(JSON.stringify(reminderBackup));
eq('backup round trip restores independent reminders', (await db.tasks.findOne(custom!.id).exec()).reminders, ['2026-09-09T09:00']);

// --- the log stays newest-first and capped -------------------------------------------
const entries = await log();
eq(
	'newest first',
	entries.every((x: any, i: number) => i === 0 || entries[i - 1].at >= x.at),
	true
);
console.log(`\n(log holds ${entries.length} entries)`);

reporter.finish('all end-to-end activity checks passed');
