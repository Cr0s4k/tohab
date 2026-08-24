import { shiftKey, today } from './dates.ts';

export const TASK_PRIORITIES = [1, 2, 3, 4] as const;

export function taskDateShortcuts() {
	const current = today();
	return [
		{ label: 'Today', value: current },
		{ label: 'Tomorrow', value: shiftKey(current, 1) },
		{ label: 'Next week', value: shiftKey(current, 7) },
		{ label: 'None', value: '' }
	];
}
