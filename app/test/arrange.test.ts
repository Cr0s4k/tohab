import { arrangeTasks, sortTasks } from '../src/lib/arrange.ts';
import { tasksInView } from '../src/lib/taskViews.ts';
import { defaultOptions, type ViewOptions } from '../src/lib/viewOptions.ts';
import type { Project, Task } from '../src/lib/db/schemas.ts';
import { createReporter } from '../../test/assertions.ts';

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
		updatedAt: 0,
		...over
	};
}

function project(id: string, name: string): Project {
	return { id, name, color: '', createdAt: 0, updatedAt: 0 };
}

function opts(over: Partial<ViewOptions> = {}): ViewOptions {
	return { ...defaultOptions(''), ...over };
}

const reporter = createReporter();
const eq = reporter.eq;

const ids = (tasks: Task[]) => tasks.map((t) => t.id);
const tree = (tasks: (Task & { depth?: number })[]) => tasks.map((t) => [t.id, t.depth]);
const heads = (groups: { label: string }[]) => groups.map((g) => g.label);

// --- view filtering keeps the hierarchy visible ---
const scheduledHierarchy = [
	task('today-parent', { due: '2026-08-25' }),
	task('undated-child', { parentId: 'today-parent' }),
	task('undated-grandchild', { parentId: 'undated-child' }),
	task('unrelated-undated')
];
eq(
	'today includes undated descendants of a matching parent',
	ids(tasksInView(scheduledHierarchy, 'today', '2026-08-25')),
	['today-parent', 'undated-child', 'undated-grandchild']
);
eq(
	'inbox still uses each task project independently',
	ids(tasksInView([
		task('inbox-parent'),
		task('project-child', { parentId: 'inbox-parent', projectId: 'work' })
	], 'inbox', '2026-08-25')),
	['inbox-parent']
);

// --- sorting ---
const byDate = [
	task('c', { due: '2026-08-21' }),
	task('a', { due: '2026-08-19' }),
	task('none'),
	task('b', { due: '2026-08-19', dueTime: '09:00' })
];
eq('date asc', ids(sortTasks(byDate, opts())), ['b', 'a', 'c', 'none']);
eq('date desc', ids(sortTasks(byDate, opts({ order: 'desc' }))), ['c', 'a', 'b', 'none']);

const byPriority = [
	task('p4', { priority: 4 }),
	task('p1', { priority: 1 }),
	task('p2', { priority: 2 })
];
eq('priority asc', ids(sortTasks(byPriority, opts({ sort: 'priority' }))), ['p1', 'p2', 'p4']);
eq(
	'priority desc',
	ids(sortTasks(byPriority, opts({ sort: 'priority', order: 'desc' }))),
	['p4', 'p2', 'p1']
);

const byAdded = [task('new', { createdAt: 3 }), task('old', { createdAt: 1 })];
eq('added asc', ids(sortTasks(byAdded, opts({ sort: 'added' }))), ['old', 'new']);
eq('added desc', ids(sortTasks(byAdded, opts({ sort: 'added', order: 'desc' }))), ['new', 'old']);

const byName = [task('Zebra'), task('apple'), task('Mango')];
eq('name asc', ids(sortTasks(byName, opts({ sort: 'title' }))), ['apple', 'Mango', 'Zebra']);

// --- grouping ---
eq('group none is one unlabelled group', heads(arrangeTasks(byDate, opts())), ['']);

const mixed = [
	task('u', { priority: 1 }),
	task('m', { priority: 3 }),
	task('n', { priority: 4 }),
	task('u2', { priority: 1 })
];
const byPrioGroups = arrangeTasks(mixed, opts({ group: 'priority', sort: 'priority' }));
eq('group priority asc', heads(byPrioGroups), ['Priority 1', 'Priority 3', 'No priority']);
eq('group priority keeps members', ids(byPrioGroups[0].tasks), ['u', 'u2']);
eq(
	'group priority desc',
	heads(arrangeTasks(mixed, opts({ group: 'priority', sort: 'priority', order: 'desc' }))),
	['No priority', 'Priority 3', 'Priority 1']
);

const dated = [
	task('later', { due: '2026-12-01' }),
	task('sooner', { due: '2026-11-30' }),
	task('undated')
];
eq('group date puts undated last', heads(arrangeTasks(dated, opts({ group: 'date' }))).at(-1), 'No date');
eq(
	'group date desc keeps undated last',
	heads(arrangeTasks(dated, opts({ group: 'date', order: 'desc' }))).at(-1),
	'No date'
);

const projects = [project('w', 'Work'), project('h', 'Home')];
const scattered = [task('t1', { projectId: 'w' }), task('t2' ), task('t3', { projectId: 'h' })];
eq(
	'group project puts Inbox first',
	heads(arrangeTasks(scattered, opts({ group: 'project' }), projects)),
	['Inbox', 'Home', 'Work']
);

// --- grouping does not drop tasks ---
for (const group of ['none', 'priority', 'date', 'added', 'project'] as const) {
	const total = arrangeTasks(scattered.concat(dated), opts({ group }), projects).reduce(
		(n, g) => n + g.tasks.length,
		0
	);
	eq(`group ${group} keeps every task`, total, 6);
}

// --- hierarchy: parents precede descendants without losing the chosen sibling order ---
const nested = [
	task('grandchild', { parentId: 'child', createdAt: 1 }),
	task('sibling', { parentId: 'parent', createdAt: 2 }),
	task('parent', { createdAt: 3 }),
	task('child', { parentId: 'parent', createdAt: 4 })
];
eq('nested hierarchy is parent-first with stable sibling order', tree(arrangeTasks(nested, opts())[0].tasks), [
	['parent', 0],
	['sibling', 1],
	['child', 1],
	['grandchild', 2]
]);
eq(
	'child whose parent is filtered out remains visible as a root',
	tree(arrangeTasks([task('visible-child', { parentId: 'hidden-parent' })], opts())[0].tasks),
	[['visible-child', 0]]
);
const splitGroups = arrangeTasks(
	[task('parent-p1', { priority: 1 }), task('child-p2', { parentId: 'parent-p1', priority: 2 })],
	opts({ group: 'priority', sort: 'priority' })
);
eq('grouping never moves a child into its parent group', splitGroups.map((g) => [g.label, tree(g.tasks)]), [
	['Priority 1', [['parent-p1', 0]]],
	['Priority 2', [['child-p2', 0]]]
]);
eq(
	'corrupt cycles remain visible once and do not recurse forever',
	tree(arrangeTasks([task('a', { parentId: 'b' }), task('b', { parentId: 'a' })], opts())[0].tasks),
	[['a', 0], ['b', 0]]
);

reporter.finish();
