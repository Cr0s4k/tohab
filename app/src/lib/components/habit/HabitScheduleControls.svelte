<script lang="ts">
	import { WEEKDAY_LABELS, WEEKDAY_NAMES } from '#lib/dates.js';
	import type { HabitInput } from '#lib/habits.js';
	import { hapticTap } from '#lib/haptics.js';

	let {
		quantity = false,
		scheduleKind = $bindable(),
		weekdays,
		timesPerWeek = $bindable(),
		onToggleWeekday
	}: {
		quantity?: boolean;
		scheduleKind: HabitInput['scheduleKind'];
		weekdays: number[];
		timesPerWeek: number;
		onToggleWeekday: (day: number) => void;
	} = $props();

	const choices: { id: HabitInput['scheduleKind']; label: string }[] = [
		{ id: 'daily', label: 'Every day' },
		{ id: 'weekdays', label: 'Certain days' },
		{ id: 'weekly', label: 'Days per week' }
	];
</script>

<div>
	<p class="mb-2 text-sm font-medium">Schedule</p>
	<div class="sunken flex gap-1 rounded-xl p-1">
		{#each choices.filter((option) => !quantity || option.id !== 'weekly') as option (option.id)}
			<button type="button" aria-pressed={scheduleKind === option.id} onclick={() => (scheduleKind = option.id)} class="tap flex-1 rounded-xl py-2.5 text-[0.75rem] font-medium" class:chosen={scheduleKind === option.id} >
				{option.label}
			</button>
		{/each}
	</div>
</div>

{#if scheduleKind === 'weekdays'}
	<div class="sunken flex gap-1 rounded-xl p-1">
		{#each [1, 2, 3, 4, 5, 6, 0] as day (day)}
			<button type="button" use:hapticTap aria-pressed={weekdays.includes(day)} aria-label={WEEKDAY_NAMES[day]} onclick={() => onToggleWeekday(day)} class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-semibold" class:chosen={weekdays.includes(day)} >
				{WEEKDAY_LABELS[day]}
			</button>
		{/each}
	</div>
{/if}

{#if scheduleKind === 'weekly'}
	<div>
		<div class="sunken flex gap-1 rounded-xl p-1">
			{#each [1, 2, 3, 4, 5, 6, 7] as count (count)}
				<button type="button" aria-pressed={timesPerWeek === count} onclick={() => (timesPerWeek = count)} class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-semibold" class:chosen={timesPerWeek === count} >
					{count}
				</button>
			{/each}
		</div>
		<p class="dim mt-1.5 text-caption">Any {timesPerWeek} {timesPerWeek === 1 ? 'day' : 'days'} a week. Streaks count weeks, not days.</p>
	</div>
{/if}

<style>
	.chosen { background: var(--surface-raised); box-shadow: 0 1px 3px #0001; font-weight: 600; }
</style>
