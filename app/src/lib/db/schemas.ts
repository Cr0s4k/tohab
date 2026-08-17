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

export type Habit = {
	id: string;
	name: string;
	emoji: string;
	color: string;
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

/** One row per habit per local calendar day. id is `${habitId}:${date}`. */
export type HabitLog = {
	id: string;
	habitId: string;
	date: string;
	value: number;
	updatedAt: number;
};

const TS = { type: 'number', minimum: 0, maximum: 1e15, multipleOf: 1 } as const;

export const taskSchema: RxJsonSchema<Task> = {
	title: 'task',
	version: 0,
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
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 40 },
		name: { type: 'string' },
		emoji: { type: 'string', maxLength: 8 },
		color: { type: 'string', maxLength: 24 },
		kind: { type: 'string', enum: ['binary', 'quantity'], maxLength: 10 },
		target: { type: 'number', minimum: 1, maximum: 10000, multipleOf: 1 },
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
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 51 },
		habitId: { type: 'string', maxLength: 40 },
		date: { type: 'string', maxLength: 10 },
		value: { type: 'number', minimum: 0, maximum: 10000, multipleOf: 1 },
		updatedAt: TS
	},
	required: ['id', 'habitId', 'date', 'value', 'updatedAt'],
	indexes: [['habitId', 'date'], ['date'], ['updatedAt']]
};

export const COLLECTION_NAMES = ['tasks', 'projects', 'habits', 'habitLogs'] as const;
export type CollectionName = (typeof COLLECTION_NAMES)[number];
