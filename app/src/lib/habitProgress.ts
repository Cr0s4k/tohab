import type { DayKey } from './dates.ts';
import type { Habit, HabitLog } from './db/schemas.ts';
import {
	bestStreak,
	completionRate,
	completionWindow,
	currentStreak,
	isComplete,
	isDue,
	periodValue,
	type LogMap
} from './streaks.ts';

export function percentage(done: number, due: number) {
	return due === 0 ? 0 : Math.round((done / due) * 100);
}

function windowStats(habits: Habit[], byHabit: Map<string, LogMap>, days: number, today: DayKey, weekStartsOn: 0 | 1) {
	let due = 0;
	let done = 0;
	for (const habit of habits) {
		const logs = byHabit.get(habit.id) ?? new Map();
		const window = completionWindow(habit, logs, days, today, weekStartsOn);
		due += window.due;
		done += window.done;
	}
	return { due, done };
}

function groupLogs(logs: HabitLog[]) {
	const byHabit = new Map<string, LogMap>();
	for (const log of logs) {
		let habitLogs = byHabit.get(log.habitId);
		if (!habitLogs) byHabit.set(log.habitId, (habitLogs = new Map()));
		habitLogs.set(log.date, log.value);
	}
	return byHabit;
}

export function buildHabitProgress(
	habits: Habit[],
	logs: HabitLog[],
	weekStartsOn: 0 | 1,
	today: DayKey
) {
	const byHabit = groupLogs(logs);
	const dueToday = habits.filter((habit) => isDue(habit, today));
	const doneToday = dueToday.filter((habit) =>
		isComplete(habit, byHabit.get(habit.id) ?? new Map(), today, weekStartsOn)
	).length;

	return {
		overview: {
			dueToday: dueToday.length,
			doneToday,
			seven: windowStats(habits, byHabit, 7, today, weekStartsOn),
			thirty: windowStats(habits, byHabit, 30, today, weekStartsOn)
		},
		rows: habits.map((habit) => {
			const habitLogs = byHabit.get(habit.id) ?? new Map();
			return {
				habit,
				value: periodValue(habit, habitLogs, today, weekStartsOn),
				current: currentStreak(habit, habitLogs, weekStartsOn, today),
				best: bestStreak(habit, habitLogs, weekStartsOn, today),
				month: Math.round(completionRate(habit, habitLogs, 30, today, weekStartsOn) * 100)
			};
		})
	};
}
