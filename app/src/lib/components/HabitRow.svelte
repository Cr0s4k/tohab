<script lang="ts">
	import type { Habit } from '$lib/db/schemas';
	import { haptic } from '$lib/haptics';
	import ProgressRing from './ProgressRing.svelte';

	let {
		habit,
		value,
		streak,
		due = true,
		onTap
	}: {
		habit: Habit;
		value: number;
		streak: number;
		due?: boolean;
		onTap: () => void;
	} = $props();

	let complete = $derived(
		habit.goal === 'break' ? value <= habit.target : value >= habit.target
	);
	let ringLabel = $derived(
		habit.goal === 'break' || habit.kind === 'quantity' ? `${value}/${habit.target}` : ''
	);
</script>

<div
	class="raised hairline border-b px-4 py-3 transition-colors hover:sunken"
	class:opacity-55={!due}
>
	<div class="measure flex items-center gap-3">
		<a href="/habits/{habit.id}" class="min-w-0 flex-1 flex items-center gap-3 text-left">
			<span
				class="grid size-10 shrink-0 place-items-center rounded-xl text-lg"
				style="background: color-mix(in oklch, {habit.color} 18%, transparent)"
			>
				{habit.emoji}
			</span>
			<span class="min-w-0 flex-1">
				<span class="block truncate text-[0.95rem] leading-snug" class:dim={complete}>{habit.name}</span>
				<span class="dim mt-0.5 block text-xs">
					{#if !due}
						Rest day
					{:else if streak > 0}
						🔥 {streak} {habit.scheduleKind === 'weekly' ? (streak === 1 ? 'week' : 'weeks') : (streak === 1 ? 'day' : 'days')}
					{:else if habit.goal === 'break'}
						{value === 0 ? 'Clean today' : `${value} ${value === 1 ? 'slip' : 'slips'} today`}
					{:else if habit.kind === 'quantity'}
						{value} of {habit.target}{habit.unit ? ` ${habit.unit}` : ''}
					{:else}
						Not done yet
					{/if}
				</span>
			</span>
		</a>

		<button
			type="button"
			aria-label={habit.goal === 'break'
				? `Log slip for ${habit.name}`
				: complete
					? `Undo ${habit.name}`
					: `Log ${habit.name}`}
			onclick={() => {
				haptic(complete ? 'tap' : 'success');
				onTap();
			}}
			class="tap"
		>
			<ProgressRing
				value={value}
				target={habit.target}
				color={habit.color}
				label={ringLabel}
				invert={habit.goal === 'break'}
			/>
		</button>
	</div>
</div>
