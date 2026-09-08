<script lang="ts">
	import type { Habit } from '$lib/db/schemas';
	import { humanDay, shiftKey, startOfWeekKey, today, WEEKDAY_LABELS } from '$lib/dates';
	import { isDue, isWeeklyQuantity, valueOn, type LogMap } from '$lib/streaks';
	import { haptic, hapticTap } from '$lib/haptics';

	let {
		habit,
		logs,
		weeks = 12,
		weekStartsOn = 1,
		onToggleDay
	}: {
		habit: Habit;
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

	function fill(day: string): string {
		const value = valueOn(logs, day);
		if (value <= 0) return 'var(--surface-sunken)';
		const ratio = Math.min(1, value / habit.target);
		return `color-mix(in oklch, ${habit.color} ${Math.round(25 + ratio * 75)}%, var(--surface-sunken))`;
	}
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
					{@const scheduled = isDue(habit, day)}
					<button
						type="button"
						use:hapticTap
						disabled={future}
						aria-label={isWeeklyQuantity(habit)
							? `${humanDay(day)}: ${valueOn(logs, day)} ${habit.unit || 'times'} logged`
							: habit.goal === 'break'
							? `${humanDay(day)}: ${valueOn(logs, day)} slips, limit ${habit.target}`
							: `${humanDay(day)}: ${valueOn(logs, day)} of ${habit.target}`}
						onclick={() => {
							haptic('tap');
							onToggleDay(day);
						}}
						class="tap size-[1.1rem] shrink-0 rounded-[0.3rem] disabled:opacity-25"
						class:ring-1={day === todayKey}
						style="background: {fill(day)}; opacity: {future ? 0.2 : scheduled ? 1 : 0.45}; --tw-ring-color: var(--text)"
					></button>
				{/each}
			</div>
		{/each}
	</div>
</div>
