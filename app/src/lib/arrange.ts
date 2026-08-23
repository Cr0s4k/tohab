import type { Project, Task } from './db/schemas.ts';
import { humanDay, toKey } from './dates.ts';
import { defaultOptions, type GroupKey, type SortKey, type ViewOptions } from './viewOptions.ts';

/** Due date then priority then creation — the fallback whenever the chosen sort ties. */
function naturalOrder(a: Task, b: Task): number {
	if (!!a.due !== !!b.due) return a.due ? -1 : 1;
	if (a.due !== b.due) return a.due < b.due ? -1 : 1;
	if (!!a.dueTime !== !!b.dueTime) return a.dueTime ? -1 : 1;
	if (a.dueTime !== b.dueTime) return a.dueTime < b.dueTime ? -1 : 1;
	if (a.priority !== b.priority) return a.priority - b.priority;
	return a.createdAt - b.createdAt;
}

function compareBy(a: Task, b: Task, sort: SortKey): number {
	if (sort === 'priority') return a.priority - b.priority;
	if (sort === 'added') return a.createdAt - b.createdAt;
	if (sort === 'title') return a.title.localeCompare(b.title);
	if (a.due !== b.due) return a.due < b.due ? -1 : 1;
	if (!!a.dueTime !== !!b.dueTime) return a.dueTime ? -1 : 1;
	if (a.dueTime !== b.dueTime) return a.dueTime < b.dueTime ? -1 : 1;
	return 0;
}

export function sortTasks(tasks: Task[], opts: ViewOptions = defaultOptions('')): Task[] {
	const dir = opts.order === 'desc' ? -1 : 1;
	return [...tasks].sort((a, b) => {
		// Undated tasks sink to the bottom in both directions, as they do in Todoist.
		if (opts.sort === 'date' && !!a.due !== !!b.due) return a.due ? -1 : 1;
		const primary = compareBy(a, b, opts.sort);
		return primary ? primary * dir : naturalOrder(a, b);
	});
}

export type ArrangedTask = Task & { depth: number };
export type TaskGroup = { key: string; label: string; tasks: ArrangedTask[] };

type TaskLike = Task & { toMutableJSON?: () => Task };

function withDepth(task: TaskLike, depth: number): ArrangedTask {
	const data = typeof task.toMutableJSON === 'function' ? task.toMutableJSON() : task;
	return { ...data, depth };
}

/** Parent-first preorder. Missing parents and corrupt cycles become roots, so filtering is safe. */
export function arrangeHierarchy(tasks: Task[]): ArrangedTask[] {
	const byId = new Map(tasks.map((task) => [task.id, task]));
	const ids = new Set(byId.keys());
	const inCycle = (start: Task) => {
		const path = new Set<string>();
		let current: Task | undefined = start;
		while (current?.parentId && ids.has(current.parentId)) {
			if (path.has(current.id)) return true;
			path.add(current.id);
			current = byId.get(current.parentId);
		}
		return false;
	};
	const children = new Map<string, Task[]>();
	for (const task of tasks) {
		if (!task.parentId || !ids.has(task.parentId) || inCycle(task)) continue;
		const list = children.get(task.parentId) ?? [];
		list.push(task);
		children.set(task.parentId, list);
	}

	const out: ArrangedTask[] = [];
	const seen = new Set<string>();
	const visit = (task: Task, depth: number, path: Set<string>) => {
		if (seen.has(task.id) || path.has(task.id)) return;
		seen.add(task.id);
		out.push(withDepth(task, depth));
		const nextPath = new Set(path).add(task.id);
		for (const child of children.get(task.id) ?? []) visit(child, depth + 1, nextPath);
	};
	for (const task of tasks) {
		if (!task.parentId || !ids.has(task.parentId)) visit(task, 0, new Set());
	}
	// A component with no root can only be cyclic/corrupt. Keep each row visible once as a root.
	for (const task of tasks) visit(task, 0, new Set());
	return out;
}

type GroupHead = { key: string; label: string; rank: number };

function groupHead(task: Task, group: GroupKey, names: Map<string, string>): GroupHead {
	if (group === 'priority') {
		const label = task.priority === 4 ? 'No priority' : `Priority ${task.priority}`;
		return { key: `p${task.priority}`, label, rank: task.priority };
	}
	if (group === 'project') {
		if (!task.projectId) return { key: 'inbox', label: 'Inbox', rank: 0 };
		return { key: task.projectId, label: names.get(task.projectId) ?? 'Project', rank: 1 };
	}
	const day = group === 'added' ? toKey(new Date(task.createdAt)) : task.due;
	if (!day) return { key: 'nodate', label: 'No date', rank: Infinity };
	return { key: day, label: humanDay(day), rank: Number(day.replaceAll('-', '')) };
}

export function arrangeTasks(
	tasks: Task[],
	opts: ViewOptions,
	projects: Project[] = []
): TaskGroup[] {
	const sorted = sortTasks(tasks, opts);
	if (opts.group === 'none') return [{ key: '', label: '', tasks: arrangeHierarchy(sorted) }];

	const names = new Map(projects.map((p) => [p.id, p.name]));
	const groups = new Map<string, GroupHead & { tasks: Task[] }>();
	for (const task of sorted) {
		const head = groupHead(task, opts.group, names);
		const existing = groups.get(head.key);
		if (existing) existing.tasks.push(task);
		else groups.set(head.key, { ...head, tasks: [task] });
	}

	const dir = opts.order === 'desc' ? -1 : 1;
	return [...groups.values()]
		.sort((a, b) => {
			// The undated bucket trails the list whichever way the rest is ordered.
			if (a.rank !== b.rank && (a.rank === Infinity || b.rank === Infinity)) {
				return a.rank === Infinity ? 1 : -1;
			}
			if (a.rank === b.rank) return a.label.localeCompare(b.label) * dir;
			return (a.rank - b.rank) * dir;
		})
		.map(({ key, label, tasks }) => ({ key, label, tasks: arrangeHierarchy(tasks) }));
}
