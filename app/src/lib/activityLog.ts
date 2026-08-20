import type {
	Activity,
	ActivityEntity,
	ActivityVerb,
	TrackedCollection
} from './db/schemas.ts';
import { humanDay, humanTime, toKey } from './dates.ts';

export type Snapshot = Record<string, unknown>;

/** One document an action touched. A null side means it did not exist then. */
export type DocChange = {
	collection: TrackedCollection;
	id: string;
	before: Snapshot | null;
	after: Snapshot | null;
};

export function encodeChanges(changes: DocChange[]): string {
	return JSON.stringify(changes);
}

export function decodeChanges(raw: string): DocChange[] {
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as DocChange[]) : [];
	} catch {
		return [];
	}
}

/**
 * Folds a repeat of the same action into the entry already recorded for it: the oldest
 * `before` is the one worth keeping, the newest `after` is the current state.
 */
export function mergeChanges(older: DocChange[], newer: DocChange[]): DocChange[] {
	const out = older.map((c) => ({ ...c }));
	const seen = new Map(out.map((c, i) => [`${c.collection}:${c.id}`, i]));
	for (const change of newer) {
		const key = `${change.collection}:${change.id}`;
		const at = seen.get(key);
		if (at === undefined) {
			seen.set(key, out.length);
			out.push({ ...change });
		} else {
			out[at].after = change.after;
		}
	}
	return out;
}

export type RevertPlan = {
	restore: { collection: TrackedCollection; doc: Snapshot }[];
	remove: { collection: TrackedCollection; id: string }[];
};

/** Undoing an action means putting every document it touched back the way it was. */
export function revertPlan(changes: DocChange[]): RevertPlan {
	const plan: RevertPlan = { restore: [], remove: [] };
	for (const change of changes) {
		if (change.before) plan.restore.push({ collection: change.collection, doc: change.before });
		else if (change.after) plan.remove.push({ collection: change.collection, id: change.id });
	}
	return plan;
}

export function isRevertible(entry: Activity): boolean {
	return entry.revertedAt === 0 && decodeChanges(entry.changes).length > 0;
}

const IGNORED_FIELDS = new Set(['createdAt', 'updatedAt']);

const FIELD_LABELS: Record<string, string> = {
	title: 'title',
	notes: 'notes',
	done: 'completion',
	completedAt: 'completion',
	due: 'due date',
	dueTime: 'time',
	priority: 'priority',
	projectId: 'project',
	name: 'name',
	color: 'colour',
	emoji: 'emoji',
	goal: 'goal',
	kind: 'type',
	target: 'target',
	unit: 'unit',
	scheduleKind: 'schedule',
	weekdays: 'schedule',
	timesPerWeek: 'schedule',
	archived: 'archived',
	value: 'value',
	date: 'date'
};

export function changedFields(before: Snapshot, after: Snapshot): string[] {
	const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
	const out: string[] = [];
	for (const key of keys) {
		if (IGNORED_FIELDS.has(key)) continue;
		if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
		const label = FIELD_LABELS[key] ?? key;
		if (!out.includes(label)) out.push(label);
	}
	return out;
}

/** "Changed title and due date" — what an edit touched, without spelling out every value. */
export function changeSummary(before: Snapshot, after: Snapshot): string {
	const fields = changedFields(before, after);
	if (!fields.length) return '';
	if (fields.length === 1) return `Changed ${fields[0]}`;
	if (fields.length === 2) return `Changed ${fields[0]} and ${fields[1]}`;
	return `Changed ${fields[0]}, ${fields[1]} and ${fields.length - 2} more`;
}

const VERB_LABELS: Record<ActivityVerb, string> = {
	create: 'Added',
	update: 'Edited',
	delete: 'Deleted',
	complete: 'Completed',
	reopen: 'Reopened',
	archive: 'Archived',
	restore: 'Unarchived',
	log: 'Logged'
};

const ENTITY_LABELS: Record<ActivityEntity, string> = {
	task: 'task',
	project: 'project',
	habit: 'habit',
	habitLog: 'habit'
};

export function activityTitle(entry: Activity): string {
	// A cleared day is a deleted log row, but "Deleted habit" would read as losing the habit.
	if (entry.entity === 'habitLog') {
		return entry.verb === 'delete' ? 'Cleared habit entry' : 'Logged habit';
	}
	const verb = VERB_LABELS[entry.verb] ?? 'Changed';
	return `${verb} ${ENTITY_LABELS[entry.entity] ?? 'item'}`;
}

/** Destructive actions read as the ones worth spotting in a list of forty. */
export function activityTone(entry: Activity): 'destructive' | 'positive' | 'neutral' {
	if (entry.verb === 'delete') return entry.entity === 'habitLog' ? 'neutral' : 'destructive';
	if (entry.verb === 'create' || entry.verb === 'complete' || entry.verb === 'log') {
		return 'positive';
	}
	return 'neutral';
}

export function activityTime(at: number): string {
	const d = new Date(at);
	return humanTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
}

export type ActivityGroup = { key: string; label: string; entries: Activity[] };

export function groupActivity(entries: Activity[]): ActivityGroup[] {
	const sorted = [...entries].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
	const groups: ActivityGroup[] = [];
	for (const entry of sorted) {
		const key = toKey(new Date(entry.at));
		const last = groups[groups.length - 1];
		if (last?.key === key) last.entries.push(entry);
		else groups.push({ key, label: humanDay(key), entries: [entry] });
	}
	return groups;
}
