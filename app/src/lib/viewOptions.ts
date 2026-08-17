export type GroupKey = 'none' | 'priority' | 'date' | 'added' | 'project';
export type SortKey = 'date' | 'priority' | 'added' | 'title';
export type Order = 'asc' | 'desc';

export type ViewOptions = {
	group: GroupKey;
	sort: SortKey;
	order: Order;
	showDone: boolean;
};

export const GROUP_CHOICES: { id: GroupKey; label: string }[] = [
	{ id: 'none', label: 'None' },
	{ id: 'priority', label: 'Priority' },
	{ id: 'date', label: 'Date' },
	{ id: 'added', label: 'Added' },
	{ id: 'project', label: 'Project' }
];

export const SORT_CHOICES: { id: SortKey; label: string }[] = [
	{ id: 'date', label: 'Date' },
	{ id: 'priority', label: 'Priority' },
	{ id: 'added', label: 'Added' },
	{ id: 'title', label: 'Name' }
];

export const ORDER_CHOICES: { id: Order; label: string }[] = [
	{ id: 'asc', label: 'Ascending' },
	{ id: 'desc', label: 'Descending' }
];

export const STORAGE_PREFIX = 'tohab.viewOpts.';

const BASE: ViewOptions = { group: 'none', sort: 'date', order: 'asc', showDone: false };

const SCOPE_DEFAULTS: Record<string, Partial<ViewOptions>> = {
	upcoming: { group: 'date' }
};

export function projectScope(projectId: string): string {
	return `project:${projectId || 'inbox'}`;
}

export function defaultOptions(scope: string): ViewOptions {
	return { ...BASE, ...SCOPE_DEFAULTS[scope] };
}
