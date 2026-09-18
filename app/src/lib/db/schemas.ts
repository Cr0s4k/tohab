import type { RxJsonSchema } from 'rxdb';

export type Task = {
	id: string;
	title: string;
	notes: string;
	done: boolean;
	completedAt: number;
	due: string;
	dueTime: string;
	priority: number;
	projectId: string;
	parentId?: string;
	/** Serialised recurrence rule, or absent — see `repeat.ts`. */
	repeat?: string;
	/** Undefined inherits the device default; -1 disables; 0 fires at the due time. */
	reminderMinutes?: number;
	/** Independent one-off reminders, in local YYYY-MM-DDTHH:mm form. */
	reminders?: string[];
	createdAt: number;
	updatedAt: number;
};

export type Project = {
	id: string;
	name: string;
	color: string;
	createdAt: number;
	updatedAt: number;
};

export type HabitKind = 'binary' | 'quantity';
export type ScheduleKind = 'daily' | 'weekdays' | 'weekly';
export type HabitGoal = 'build' | 'break';

export type Habit = {
	id: string;
	/** Local calendar day; absent on legacy records with inferred history. */
	startDate?: string;
	/** Optional one-off pause window. Paused days are intentionally skipped by streaks. */
	pauseFrom?: string;
	pauseUntil?: string;
	/** Older clients must not overwrite habits with dated tracking rules. */
	historyVersion?: number;
	name: string;
	emoji: string;
	color: string;
	goal: HabitGoal;
	kind: HabitKind;
	target: number;
	unit: string;
	scheduleKind: ScheduleKind;
	weekdays: number[];
	timesPerWeek: number;
	archived: boolean;
	createdAt: number;
	updatedAt: number;
};

export type HabitRules = Pick<Habit, 'goal' | 'kind' | 'target' | 'unit' | 'scheduleKind' | 'weekdays' | 'timesPerWeek'>;
export type HabitRevision = HabitRules & {
	id: string;
	habitId: string;
	effectiveFrom: string;
	createdAt: number;
	updatedAt: number;
};
/** Read model only: revisions are stored in their own collection. */
export type HabitView = Habit & { revisions?: HabitRevision[] };

/** One row per habit per local calendar day. id is `${habitId}:${date}`. */
export type HabitLog = {
	id: string;
	habitId: string;
	date: string;
	value: number;
	/** Set only after an existing entry's value actually changes. */
	editedAt?: number;
	updatedAt: number;
};

export type ActivityEntity = 'task' | 'project' | 'habit' | 'habitLog';

export type ActivityVerb =
	| 'create'
	| 'update'
	| 'delete'
	| 'complete'
	| 'reopen'
	| 'archive'
	| 'restore'
	| 'log';

/**
 * One user action, with enough of the documents it touched to put them back. `changes` is a
 * JSON-encoded `DocChange[]`; it is a string rather than an object because the shape is
 * per-collection and would otherwise have to be spelled out in this schema.
 */
export type Activity = {
	id: string;
	at: number;
	entity: ActivityEntity;
	entityId: string;
	verb: ActivityVerb;
	subject: string;
	detail: string;
	changes: string;
	revertedAt: number;
	updatedAt: number;
};

const TS = { type: 'number', minimum: 0, maximum: 1e15, multipleOf: 1 } as const;

export const taskSchema: RxJsonSchema<Task> = {
	title: 'task',
	version: 4,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 40 },
		title: { type: 'string' },
		notes: { type: 'string' },
		done: { type: 'boolean' },
		completedAt: TS,
		// '' means no due date. Sorts lexicographically as yyyy-MM-dd.
		due: { type: 'string', maxLength: 10 },
		dueTime: { type: 'string', maxLength: 5 },
		priority: { type: 'number', minimum: 1, maximum: 4, multipleOf: 1 },
		projectId: { type: 'string', maxLength: 40 },
		parentId: { type: 'string', maxLength: 40 },
		// Optional, not required: documents written by an older client arrive over sync without
		// it, and a required field would make them fail validation on the way in.
		repeat: { type: 'string', maxLength: 40 },
		reminderMinutes: { type: 'number', minimum: -1, maximum: 1440, multipleOf: 1 },
		reminders: { type: 'array', uniqueItems: true, items: { type: 'string', maxLength: 16, pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$' } },
		createdAt: TS,
		updatedAt: TS
	},
	required: [
		'id',
		'title',
		'notes',
		'done',
		'completedAt',
		'due',
		'dueTime',
		'priority',
		'projectId',
		'createdAt',
		'updatedAt'
	],
	indexes: [['done', 'due'], ['projectId'], ['updatedAt']]
};

export const projectSchema: RxJsonSchema<Project> = {
	title: 'project',
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 40 },
		name: { type: 'string' },
		color: { type: 'string', maxLength: 24 },
		createdAt: TS,
		updatedAt: TS
	},
	required: ['id', 'name', 'color', 'createdAt', 'updatedAt'],
	indexes: [['createdAt'], ['updatedAt']]
};

export const habitSchema: RxJsonSchema<Habit> = {
	title: 'habit',
	version: 4,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 40 },
		startDate: { type: 'string', maxLength: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
		pauseFrom: { type: 'string', maxLength: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
		pauseUntil: { type: 'string', maxLength: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
		historyVersion: { type: 'number', enum: [1] },
		name: { type: 'string' },
		// Grapheme limits are enforced by habitEmoji; code-point limits split valid emoji.
		emoji: { type: 'string' },
		color: { type: 'string', maxLength: 24 },
		goal: { type: 'string', enum: ['build', 'break'], maxLength: 5 },
		kind: { type: 'string', enum: ['binary', 'quantity'], maxLength: 10 },
		target: { type: 'number', minimum: 0, maximum: 10000, multipleOf: 1 },
		unit: { type: 'string', maxLength: 24 },
		scheduleKind: { type: 'string', enum: ['daily', 'weekdays', 'weekly'], maxLength: 10 },
		weekdays: { type: 'array', items: { type: 'number', minimum: 0, maximum: 6 } },
		timesPerWeek: { type: 'number', minimum: 1, maximum: 7, multipleOf: 1 },
		archived: { type: 'boolean' },
		createdAt: TS,
		updatedAt: TS
	},
	required: [
		'id',
		'name',
		'emoji',
		'color',
		'kind',
		'target',
		'unit',
		'scheduleKind',
		'weekdays',
		'timesPerWeek',
		'archived',
		'createdAt',
		'updatedAt'
	],
	indexes: [['archived', 'createdAt'], ['updatedAt']]
};

export const habitLogSchema: RxJsonSchema<HabitLog> = {
	title: 'habitLog',
	version: 1,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 51 },
		habitId: { type: 'string', maxLength: 40 },
		date: { type: 'string', maxLength: 10 },
		value: { type: 'number', minimum: 0, maximum: 10000, multipleOf: 1 },
		editedAt: TS,
		updatedAt: TS
	},
	required: ['id', 'habitId', 'date', 'value', 'updatedAt'],
	indexes: [['habitId', 'date'], ['date'], ['updatedAt']]
};

export const habitRevisionSchema: RxJsonSchema<HabitRevision> = {
	title: 'habit revision',
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 40 },
		habitId: { type: 'string', maxLength: 40 },
		effectiveFrom: { type: 'string', maxLength: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
		goal: { type: 'string', enum: ['build', 'break'], maxLength: 5 },
		kind: { type: 'string', enum: ['binary', 'quantity'], maxLength: 10 },
		target: { type: 'number', minimum: 0, maximum: 10000, multipleOf: 1 },
		unit: { type: 'string', maxLength: 24 },
		scheduleKind: { type: 'string', enum: ['daily', 'weekdays', 'weekly'], maxLength: 10 },
		weekdays: { type: 'array', items: { type: 'number', minimum: 0, maximum: 6 } },
		timesPerWeek: { type: 'number', minimum: 1, maximum: 7, multipleOf: 1 },
		createdAt: TS,
		updatedAt: TS
	},
	required: ['id', 'habitId', 'effectiveFrom', 'goal', 'kind', 'target', 'unit', 'scheduleKind', 'weekdays', 'timesPerWeek', 'createdAt', 'updatedAt'],
	indexes: [['habitId', 'effectiveFrom'], ['updatedAt']]
};

export const activitySchema: RxJsonSchema<Activity> = {
	title: 'activity',
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 40 },
		at: TS,
		entity: {
			type: 'string',
			enum: ['task', 'project', 'habit', 'habitLog'],
			maxLength: 10
		},
		entityId: { type: 'string', maxLength: 51 },
		verb: {
			type: 'string',
			enum: ['create', 'update', 'delete', 'complete', 'reopen', 'archive', 'restore', 'log'],
			maxLength: 10
		},
		subject: { type: 'string' },
		detail: { type: 'string' },
		changes: { type: 'string' },
		/** 0 until the entry is undone; entries are reverted at most once. */
		revertedAt: TS,
		updatedAt: TS
	},
	required: [
		'id',
		'at',
		'entity',
		'entityId',
		'verb',
		'subject',
		'detail',
		'changes',
		'revertedAt',
		'updatedAt'
	],
	indexes: [['at'], ['updatedAt']]
};

export const COLLECTION_NAMES = ['tasks', 'projects', 'habits', 'habitRevisions', 'habitLogs', 'activity'] as const;
export type CollectionName = (typeof COLLECTION_NAMES)[number];

/** Every collection the activity log can restore a document into — that is, not itself. */
export type TrackedCollection = Exclude<CollectionName, 'activity'>;
