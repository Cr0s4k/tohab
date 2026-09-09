import type { Habit, HabitRevision, HabitRules, HabitView } from './db/schemas.ts';
import { shiftKey, startOfWeekKey, today, type DayKey } from './dates.ts';

export const RULE_FIELDS = ['goal', 'kind', 'target', 'unit', 'scheduleKind', 'weekdays', 'timesPerWeek'] as const;

export function habitRules(habit: HabitRules): HabitRules {
	return { goal: habit.goal ?? 'build', kind: habit.kind, target: habit.target, unit: habit.unit,
		scheduleKind: habit.scheduleKind, weekdays: [...habit.weekdays], timesPerWeek: habit.timesPerWeek };
}

export function rulesEqual(a: HabitRules, b: HabitRules): boolean {
	return RULE_FIELDS.every((field) => JSON.stringify(a[field]) === JSON.stringify(b[field]));
}

/** Same-day offline edits converge by creation time, then stable id, on every device. */
export function compareRevisions(a: HabitRevision, b: HabitRevision): number {
	return (a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0) ||
		a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function withHabitHistory(habit: Habit, revisions: HabitRevision[]): HabitView {
	return { ...habit, revisions: revisions.filter((revision) => revision.habitId === habit.id).sort(compareRevisions) };
}

export function habitOn(habit: HabitView, day: DayKey): HabitView {
	const revision = habit.revisions?.filter((revision) => revision.effectiveFrom <= day).sort(compareRevisions).at(-1);
	return revision ? { ...habit, ...habitRules(revision) } : habit;
}

/** Editors show the latest planned rules, including changes scheduled for next week. */
export function habitForEdit(habit: HabitView): HabitView {
	return habitOn(habit, '9999-12-31');
}

export function ruleChangeDate(habit: HabitView, next: HabitRules, weekStartsOn: 0 | 1, day = today()): DayKey {
	const current = habitOn(habit, day);
	const planned = habitForEdit(habit);
	const weekly = current.scheduleKind === 'weekly' || planned.scheduleKind === 'weekly' || next.scheduleKind === 'weekly';
	let effective = weekly ? shiftKey(startOfWeekKey(day, weekStartsOn), 7) : day;
	if (habit.startDate && habit.startDate > day) effective = habit.startDate;
	const pending = habit.revisions?.filter((revision) => revision.effectiveFrom > day).sort(compareRevisions).at(-1);
	if (pending && pending.effectiveFrom > effective) effective = pending.effectiveFrom;
	return effective;
}
