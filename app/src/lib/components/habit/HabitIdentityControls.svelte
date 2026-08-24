<script lang="ts">
	import { HABIT_COLORS, HABIT_EMOJI, type HabitInput } from '$lib/habits';
	import { hapticTap } from '$lib/haptics';

	let {
		goal,
		name = $bindable(),
		emoji = $bindable(),
		color = $bindable(),
		onGoal
	}: {
		goal: HabitInput['goal'];
		name: string;
		emoji: string;
		color: string;
		onGoal: (goal: HabitInput['goal']) => void;
	} = $props();
</script>

<div>
	<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">I want to track</p>
	<div class="flex gap-1.5">
		<button type="button" use:hapticTap onclick={() => onGoal('build')} class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-medium" aria-pressed={goal === 'build'} class:accent-bg={goal === 'build'} class:sunken={goal !== 'build'}>
			Build a good habit
		</button>
		<button type="button" use:hapticTap onclick={() => onGoal('break')} class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-medium" aria-pressed={goal === 'break'} class:accent-bg={goal === 'break'} class:sunken={goal !== 'break'}>
			Break a bad habit
		</button>
	</div>
</div>

<div class="flex gap-2">
	<span class="grid size-12 shrink-0 place-items-center rounded-2xl text-2xl" style="background: color-mix(in oklch, {color} 20%, transparent)">
		{emoji}
	</span>
	<div class="min-w-0 flex-1">
		{#if goal === 'break'}
			<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Goal</p>
		{/if}
		<input bind:value={name} placeholder={goal === 'break' ? 'e.g. Stop smoking' : 'Habit name'} class="sunken w-full rounded-2xl px-4 text-[0.95rem] outline-none placeholder:opacity-50" />
	</div>
</div>

<div class="flex flex-wrap gap-1.5">
	{#each HABIT_EMOJI as option (option)}
		<button type="button" onclick={() => (emoji = option)} aria-label={`Emoji ${option}`} aria-pressed={emoji === option} class="tap sunken grid size-11 place-items-center rounded-xl text-lg" class:ring-2={emoji === option} style="--tw-ring-color: var(--accent)">
			{option}
		</button>
	{/each}
</div>

<div class="flex gap-2">
	{#each HABIT_COLORS as option (option)}
		<button type="button" aria-label={`Colour ${option}`} aria-pressed={color === option} onclick={() => (color = option)} class="tap min-h-11 flex-1 rounded-xl" class:ring-2={color === option} style="background: {option}; --tw-ring-color: var(--text); --tw-ring-offset-width: 2px"></button>
	{/each}
</div>
