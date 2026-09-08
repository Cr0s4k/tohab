import type { Habit, HabitLog } from '../src/lib/db/schemas.ts';
import { buildHabitProgress, percentage } from '../src/lib/habitProgress.ts';
import { createReporter } from '../../test/assertions.ts';

const TODAY = '2026-08-19';
const reporter = createReporter();
const check = reporter.check;

function habit(id: string, patch: Partial<Habit> = {}): Habit {
	return {
		id,
		name: id,
		emoji: '✓',
		color: '#000',
		goal: 'build',
		kind: 'binary',
		target: 1,
		unit: '',
		scheduleKind: 'daily',
		weekdays: [1, 2, 3, 4, 5],
		timesPerWeek: 3,
		archived: false,
		createdAt: new Date(2026, 5, 1).getTime(),
		updatedAt: 0,
		...patch
	};
}

function log(habitId: string, date: string): HabitLog {
	return { id: `${habitId}:${date}`, habitId, date, value: 1, updatedAt: 0 };
}

const daily = habit('daily');
const weekdays = habit('weekdays', { scheduleKind: 'weekdays' });
const progress = buildHabitProgress(
	[daily, weekdays],
	[log('daily', TODAY), log('daily', '2026-08-18'), log('weekdays', TODAY)],
	1,
	TODAY
);

check('overview counts habits due today', progress.overview.dueToday, 2);
check('overview counts completed habits today', progress.overview.doneToday, 2);
check('seven-day window combines due schedules', progress.overview.seven, { due: 12, done: 3 });
check('row exposes today value', progress.rows[0].value, 1);
check('row exposes current streak', progress.rows[0].current, 2);
check('percentage handles an empty denominator', percentage(0, 0), 0);

const fresh = habit('fresh', { createdAt: new Date(2026, 7, 19).getTime() });
const freshProgress = buildHabitProgress([fresh], [log('fresh', TODAY)], 1, TODAY);
check('new habit does not count days before creation', freshProgress.overview.thirty, { due: 1, done: 1 });
check('new habit overview agrees with individual rate', freshProgress.rows[0].month, 100);
const backfilled = buildHabitProgress([fresh], [log('fresh', '2026-08-18'), log('fresh', TODAY)], 1, TODAY);
check('aggregate respects backfilled history', backfilled.overview.thirty, { due: 2, done: 2 });
const weekly = habit('weekly', { scheduleKind: 'weekly', createdAt: new Date(2026, 7, 17).getTime() });
const met = buildHabitProgress([weekly], ['2026-08-17', '2026-08-18', TODAY].map(day => log('weekly', day)), 1, '2026-08-23');
check('weekly goal remains complete on unlogged days', met.overview.doneToday, 1);
check('weekly goal counts once in overview', met.overview.seven, { due: 1, done: 1 });
check('three days meets the weekly rate', met.rows[0].month, 100);
check('weekly row exposes completed days this week', met.rows[0].value, 3);

reporter.finish('Habit progress assertions passed');
