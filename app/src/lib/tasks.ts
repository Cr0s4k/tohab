import { getDb } from './db/lazy.ts';
import type { Db } from './db/index.ts';
import type { Project, Task } from './db/schemas.ts';
import { markLocalWrite } from './db/syncState.svelte.ts';
import { humanDay } from './dates.ts';
import { advanceDue, firstDue, isRepeating } from './repeat.ts';
import { now, uid } from './ids.ts';
import { queueUndo } from './undo.svelte.ts';
import { applyRevert, changeSummary, record, revertActivity, type DocChange } from './activity.ts';

export const PRIORITY_LABELS = ['', 'Urgent', 'High', 'Medium', 'None'];

export function priorityClass(p: number): string {
	return ['', 'text-p1', 'text-p2', 'text-p3', 'text-p4'][p] ?? 'text-p4';
}

export function tasksQuery(db: Db, showDone = false) {
	return db.tasks.find({ selector: showDone ? {} : { done: false } });
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

/** Unfiltered by view/date/project so task details always show every direct child. */
export function directSubtasksQuery(db: Db, parentId: string) {
	return db.tasks.find({ selector: { parentId }, sort: [{ createdAt: 'asc' }] });
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
	await record({
		entity: 'project',
		entityId: doc.id,
		verb: 'create',
		subject: doc.name,
		changes: [{ collection: 'projects', id: doc.id, before: null, after: doc }]
	});
	return doc;
}

export async function renameProject(id: string, name: string) {
	const db = await getDb();
	const doc = await db.projects.findOne(id).exec();
	if (!doc) return;
	const before = doc.toMutableJSON();
	const updated = await doc.patch({ name: name.trim(), updatedAt: now() });
	markLocalWrite();
	const after = updated.toMutableJSON();
	await record({
		entity: 'project',
		entityId: id,
		verb: 'update',
		subject: after.name,
		detail: before.name === after.name ? '' : `${before.name} \u2192 ${after.name}`,
		changes: [{ collection: 'projects', id, before, after }]
	});
}

/** Deleting a project moves its tasks to the Inbox rather than destroying them. */
export async function deleteProject(id: string) {
	const db = await getDb();
	const doc = await db.projects.findOne(id).exec();
	if (!doc) return;
	const project = doc.toMutableJSON();

	const tasks = await db.tasks.find({ selector: { projectId: id } }).exec();
	const moved = tasks.map((t) => t.toMutableJSON());
	await Promise.all(tasks.map((t) => t.patch({ projectId: '', updatedAt: now() })));
	await doc.remove();
	markLocalWrite();

	await record({
		entity: 'project',
		entityId: id,
		verb: 'delete',
		subject: project.name,
		detail: moved.length ? `${moved.length} task${moved.length === 1 ? '' : 's'} moved to Inbox` : '',
		changes: [
			{ collection: 'projects', id, before: project, after: null },
			...moved.map((task) => ({
				collection: 'tasks' as const,
				id: task.id,
				before: task,
				after: { ...task, projectId: '' }
			}))
		]
	});
}

export type NewTask = {
	title: string;
	notes?: string;
	due?: string;
	dueTime?: string;
	priority?: number;
	projectId?: string;
	repeat?: string;
	reminderMinutes?: number;
	parentId?: string;
};

async function assertValidParent(db: Db, taskId: string, parentId: string) {
	if (!parentId) return;
	if (parentId === taskId) throw new Error('A task cannot be its own parent');
	let current = await db.tasks.findOne(parentId).exec();
	if (!current) throw new Error('Parent task does not exist');
	const seen = new Set<string>();
	while (current?.parentId) {
		if (current.parentId === taskId) throw new Error('A task cannot be its own descendant');
		if (seen.has(current.id)) throw new Error('Parent hierarchy is invalid');
		seen.add(current.id);
		current = await db.tasks.findOne(current.parentId).exec();
		if (!current) throw new Error('Parent hierarchy is invalid');
	}
}

export async function createTask(input: NewTask): Promise<Task | null> {
	const title = input.title.trim();
	if (!title) return null;
	const db = await getDb();
	try {
		await assertValidParent(db, '', input.parentId ?? '');
	} catch {
		return null;
	}
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
		...(input.parentId ? { parentId: input.parentId } : {}),
		repeat,
		...(input.reminderMinutes !== undefined ? { reminderMinutes: input.reminderMinutes } : {}),
		createdAt: ts,
		updatedAt: ts
	};
	await db.tasks.insert(doc);
	markLocalWrite();
	await record({
		entity: 'task',
		entityId: doc.id,
		verb: 'create',
		subject: doc.title,
		changes: [{ collection: 'tasks', id: doc.id, before: null, after: doc }]
	});
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
	const updated = await doc.patch({ done, completedAt: done ? now() : 0, updatedAt: now() });
	markLocalWrite();

	const changes: DocChange[] = [
		{ collection: 'tasks', id, before, after: updated.toMutableJSON() }
	];
	const entryId = await record({
		entity: 'task',
		entityId: id,
		verb: done ? 'complete' : 'reopen',
		subject: before.title,
		changes
	});

	queueUndo({
		label: done ? 'Task completed' : 'Task reopened',
		restore: async () => {
			if (entryId) await revertActivity(entryId);
			else await applyRevert(changes);
		}
	});
}

export async function updateTask(id: string, patch: Partial<Task>) {
	const db = await getDb();
	const doc = await db.tasks.findOne(id).exec();
	if (!doc) return;
	if (patch.parentId !== undefined) await assertValidParent(db, id, patch.parentId);
	const before = doc.toMutableJSON();
	const next = { ...patch, updatedAt: now() };
	if (next.repeat && !(next.due ?? doc.due)) next.due = firstDue(next.repeat);
	const updated = patch.reminderMinutes === undefined && 'reminderMinutes' in patch
		? await doc.incrementalModify((data) => {
			const { reminderMinutes: _reminderMinutes, ...defined } = next;
			Object.assign(data, defined);
			delete data.reminderMinutes;
			return data;
		})
		: await doc.patch(next);
	markLocalWrite();

	const after = updated.toMutableJSON();
	const detail = changeSummary(before, after);
	if (!detail) return;
	await record({
		entity: 'task',
		entityId: id,
		verb: 'update',
		subject: after.title,
		detail,
		changes: [{ collection: 'tasks', id, before, after }]
	});
}

export async function deleteTask(id: string) {
	const db = await getDb();
	const doc = await db.tasks.findOne(id).exec();
	if (!doc) return;

	const snapshot = doc.toMutableJSON();
	let promotionParentId = snapshot.parentId ?? '';
	try {
		await assertValidParent(db, id, promotionParentId);
	} catch {
		promotionParentId = '';
	}
	const children = (await db.tasks.find({ selector: { parentId: id } }).exec()).filter(
		(child) => child.id !== id
	);
	const promoted: DocChange[] = [];
	for (const child of children) {
		const before = child.toMutableJSON();
		const updated = await child.patch({ parentId: promotionParentId, updatedAt: now() });
		promoted.push({ collection: 'tasks', id: child.id, before, after: updated.toMutableJSON() });
	}
	await doc.remove();
	markLocalWrite();

	const changes: DocChange[] = [
		{ collection: 'tasks', id, before: snapshot, after: null },
		...promoted
	];
	const entryId = await record({
		entity: 'task',
		entityId: id,
		verb: 'delete',
		subject: snapshot.title,
		changes
	});

	queueUndo({
		label: 'Task deleted',
		restore: async () => {
			if (entryId) await revertActivity(entryId);
			else await applyRevert(changes);
		}
	});
}
