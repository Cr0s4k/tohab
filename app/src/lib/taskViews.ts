import type { Task } from './db/schemas.ts';
import { today } from './dates.ts';

export type View = 'inbox' | 'today' | 'upcoming' | 'all';

function matchesView(task: Task, view: View, todayKey: string): boolean {
	if (view === 'inbox') return task.projectId === '';
	if (view === 'today') return task.due > '' && task.due <= todayKey;
	if (view === 'upcoming') return task.due > todayKey;
	return true;
}

/** Scheduled parents keep their descendants visible even when a child has no date of its own. */
export function tasksInView(tasks: Task[], view: View, todayKey = today()): Task[] {
	const matches = tasks.filter((task) => matchesView(task, view, todayKey));
	if (view === 'inbox' || view === 'all') return matches;

	const children = new Map<string, Task[]>();
	for (const task of tasks) {
		if (!task.parentId) continue;
		const siblings = children.get(task.parentId) ?? [];
		siblings.push(task);
		children.set(task.parentId, siblings);
	}

	const visible = new Set(matches.map((task) => task.id));
	const includeDescendants = (parentId: string) => {
		for (const child of children.get(parentId) ?? []) {
			if (visible.has(child.id)) continue;
			visible.add(child.id);
			includeDescendants(child.id);
		}
	};
	for (const task of matches) includeDescendants(task.id);

	return tasks.filter((task) => visible.has(task.id));
}
