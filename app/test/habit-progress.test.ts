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
		createdAt: Date.UTC(2026, 5, 1),
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

const fresh = habit('fresh', { createdAt: Date.UTC(2026, 7, 19) });
const freshProgress = buildHabitProgress([fresh], [log('fresh', TODAY)], 1, TODAY);
check('new habit does not count days before creation', freshProgress.overview.thirty, { due: 1, done: 1 });
check('new habit overview agrees with individual rate', freshProgress.rows[0].month, 100);
const backfilled = buildHabitProgress([fresh], [log('fresh', '2026-08-18'), log('fresh', TODAY)], 1, TODAY);
check('aggregate respects backfilled history', backfilled.overview.thirty, { due: 2, done: 2 });
const weekly = habit('weekly', { createdAt: Date.UTC(2026, 7, 17), scheduleKind: 'weekly' });
const met = buildHabitProgress([weekly], ['2026-08-17', '2026-08-18', TODAY].map(day => log('weekly', day)), 1, '2026-08-23');
check('weekly goal remains complete on unlogged days', met.overview.doneToday, 1);
check('weekly goal counts once in overview', met.overview.seven, { due: 1, done: 1 });
check('three days meets the weekly rate', met.rows[0].month, 100);
check('weekly row exposes completed days this week', met.rows[0].value, 3);

const future = habit('future', { startDate: '2026-08-20' });
const futureProgress = buildHabitProgress([future], [log('future', TODAY)], 1, TODAY);
check('future habit remains a zeroed progress row', futureProgress.rows[0], {
	habit: future,
	value: 0,
	current: 0,
	best: 0,
	month: 0
});
check('future habit is excluded from today overview', futureProgress.overview, {
	dueToday: 0,
	doneToday: 0,
	seven: { due: 0, done: 0 },
	thirty: { due: 0, done: 0 }
});

const partial = habit('partial', {
	startDate: '2026-08-19',
	scheduleKind: 'weekly',
	timesPerWeek: 3
});
const partialProgress = buildHabitProgress(
	[partial],
	['2026-08-19', '2026-08-20', '2026-08-21'].map((day) => log('partial', day)),
	1,
	'2026-08-23'
);
check('partial weekly progress remains visible', partialProgress.rows[0].value, 3);
check(
	'partial weekly streak and rate remain unearned',
	[partialProgress.rows[0].current, partialProgress.rows[0].best, partialProgress.rows[0].month],
	[0, 0, 0]
);
check('partial weekly period is excluded from overview rate', partialProgress.overview.seven, { due: 0, done: 0 });

reporter.finish('Habit progress assertions passed');
