import {
	activityTitle,
	activityTone,
	changeSummary,
	changedFields,
	decodeChanges,
	encodeChanges,
	groupActivity,
	isRevertible,
	mergeChanges,
	revertPlan,
	type DocChange
} from '../src/lib/activityLog.ts';
import type { Activity, Task } from '../src/lib/db/schemas.ts';

function task(id: string, over: Partial<Task> = {}): Task {
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
		createdAt: 1_000,
		updatedAt: 1_000,
		...over
	};
}

function entry(over: Partial<Activity> = {}): Activity {
	return {
		id: 'a1',
		at: Date.now(),
		entity: 'task',
		entityId: 't1',
		verb: 'update',
		subject: 'Buy oat milk',
		detail: '',
		changes: '[]',
		revertedAt: 0,
		updatedAt: 0,
		...over
	};
}

let fail = 0;
function eq(label: string, got: unknown, want: unknown) {
	const g = JSON.stringify(got);
	const w = JSON.stringify(want);
	if (g !== w) {
		fail++;
		console.log(`FAIL  ${label}: want ${w}, got ${g}`);
	} else {
		console.log(`ok    ${label} = ${g}`);
	}
}

// changedFields ignores the bookkeeping timestamps every write touches.
eq('changedFields none', changedFields(task('t1'), task('t1', { updatedAt: 9_999 })), []);
eq('changedFields title', changedFields(task('t1'), task('t1', { title: 'other' })), ['title']);
eq('changedFields names a parent relationship', changedFields(task('t1'), task('t1', { parentId: 'p' })), ['parent']);
eq(
	'changedFields collapses done and completedAt',
	changedFields(task('t1'), task('t1', { done: true, completedAt: 5 })),
	['completion']
);
eq(
	'changedFields deep-compares arrays',
	changedFields({ weekdays: [1, 2] }, { weekdays: [1, 2] }),
	[]
);
eq(
	'changedFields sees array edits',
	changedFields({ weekdays: [1, 2] }, { weekdays: [1, 3] }),
	['schedule']
);

eq('changeSummary empty', changeSummary(task('t1'), task('t1')), '');
eq('changeSummary one', changeSummary(task('t1'), task('t1', { title: 'x' })), 'Changed title');
eq(
	'changeSummary two',
	changeSummary(task('t1'), task('t1', { title: 'x', due: '2026-01-05' })),
	'Changed title and due date'
);
eq(
	'changeSummary many',
	changeSummary(task('t1'), task('t1', { title: 'x', due: '2026-01-05', priority: 1, notes: 'n' })),
	'Changed title, notes and 2 more'
);

// A revert restores what existed and removes what did not.
const created: DocChange[] = [{ collection: 'tasks', id: 't1', before: null, after: task('t1') }];
const deleted: DocChange[] = [{ collection: 'tasks', id: 't1', before: task('t1'), after: null }];

eq('revertPlan of a create removes', revertPlan(created), {
	restore: [],
	remove: [{ collection: 'tasks', id: 't1' }]
});
eq('revertPlan of a delete restores', revertPlan(deleted), {
	restore: [{ collection: 'tasks', doc: task('t1') }],
	remove: []
});
eq(
	'revertPlan of a no-op change is empty',
	revertPlan([{ collection: 'tasks', id: 't1', before: null, after: null }]),
	{ restore: [], remove: [] }
);
eq(
	'revertPlan spans collections',
	revertPlan([
		{ collection: 'projects', id: 'p1', before: { id: 'p1' }, after: null },
		{ collection: 'tasks', id: 't1', before: null, after: task('t1') }
	]),
	{
		restore: [{ collection: 'projects', doc: { id: 'p1' } }],
		remove: [{ collection: 'tasks', id: 't1' }]
	}
);

// Coalescing keeps the oldest before and the newest after, so one undo covers the run.
const first: DocChange[] = [
	{ collection: 'habitLogs', id: 'h1:2026-08-20', before: null, after: { value: 1 } }
];
const second: DocChange[] = [
	{ collection: 'habitLogs', id: 'h1:2026-08-20', before: { value: 1 }, after: { value: 2 } }
];
eq('mergeChanges keeps first before', mergeChanges(first, second), [
	{ collection: 'habitLogs', id: 'h1:2026-08-20', before: null, after: { value: 2 } }
]);
eq('mergeChanges appends unseen docs', mergeChanges(first, deleted), [
	{ collection: 'habitLogs', id: 'h1:2026-08-20', before: null, after: { value: 1 } },
	{ collection: 'tasks', id: 't1', before: task('t1'), after: null }
]);
eq(
	'mergeChanges leaves the inputs alone',
	first,
	[{ collection: 'habitLogs', id: 'h1:2026-08-20', before: null, after: { value: 1 } }]
);
eq('revert of a merged run removes the row', revertPlan(mergeChanges(first, second)), {
	restore: [],
	remove: [{ collection: 'habitLogs', id: 'h1:2026-08-20' }]
});

eq('encode/decode round-trips', decodeChanges(encodeChanges(deleted)), deleted);
eq('decode tolerates junk', decodeChanges('not json'), []);
eq('decode tolerates a non-array', decodeChanges('{"a":1}'), []);

eq('revertible when fresh', isRevertible(entry({ changes: encodeChanges(deleted) })), true);
eq(
	'not revertible once undone',
	isRevertible(entry({ changes: encodeChanges(deleted), revertedAt: 5 })),
	false
);
eq('not revertible with no changes', isRevertible(entry({ changes: '[]' })), false);

eq('title of a delete', activityTitle(entry({ verb: 'delete' })), 'Deleted task');
eq('title of a completion', activityTitle(entry({ verb: 'complete' })), 'Completed task');
eq(
	'title of a habit log',
	activityTitle(entry({ entity: 'habitLog', verb: 'log' })),
	'Logged habit'
);
eq(
	'a cleared day does not read as a deleted habit',
	activityTitle(entry({ entity: 'habitLog', verb: 'delete' })),
	'Cleared habit entry'
);

eq('deletes stand out', activityTone(entry({ verb: 'delete' })), 'destructive');
eq(
	'clearing a day does not',
	activityTone(entry({ entity: 'habitLog', verb: 'delete' })),
	'neutral'
);
eq('edits are quiet', activityTone(entry({ verb: 'update' })), 'neutral');

// Grouping is newest-first, by local calendar day.
const day = 24 * 60 * 60 * 1000;
const noon = new Date(2026, 7, 20, 12, 0, 0).getTime();
const groups = groupActivity([
	entry({ id: 'b', at: noon - day }),
	entry({ id: 'a', at: noon }),
	entry({ id: 'c', at: noon - 60_000 })
]);
eq(
	'groups are newest first',
	groups.map((g) => g.entries.map((e) => e.id)),
	[['a', 'c'], ['b']]
);
eq('groups are one per day', groups.length, 2);
eq(
	'ties break on id, descending like the timestamps, so ordering is stable',
	groupActivity([entry({ id: 'a', at: noon }), entry({ id: 'b', at: noon })]).map((g) =>
		g.entries.map((e) => e.id)
	),
	[['b', 'a']]
);

console.log(fail ? `\n${fail} failing` : '\nall activity assertions passed');
process.exit(fail ? 1 : 0);
