import {
	currentStreak,
	bestStreak,
	completionRate,
	isComplete,
	isDue,
	type LogMap
} from '../src/lib/streaks.ts';
import type { Habit } from '../src/lib/db/schemas.ts';
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
		createdAt: new Date(2026, 5, 1).getTime(), // 2026-06-01, well before TODAY
		updatedAt: 0,
		...over
	};
}

function logs(days: string[], value = 1): LogMap {
	return new Map(days.map((d) => [d, value]));
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
const fresh = habit({ createdAt: new Date(2026, 7, 18).getTime() }); // 2026-08-18
eq(
	'floor: with no earlier logs the streak stops at the creation day',
	currentStreak(fresh, logs(['2026-08-18', '2026-08-19']), 1, TODAY),
	2
);

// --- backfilled history predating the habit's creation still counts ---
// The heatmap invites backfilling days before the habit existed, so the streak floor
// must follow the earliest log rather than the creation timestamp.
const backfilled = habit({ createdAt: new Date(2026, 7, 19).getTime() }); // created today
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
	bestStreak(habit({ createdAt: new Date(2026, 7, 19).getTime() }), logs([]), 1, TODAY),
	0
);

// Weekly quantities count occurrences across days, including multiple on one day.
const cap = habit({ goal: 'break', kind: 'quantity', target: 3, scheduleKind: 'weekly', createdAt: new Date(2026, 7, 10).getTime() });
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

reporter.finish();
