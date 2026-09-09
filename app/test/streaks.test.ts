import {
	currentStreak,
	bestStreak,
	completionRate,
	isComplete,
	isDue,
	isActiveOn,
	habitStartDate,
	periodValue,
	type LogMap
} from '../src/lib/streaks.ts';
import type { Habit, HabitRevision, HabitView } from '../src/lib/db/schemas.ts';
import { createReporter } from '../../test/assertions.ts';

const TODAY = '2026-08-19'; // a Wednesday

function habit(over: Partial<Habit> = {}): Habit {
	return {
		id: 'h',
		name: 'h',
		emoji: '💪',
		color: 'c',
		goal: 'build',
		kind: 'binary',
		target: 1,
		unit: '',
		scheduleKind: 'daily',
		weekdays: [1, 2, 3, 4, 5],
		timesPerWeek: 3,
		archived: false,
		createdAt: Date.UTC(2026, 5, 1), // 2026-06-01 UTC, well before TODAY
		updatedAt: 0,
		...over
	};
}

function logs(days: string[], value = 1): LogMap {
	return new Map(days.map((d) => [d, value]));
}

function revision(over: Partial<HabitRevision> = {}): HabitRevision {
	return {
		id: 'r',
		habitId: 'h',
		effectiveFrom: '2026-08-19',
		goal: 'build',
		kind: 'binary',
		target: 1,
		unit: '',
		scheduleKind: 'daily',
		weekdays: [1, 2, 3, 4, 5],
		timesPerWeek: 3,
		createdAt: 1,
		updatedAt: 1,
		...over
	};
}

function view(over: Partial<Habit> = {}, revisions: HabitRevision[] = []): HabitView {
	return { ...habit(over), revisions };
}

const reporter = createReporter();
const eq = reporter.eq;

// --- daily ---
const daily = habit();
eq('daily: no logs', currentStreak(daily, logs([]), 1, TODAY), 0);
eq('daily: today only', currentStreak(daily, logs([TODAY]), 1, TODAY), 1);
eq(
	'daily: 3 days incl today',
	currentStreak(daily, logs(['2026-08-17', '2026-08-18', '2026-08-19']), 1, TODAY),
	3
);
eq(
	'daily: today unfinished does not break',
	currentStreak(daily, logs(['2026-08-17', '2026-08-18']), 1, TODAY),
	2
);
eq(
	'daily: gap yesterday breaks',
	currentStreak(daily, logs(['2026-08-16', '2026-08-17', '2026-08-19']), 1, TODAY),
	1
);
eq(
	'daily: best keeps longest run',
	bestStreak(daily, logs(['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-15', '2026-08-16']), 1, TODAY),
	3
);

// --- weekdays (Mon-Fri) ---
const wd = habit({ scheduleKind: 'weekdays', weekdays: [1, 2, 3, 4, 5] });
eq('weekdays: due Wed', isDue(wd, '2026-08-19'), true);
eq('weekdays: not due Sat', isDue(wd, '2026-08-22'), false);
eq(
	'weekdays: weekend gap does not break',
	// Fri 14, Mon 17, Tue 18, Wed 19 done; Sat 15 + Sun 16 skipped
	currentStreak(wd, logs(['2026-08-14', '2026-08-17', '2026-08-18', '2026-08-19']), 1, TODAY),
	4
);
eq(
	'weekdays: missed Monday breaks',
	currentStreak(wd, logs(['2026-08-14', '2026-08-18', '2026-08-19']), 1, TODAY),
	2
);

// --- quantity target ---
const qty = habit({ kind: 'quantity', target: 8, unit: 'glasses' });
eq('quantity: partial is not complete', currentStreak(qty, logs([TODAY], 5), 1, TODAY), 0);
eq('quantity: target met', currentStreak(qty, logs([TODAY], 8), 1, TODAY), 1);
eq('quantity: over target counts', currentStreak(qty, logs([TODAY], 12), 1, TODAY), 1);

// --- break habits: success is staying at or below the daily limit ---
const breakHabit = habit({ goal: 'break', kind: 'quantity', target: 2 });
eq('break: clean day is complete', isComplete(breakHabit, logs([]), TODAY), true);
eq('break: at the limit is complete', isComplete(breakHabit, logs([TODAY], 2), TODAY), true);
eq('break: over the limit breaks', isComplete(breakHabit, logs([TODAY], 3), TODAY), false);
eq(
	'break: yesterday slip leaves only today',
	currentStreak(breakHabit, logs(['2026-08-18'], 3), 1, TODAY),
	1
);
eq(
	'break: clean yesterday and today continues',
	currentStreak(breakHabit, logs([]), 1, TODAY),
	80
);

// --- weekly (3x per week), week starts Monday ---
const wk = habit({ scheduleKind: 'weekly', timesPerWeek: 3 });
// This week = Mon 17 .. Sun 23. Last week = Mon 10 .. Sun 16.
eq(
	'weekly: this week met',
	currentStreak(wk, logs(['2026-08-17', '2026-08-18', '2026-08-19']), 1, TODAY),
	1
);
eq(
	'weekly: this week short, last week met -> still 1',
	currentStreak(wk, logs(['2026-08-17', '2026-08-10', '2026-08-12', '2026-08-14']), 1, TODAY),
	1
);
eq(
	'weekly: two weeks met',
	currentStreak(
		wk,
		logs(['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-10', '2026-08-12', '2026-08-14']),
		1,
		TODAY
	),
	2
);
eq('weekly: nothing', currentStreak(wk, logs([]), 1, TODAY), 0);
eq(
	'weekly: best over history',
	bestStreak(wk, logs(['2026-08-10', '2026-08-12', '2026-08-14', '2026-08-03', '2026-08-05', '2026-08-07']), 1, TODAY),
	2
);

// --- completion rate ---
eq(
	'rate: 3 of last 7 daily',
	Math.round(completionRate(daily, logs(['2026-08-19', '2026-08-18', '2026-08-17']), 7, TODAY) * 100),
	43
);
eq(
	'rate: weekdays window ignores weekend',
	// last 7 days = Thu13..Wed19; due days = 13,14,17,18,19 (5); done 3
	Math.round(completionRate(wd, logs(['2026-08-19', '2026-08-18', '2026-08-17']), 7, TODAY) * 100),
	60
);

// --- created-at floor ---
const fresh = habit({ createdAt: Date.UTC(2026, 7, 18) }); // 2026-08-18 UTC
eq(
	'floor: with no earlier logs the streak stops at the creation day',
	currentStreak(fresh, logs(['2026-08-18', '2026-08-19']), 1, TODAY),
	2
);

// --- backfilled history predating the habit's creation still counts ---
// The heatmap invites backfilling days before the habit existed, so the streak floor
// must follow the earliest log rather than the creation timestamp.
const backfilled = habit({ createdAt: Date.UTC(2026, 7, 19) }); // created today
eq(
	'backfill before creation counts toward the streak',
	currentStreak(backfilled, logs(['2026-08-19', '2026-08-18', '2026-08-17', '2026-08-16']), 1, TODAY),
	4
);
eq(
	'backfill before creation counts toward best',
	bestStreak(backfilled, logs(['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']), 1, TODAY),
	5
);
eq(
	'backfill before creation counts toward the 30 day rate',
	Math.round(
		completionRate(
			backfilled,
			logs(Array.from({ length: 10 }, (_, i) => `2026-08-${String(19 - i).padStart(2, '0')}`)),
			30,
			TODAY
		) * 100
	),
	100
);
eq(
	'no logs still clamps to the creation day',
	bestStreak(habit({ createdAt: Date.UTC(2026, 7, 19) }), logs([]), 1, TODAY),
	0
);

// Weekly quantities count occurrences across days, including multiple on one day.
const cap = habit({ goal: 'break', kind: 'quantity', target: 3, scheduleKind: 'weekly', createdAt: Date.UTC(2026, 7, 10) });
const cappedLogs = new Map([['2026-08-10', 2], ['2026-08-12', 1], ['2026-08-17', 2], ['2026-08-19', 1]]);
eq('weekly cap: at the limit succeeds', isComplete(cap, cappedLogs, TODAY, 1), true);
eq('weekly cap: aggregate over limit fails', isComplete(cap, new Map([...cappedLogs, ['2026-08-18', 1]]), TODAY, 1), false);
eq('weekly cap: current week is not earned early', currentStreak(cap, cappedLogs, 1, TODAY), 1);
eq('weekly cap: best excludes unfinished current week', bestStreak(cap, cappedLogs, 1, TODAY), 1);
eq('weekly cap: exceeding current limit breaks streak', currentStreak(cap, new Map([...cappedLogs, ['2026-08-18', 1]]), 1, TODAY), 0);
eq('weekly cap: zero limit accepts empty week', isComplete({ ...cap, target: 0 }, new Map(), TODAY, 1), true);
eq('weekly cap: zero limit rejects a single occurrence', isComplete({ ...cap, target: 0 }, logs(['2026-08-18']), TODAY, 1), false);
eq('weekly cap: Sunday start includes Sunday', isComplete(cap, new Map([['2026-08-16', 4]]), TODAY, 0), false);
eq('weekly cap: Monday start excludes previous Sunday', isComplete(cap, new Map([['2026-08-16', 4]]), TODAY, 1), true);
const weeklyQuantity = { ...cap, goal: 'build' as const, target: 8 };
eq('weekly quantity: sum reaches goal across days', isComplete(weeklyQuantity, new Map([['2026-08-17', 5], ['2026-08-19', 3]]), TODAY), true);
eq('weekly quantity: starts fresh next week', isComplete(weeklyQuantity, new Map([['2026-08-17', 8]]), '2026-08-24'), false);

eq('weekly binary: met target remains complete on Sunday', isComplete(wk, logs(['2026-08-17', '2026-08-18', '2026-08-19']), '2026-08-23', 1), true);
eq('weekly binary: new week starts incomplete', isComplete(wk, logs(['2026-08-17', '2026-08-18', '2026-08-19']), '2026-08-24', 1), false);
eq('weekly binary: Sunday-start boundary respected', isComplete(wk, logs(['2026-08-16', '2026-08-17', '2026-08-18']), TODAY, 0), true);
eq('weekly binary: Monday-start excludes preceding Sunday', isComplete(wk, logs(['2026-08-16', '2026-08-17', '2026-08-18']), TODAY, 1), false);
eq('weekly quantity: complete week earns 100 percent', completionRate(weeklyQuantity, logs(['2026-08-17'], 8), 7, '2026-08-23', 1), 1);

const legacyMidweekWeekly = habit({
	scheduleKind: 'weekly',
	timesPerWeek: 3,
	createdAt: Date.UTC(2026, 7, 19)
});
const legacyMidweekLogs = logs(['2026-08-19', '2026-08-20', '2026-08-21']);
eq('legacy mid-week weekly streak scores its inferred partial week', currentStreak(legacyMidweekWeekly, legacyMidweekLogs, 1, '2026-08-23'), 1);
eq('legacy mid-week weekly rate agrees with the streak', completionRate(legacyMidweekWeekly, legacyMidweekLogs, 7, '2026-08-23', 1), 1);

// --- explicit and legacy start dates ---
const utcBoundary = habit({ createdAt: Date.parse('2026-08-20T23:30:00Z') });
eq('legacy start uses a deterministic UTC creation day', habitStartDate(utcBoundary), '2026-08-20');
eq(
	'legacy start extends to the earliest known log',
	habitStartDate(utcBoundary, logs(['2026-08-18', '2026-08-21'])),
	'2026-08-18'
);
eq('legacy availability uses optional logs', isActiveOn(utcBoundary, '2026-08-18', logs(['2026-08-18'])), true);
eq('legacy due without logs keeps the creation floor', isDue(utcBoundary, '2026-08-18'), false);

const explicit = habit({ startDate: '2026-08-18', createdAt: Date.UTC(2026, 7, 19) });
const explicitLogs = logs(['2026-08-17', '2026-08-18', '2026-08-19']);
eq('explicit start is authoritative over earlier logs', habitStartDate(explicit, explicitLogs), '2026-08-18');
eq('explicit start excludes the prior day', isActiveOn(explicit, '2026-08-17', explicitLogs), false);
eq('explicit start includes its own day', isActiveOn(explicit, '2026-08-18', explicitLogs), true);
eq('explicit start excludes prior daily values', periodValue(explicit, explicitLogs, '2026-08-17'), 0);
eq('explicit start excludes prior daily results', currentStreak(explicit, explicitLogs, 1, TODAY), 2);
eq('explicit start excludes prior rate periods', completionRate(explicit, explicitLogs, 7, TODAY), 1);

const future = habit({ startDate: '2026-08-20' });
eq('future habit is inactive before its start', isActiveOn(future, TODAY), false);
eq('future habit is not due before its start', isDue(future, TODAY), false);
eq('future habit has no current streak', currentStreak(future, logs([]), 1, TODAY), 0);

// A weekly habit started mid-week may show its partial total, but that period cannot score.
const partialWeekly = habit({
	startDate: '2026-08-19',
	scheduleKind: 'weekly',
	timesPerWeek: 3
});
const partialLogs = logs(['2026-08-19', '2026-08-20', '2026-08-21']);
eq('partial first week still displays logged progress', periodValue(partialWeekly, partialLogs, '2026-08-23', 1), 3);
eq('partial first week is excluded from current streak', currentStreak(partialWeekly, partialLogs, 1, '2026-08-23'), 0);
eq('partial first week is excluded from best streak', bestStreak(partialWeekly, partialLogs, 1, '2026-08-23'), 0);
eq('partial first week is excluded from completion rate', completionRate(partialWeekly, partialLogs, 7, '2026-08-23', 1), 0);

const fullWeekLogs = new Map([...partialLogs, ...logs(['2026-08-24', '2026-08-25', '2026-08-26'])]);
eq('first full week starts scoring after a partial week', currentStreak(partialWeekly, fullWeekLogs, 1, '2026-08-30'), 1);
eq('a week-boundary start scores immediately', currentStreak({ ...partialWeekly, startDate: '2026-08-17' }, logs(['2026-08-17', '2026-08-18', '2026-08-19']), 1, '2026-08-23'), 1);
eq('Sunday week boundary also scores immediately', currentStreak({ ...partialWeekly, startDate: '2026-08-23' }, logs(['2026-08-23', '2026-08-24', '2026-08-25']), 0, '2026-08-29'), 1);

// --- dated tracking-rule revisions ---
const targetHistory = view(
	{ startDate: '2026-08-17', kind: 'quantity', target: 5, unit: 'pages' },
	[revision({ id: 'target-up', effectiveFrom: '2026-08-19', kind: 'quantity', target: 8, unit: 'pages', createdAt: 2, updatedAt: 2 })]
);
const targetLogs = new Map([
	['2026-08-17', 5],
	['2026-08-18', 5],
	['2026-08-19', 8]
]);
eq('target revisions preserve earlier daily results', currentStreak(targetHistory, targetLogs, 1, '2026-08-19'), 3);
eq('target revisions preserve earlier completion rate', completionRate(targetHistory, targetLogs, 3, '2026-08-19'), 1);

const weekdayHistory = view(
	{ startDate: '2026-08-17', scheduleKind: 'weekdays', weekdays: [1, 2, 3, 4, 5] },
	[revision({ id: 'weekday-change', effectiveFrom: '2026-08-19', scheduleKind: 'weekdays', weekdays: [1, 3, 5], createdAt: 2, updatedAt: 2 })]
);
const weekdayLogs = new Map([
	['2026-08-17', 1],
	['2026-08-18', 0],
	['2026-08-19', 1],
	['2026-08-21', 1]
]);
eq('weekday revisions use the old schedule before effective date', completionRate(weekdayHistory, weekdayLogs, 5, '2026-08-21'), 0.75);
eq('weekday revisions skip newly unscheduled days in streaks', currentStreak(weekdayHistory, weekdayLogs, 1, '2026-08-21'), 2);

const goalHistory = view(
	{ startDate: '2026-08-17' },
	[revision({ id: 'goal-change', effectiveFrom: '2026-08-19', goal: 'break', kind: 'quantity', target: 0, createdAt: 2, updatedAt: 2 })]
);
const goalLogs = logs(['2026-08-17', '2026-08-18', '2026-08-19']);
eq('goal revisions evaluate earlier days with the old goal', currentStreak(goalHistory, goalLogs, 1, '2026-08-19'), 2);
eq('goal revisions preserve the historical completion rate', completionRate(goalHistory, goalLogs, 3, '2026-08-19'), 2 / 3);

const dailyToWeekly = view(
	{ startDate: '2026-08-17', scheduleKind: 'daily' },
	[revision({ id: 'weekly-start', effectiveFrom: '2026-08-24', scheduleKind: 'weekly', kind: 'binary', target: 1, timesPerWeek: 3, createdAt: 2, updatedAt: 2 })]
);
const dailyToWeeklyLogs = logs(['2026-08-20', '2026-08-21', '2026-08-24', '2026-08-25', '2026-08-26']);
eq('daily to weekly resets the current streak cadence', currentStreak(dailyToWeekly, dailyToWeeklyLogs, 1, '2026-08-30'), 1);
eq('daily to weekly computes best in the current cadence', bestStreak(dailyToWeekly, dailyToWeeklyLogs, 1, '2026-08-30'), 1);
eq('daily to weekly preserves both historical rate units', completionRate(dailyToWeekly, dailyToWeeklyLogs, 14, '2026-08-30'), 3 / 8);

const weeklyToDaily = view(
	{ startDate: '2026-08-17', scheduleKind: 'weekly', kind: 'binary', timesPerWeek: 3 },
	[revision({ id: 'daily-start', effectiveFrom: '2026-08-24', scheduleKind: 'daily', kind: 'binary', target: 1, createdAt: 2, updatedAt: 2 })]
);
const weeklyToDailyLogs = logs(['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-24', '2026-08-25', '2026-08-26']);
eq('weekly to daily resets the current streak cadence', currentStreak(weeklyToDaily, weeklyToDailyLogs, 1, '2026-08-26'), 3);
eq('weekly to daily computes best in the current cadence', bestStreak(weeklyToDaily, weeklyToDailyLogs, 1, '2026-08-26'), 3);
eq('weekly to daily preserves the prior weekly rate period', completionRate(weeklyToDaily, weeklyToDailyLogs, 14, '2026-08-30'), 0.5);

const weeklyThresholdHistory = view(
	{ startDate: '2026-08-17', scheduleKind: 'weekly', kind: 'binary', target: 1, timesPerWeek: 2 },
	[revision({ id: 'threshold-up', effectiveFrom: '2026-08-24', scheduleKind: 'weekly', kind: 'binary', target: 2, timesPerWeek: 2, createdAt: 2, updatedAt: 2 })]
);
const weeklyThresholdLogs = new Map([
	['2026-08-17', 1],
	['2026-08-18', 1],
	['2026-08-24', 2],
	['2026-08-25', 2]
]);
eq('weekly binary thresholds resolve per historical day', isComplete(weeklyThresholdHistory, weeklyThresholdLogs, '2026-08-23', 1), true);
eq('weekly binary thresholds use the new target in the new week', isComplete(weeklyThresholdHistory, weeklyThresholdLogs, '2026-08-30', 1), true);
eq('weekly binary threshold history keeps both weeks complete', completionRate(weeklyThresholdHistory, weeklyThresholdLogs, 14, '2026-08-30', 1), 1);

const mixedSundayWeek = view(
	{ startDate: '2026-08-17', scheduleKind: 'weekly', kind: 'quantity', target: 10, unit: 'pages' },
	[revision({ id: 'monday-target', effectiveFrom: '2026-08-24', scheduleKind: 'weekly', kind: 'quantity', target: 20, unit: 'pages', createdAt: 2, updatedAt: 2 })]
);
const mixedSundayLogs = new Map([
	['2026-08-23', 10],
	['2026-08-24', 20],
	['2026-08-25', 20]
]);
eq('mixed weekly period displays only days using the requested rule', periodValue(mixedSundayWeek, mixedSundayLogs, '2026-08-29', 0), 40);
eq('mixed weekly period is not scored', isComplete(mixedSundayWeek, mixedSundayLogs, '2026-08-29', 0), false);
eq('mixed weekly period is omitted from completion rate', completionRate(mixedSundayWeek, mixedSundayLogs, 7, '2026-08-29', 0), 0);
const mixedBetweenFullWeeks = { ...mixedSundayWeek, startDate: '2026-08-16' };
const mixedBetweenLogs = new Map([...mixedSundayLogs, ['2026-08-16', 10], ['2026-08-30', 20]] as [string, number][]);
eq('unscored mixed week does not break a weekly streak', currentStreak(mixedBetweenFullWeeks, mixedBetweenLogs, 0, '2026-09-05'), 2);
eq('unscored mixed week does not reset a best weekly streak', bestStreak(mixedBetweenFullWeeks, mixedBetweenLogs, 0, '2026-09-05'), 2);
eq('partial first week can display a reached target without earning a streak', isComplete({ ...mixedSundayWeek, revisions: [], startDate: '2026-08-24' }, new Map([['2026-08-24', 10]]), '2026-08-24', 0), true);

const sameDateA = view(
	{ startDate: '2026-08-17', kind: 'quantity', target: 1 },
	[
		revision({ id: 'late', effectiveFrom: '2026-08-20', kind: 'quantity', target: 5, createdAt: 20, updatedAt: 20 }),
		revision({ id: 'early', effectiveFrom: '2026-08-20', kind: 'quantity', target: 2, createdAt: 10, updatedAt: 10 })
	]
);
const sameDateB = { ...sameDateA, revisions: [...sameDateA.revisions!].reverse() };
const sameDateLogs = new Map([['2026-08-20', 3]]);
eq('same-date revisions converge regardless of arrival order', isComplete(sameDateA, sameDateLogs, '2026-08-20'), false);
eq('same-date revisions remain deterministic offline', isComplete(sameDateB, sameDateLogs, '2026-08-20'), false);

const sameDateCadence = view(
	{ startDate: '2026-08-17', scheduleKind: 'daily' },
	[
		revision({ id: 'weekly-loser', effectiveFrom: '2026-08-24', scheduleKind: 'weekly', createdAt: 10, updatedAt: 10 }),
		revision({ id: 'daily-winner', effectiveFrom: '2026-08-24', scheduleKind: 'daily', createdAt: 20, updatedAt: 20 })
	]
);
eq(
	'same-date losing cadence edits do not reset the winning cadence',
	currentStreak(sameDateCadence, logs(['2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26']), 1, '2026-08-26'),
	4
);

reporter.finish();
