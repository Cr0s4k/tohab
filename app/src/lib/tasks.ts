import { getDb } from './db/lazy.ts';
import type { Db } from './db/index.ts';
import type { Project, Task } from './db/schemas.ts';
import { markLocalWrite } from './db/syncState.svelte.ts';
import { humanDay, today } from './dates.ts';
import { advanceDue, firstDue, isRepeating } from './repeat.ts';
import { now, uid } from './ids.ts';
import { queueUndo } from './undo.svelte.ts';

export type View = 'inbox' | 'today' | 'upcoming' | 'all';

export const PRIORITY_LABELS = ['', 'Urgent', 'High', 'Medium', 'None'];

export function priorityClass(p: number): string {
	return ['', 'text-p1', 'text-p2', 'text-p3', 'text-p4'][p] ?? 'text-p4';
}

export function tasksQuery(db: Db, view: View, showDone = false) {
	const open = showDone ? {} : { done: false };
	// The Inbox is the absence of a project, the same set the Projects screen shows.
	if (view === 'inbox') {
		return db.tasks.find({ selector: { ...open, projectId: '' } });
	}
	if (view === 'today') {
		// Overdue rolls into Today, matching how Todoist surfaces missed work.
		return db.tasks.find({ selector: { ...open, due: { $gt: '', $lte: today() } } });
	}
	if (view === 'upcoming') {
		return db.tasks.find({ selector: { ...open, due: { $gt: today() } } });
	}
	return db.tasks.find({ selector: open });
}

export function projectTasksQuery(db: Db, projectId: string, showDone = false) {
	return db.tasks.find({ selector: showDone ? { projectId } : { projectId, done: false } });
}

export function projectsQuery(db: Db) {
	return db.projects.find({ sort: [{ createdAt: 'asc' }] });
}

export function openTasksQuery(db: Db) {
	return db.tasks.find({ selector: { done: false } });
}

export async function resolveProject(name: string): Promise<string> {
	if (!name) return '';
	const db = await getDb();
	const existing = await db.projects.findOne({ selector: { name } }).exec();
	if (existing) return existing.id;
	const created = await createProject(name);
	return created.id;
}

const PROJECT_COLORS = [
	'oklch(0.62 0.19 25)',
	'oklch(0.68 0.16 60)',
	'oklch(0.66 0.15 145)',
	'oklch(0.62 0.16 250)',
	'oklch(0.62 0.18 310)',
	'oklch(0.68 0.13 195)'
];

export async function createProject(name: string): Promise<Project> {
	const db = await getDb();
	const count = await db.projects.count().exec();
	const ts = now();
	const doc: Project = {
		id: uid(),
		name: name.trim(),
		color: PROJECT_COLORS[count % PROJECT_COLORS.length],
		createdAt: ts,
		updatedAt: ts
	};
	await db.projects.insert(doc);
	markLocalWrite();
	return doc;
}

export async function renameProject(id: string, name: string) {
	const db = await getDb();
	const doc = await db.projects.findOne(id).exec();
	if (!doc) return;
	await doc.patch({ name: name.trim(), updatedAt: now() });
	markLocalWrite();
}

/** Deleting a project moves its tasks to the Inbox rather than destroying them. */
export async function deleteProject(id: string) {
	const db = await getDb();
	const tasks = await db.tasks.find({ selector: { projectId: id } }).exec();
	await Promise.all(tasks.map((t) => t.patch({ projectId: '', updatedAt: now() })));
	const doc = await db.projects.findOne(id).exec();
	await doc?.remove();
	markLocalWrite();
}

export type NewTask = {
	title: string;
	notes?: string;
	due?: string;
	dueTime?: string;
	priority?: number;
	projectId?: string;
	repeat?: string;
};

export async function createTask(input: NewTask): Promise<Task | null> {
	const title = input.title.trim();
	if (!title) return null;
	const db = await getDb();
	const ts = now();
	const repeat = isRepeating(input.repeat) ? input.repeat! : '';
	const doc: Task = {
		id: uid(),
		title,
		notes: input.notes?.trim() ?? '',
		done: false,
		completedAt: 0,
		// A rule with no date of its own starts at its first occurrence rather than nowhere.
		due: input.due || (repeat ? firstDue(repeat) : ''),
		dueTime: input.dueTime ?? '',
		priority: input.priority ?? 4,
		projectId: input.projectId ?? '',
		repeat,
		createdAt: ts,
		updatedAt: ts
	};
	await db.tasks.insert(doc);
	markLocalWrite();
	return doc;
}

export async function toggleTask(id: string) {
	const db = await getDb();
	const doc = await db.tasks.findOne(id).exec();
	if (!doc) return;

	const before = doc.toMutableJSON();

	// Completing a repeating task moves it on instead of filing it away, which is the whole
	// point: the series is the task. Reopening one is an ordinary uncomplete.
	if (!before.done && isRepeating(before.repeat)) {
		const next = advanceDue(before.repeat!, before.due);
		await doc.patch({ due: next, completedAt: now(), updatedAt: now() });
		markLocalWrite();

		queueUndo({
			label: `Completed · next ${humanDay(next)}`,
			restore: async () => {
				const current = await db.tasks.findOne(id).exec();
				if (current) {
					await current.patch({
						due: before.due,
						completedAt: before.completedAt,
						updatedAt: now()
					});
					markLocalWrite();
				}
			}
		});
		return;
	}

	const done = !before.done;
	await doc.patch({ done, completedAt: done ? now() : 0, updatedAt: now() });
	markLocalWrite();

	queueUndo({
		label: done ? 'Task completed' : 'Task reopened',
		restore: async () => {
			const current = await db.tasks.findOne(id).exec();
			if (current) {
				await current.patch({
					done: before.done,
					completedAt: before.completedAt,
					updatedAt: now()
				});
				markLocalWrite();
			}
		}
	});
}

export async function updateTask(id: string, patch: Partial<Task>) {
	const db = await getDb();
	const doc = await db.tasks.findOne(id).exec();
	if (!doc) return;
	const next = { ...patch, updatedAt: now() };
	if (next.repeat && !(next.due ?? doc.due)) next.due = firstDue(next.repeat);
	await doc.patch(next);
	markLocalWrite();
}

export async function deleteTask(id: string) {
	const db = await getDb();
	const doc = await db.tasks.findOne(id).exec();
	if (!doc) return;

	const snapshot = doc.toMutableJSON();
	await doc.remove();
	markLocalWrite();

	queueUndo({
		label: 'Task deleted',
		restore: async () => {
			await db.tasks.upsert({ ...snapshot, updatedAt: now() });
			markLocalWrite();
		}
	});
}
