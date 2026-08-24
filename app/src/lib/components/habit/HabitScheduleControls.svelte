<script lang="ts">
	import { WEEKDAY_LABELS, WEEKDAY_NAMES } from '$lib/dates';
	import type { HabitInput } from '$lib/habits';
	import { hapticTap } from '$lib/haptics';

	let {
		scheduleKind = $bindable(),
		weekdays,
		timesPerWeek = $bindable(),
		onToggleWeekday
	}: {
		scheduleKind: HabitInput['scheduleKind'];
		weekdays: number[];
		timesPerWeek: number;
		onToggleWeekday: (day: number) => void;
	} = $props();

	const choices: { id: HabitInput['scheduleKind']; label: string }[] = [
		{ id: 'daily', label: 'Every day' },
		{ id: 'weekdays', label: 'Certain days' },
		{ id: 'weekly', label: 'X per week' }
	];
</script>

<div>
	<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Schedule</p>
	<div class="flex gap-1.5">
		{#each choices as option (option.id)}
			<button type="button" onclick={() => (scheduleKind = option.id)} class="tap flex-1 rounded-xl py-2.5 text-[0.75rem] font-medium" class:accent-bg={scheduleKind === option.id} class:sunken={scheduleKind !== option.id}>
				{option.label}
			</button>
		{/each}
	</div>
</div>

{#if scheduleKind === 'weekdays'}
	<div class="flex gap-1.5">
		{#each [1, 2, 3, 4, 5, 6, 0] as day (day)}
			<button type="button" use:hapticTap aria-label={WEEKDAY_NAMES[day]} onclick={() => onToggleWeekday(day)} class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-semibold" class:accent-bg={weekdays.includes(day)} class:sunken={!weekdays.includes(day)}>
				{WEEKDAY_LABELS[day]}
			</button>
		{/each}
	</div>
{/if}

{#if scheduleKind === 'weekly'}
	<div>
		<div class="flex gap-1.5">
			{#each [1, 2, 3, 4, 5, 6, 7] as count (count)}
				<button type="button" onclick={() => (timesPerWeek = count)} class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-semibold" class:accent-bg={timesPerWeek === count} class:sunken={timesPerWeek !== count}>
					{count}
				</button>
			{/each}
		</div>
		<p class="dim mt-1.5 text-caption">Any {timesPerWeek} {timesPerWeek === 1 ? 'day' : 'days'} a week. Streaks count weeks, not days.</p>
	</div>
{/if}
