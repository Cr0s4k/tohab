<script lang="ts">
	import type { Habit } from '$lib/db/schemas';
	import { haptic, hapticTap } from '$lib/haptics';
	import { periodTarget } from '$lib/streaks';
	import { veil } from '$lib/motion';
	import ProgressRing from './ProgressRing.svelte';

	let {
		habit,
		value,
		dayValue = value,
		streak,
		due = true,
		edited = false,
		onTap
	}: {
		habit: Habit;
		value: number;
		dayValue?: number;
		streak: number;
		due?: boolean;
		edited?: boolean;
		onTap: () => void;
	} = $props();

	let complete = $derived(
		habit.goal === 'break' ? value <= habit.target : value >= periodTarget(habit)
	);
	let ringLabel = $derived(
		habit.goal === 'break' || habit.kind === 'quantity' || habit.scheduleKind === 'weekly' ? `${value}/${periodTarget(habit)}` : ''
	);
</script>

<div
	class="surface pressable group px-4 pt-3 pb-0"
>
	<div class="hairline measure flex items-center gap-3 border-b pb-3">
		<a href="/habits/{habit.id}" class="min-w-0 flex-1 flex items-center gap-3 text-left">
			<span
				class="grid size-10 shrink-0 place-items-center rounded-xl text-lg"
				style="background: color-mix(in oklch, {habit.color} 18%, transparent)"
			>
				{habit.emoji}
			</span>
			<span class="min-w-0 flex-1">
				<span class="habit-name block truncate text-body leading-snug" class:dim={complete}>{habit.name}</span>
				{#key `${value}:${streak}:${due}:${edited}`}
					<span in:veil={{ duration: 160 }} class="dim mt-0.5 block text-xs">
						{#if !due}
							Rest day
						{:else if habit.scheduleKind === 'weekly'}
							{value} / {periodTarget(habit)} {habit.kind === 'binary' ? 'days' : habit.unit || 'times'} this week{habit.goal === 'break' ? ' · max' : ''}
						{:else if streak > 0}
							🔥 {streak} {streak === 1 ? 'day' : 'days'}
						{:else if habit.goal === 'break'}
							{value === 0 ? 'Clean today' : `${value} ${value === 1 ? 'slip' : 'slips'} today`}
						{:else if habit.kind === 'quantity'}
							{value} of {habit.target}{habit.unit ? ` ${habit.unit}` : ''}
						{:else}
							Not done yet
						{/if}
						{#if edited}
							<span class="entry-edited ml-1 inline-flex size-3 shrink-0" role="img" aria-label="Entry edited" title="Entry edited">
								<svg aria-hidden="true" viewBox="0 0 24 24" class="size-3" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
									<path d="M12 20h9" />
									<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
								</svg>
							</span>
						{/if}
					</span>
				{/key}
			</span>
		</a>

		<a
			href="/habits/{habit.id}"
			aria-label="Edit {habit.name}"
			class="edit-hint dim size-8 shrink-0 place-items-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
		>
			<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 20h9" />
				<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
			</svg>
		</a>

		<button
			type="button"
			use:hapticTap
			aria-label={habit.kind === 'quantity'
				? `Edit entry for ${habit.name}`
				: dayValue >= habit.target
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
				target={periodTarget(habit)}
				color={habit.color}
				label={ringLabel}
				invert={habit.goal === 'break'}
			/>
		</button>
	</div>
</div>

<style>
	.habit-name {
		transition: color var(--motion-state) ease;
	}

	.entry-edited {
		vertical-align: -0.125em;
	}
</style>
