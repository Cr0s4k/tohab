import {
	HABIT_NAV_ITEMS,
	isNavItemActive,
	NAV_GROUPS,
	TASK_NAV_ITEMS
} from '../src/lib/navigation.ts';
import { createReporter } from '../../test/assertions.ts';

const reporter = createReporter();
const check = reporter.check;

check('task navigation is shared with the task group', NAV_GROUPS[0].items, TASK_NAV_ITEMS);
check('habit navigation is shared with the habit group', NAV_GROUPS[1].items, HABIT_NAV_ITEMS);
check(
	'query-specific task navigation matches its view',
	isNavItemActive(new URL('https://tohab.test/tasks?view=upcoming'), '/tasks?view=upcoming'),
	true
);
check(
	'query-specific task navigation rejects another view',
	isNavItemActive(new URL('https://tohab.test/tasks?view=today'), '/tasks?view=upcoming'),
	false
);
check(
	'browse remains active for project details',
	isNavItemActive(new URL('https://tohab.test/projects/work'), '/browse'),
	true
);
check(
	'journal remains active for habit details',
	isNavItemActive(new URL('https://tohab.test/habits/run'), '/habits'),
	true
);

reporter.finish('Navigation model assertions passed');
