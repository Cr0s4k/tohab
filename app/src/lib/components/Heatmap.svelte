<script lang="ts">
	import type { HabitView } from '$lib/db/schemas';
	import { humanDay, shiftKey, startOfWeekKey, today, WEEKDAY_LABELS } from '$lib/dates';
	import { habitOn } from '$lib/habitHistory';
	import { habitStartDate, isActiveOn, isDue, isWeeklyQuantity, valueOn, type LogMap } from '$lib/streaks';
	import { haptic, hapticTap } from '$lib/haptics';

	let {
		habit,
		logs,
		weeks = 12,
		weekStartsOn = 1,
		onToggleDay
	}: {
		habit: HabitView;
		logs: LogMap;
		weeks?: number;
		weekStartsOn?: 0 | 1;
		onToggleDay: (day: string) => void;
	} = $props();

	let todayKey = $derived(today());
	let firstWeek = $derived(shiftKey(startOfWeekKey(todayKey, weekStartsOn), -7 * (weeks - 1)));

	let rowOrder = $derived(
		Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7)
	);

	let grid = $derived(
		Array.from({ length: weeks }, (_, w) =>
			Array.from({ length: 7 }, (_, d) => shiftKey(firstWeek, w * 7 + d))
		)
	);

	function fill(day: string, dayHabit = habit): string {
		const value = valueOn(logs, day);
		if (value <= 0) return 'var(--surface-sunken)';
		const ratio = Math.min(1, value / dayHabit.target);
		return `color-mix(in oklch, ${dayHabit.color} ${Math.round(25 + ratio * 75)}%, var(--surface-sunken))`;
	}

	let startKey = $derived(habitStartDate(habit, logs));
</script>

<div class="flex gap-1.5">
	<div class="flex flex-col gap-1 pt-0.5">
		{#each rowOrder as weekday (weekday)}
			<span class="dim grid h-[var(--cell)] place-items-center text-[0.6rem]" style="--cell: 1.1rem; width: 0.8rem">
				{WEEKDAY_LABELS[weekday]}
			</span>
		{/each}
	</div>

	<div class="flex flex-1 gap-1 overflow-x-auto pb-1">
		{#each grid as week, wi (wi)}
			<div class="flex flex-col gap-1">
				{#each week as day (day)}
					{@const future = day > todayKey}
					{@const dayHabit = habitOn(habit, day)}
					{@const active = isActiveOn(dayHabit, day, logs)}
					{@const scheduled = isDue(dayHabit, day, logs)}
					{@const unavailable = future || !active}
					<button
						type="button"
						use:hapticTap
						disabled={unavailable}
						aria-label={!active
							? `${humanDay(day)}: before this habit starts`
							: isWeeklyQuantity(dayHabit)
							? `${humanDay(day)}: ${valueOn(logs, day)} ${dayHabit.unit || 'times'} logged`
							: dayHabit.goal === 'break'
							? `${humanDay(day)}: ${valueOn(logs, day)} slips, limit ${dayHabit.target}`
							: `${humanDay(day)}: ${valueOn(logs, day)} of ${dayHabit.target}`}
						onclick={() => {
							haptic('tap');
							onToggleDay(day);
						}}
						class="tap size-[1.1rem] shrink-0 rounded-[0.3rem] disabled:opacity-25"
						class:ring-1={day === todayKey}
						style="background: {fill(day, dayHabit)}; opacity: {unavailable ? 0.2 : scheduled ? 1 : 0.45}; --tw-ring-color: var(--text)"
					></button>
				{/each}
			</div>
		{/each}
	</div>
</div>
{#if startKey > firstWeek}
	<p class="dim mt-2 text-caption">
		Days before {humanDay(startKey)} are unavailable. Edit the start date to backfill them.
	</p>
{/if}
