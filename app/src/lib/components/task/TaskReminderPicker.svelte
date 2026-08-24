<script lang="ts">
	import { settings } from '$lib/settings.svelte';
	import { hapticTap } from '$lib/haptics';

	let {
		value,
		dueTime,
		onSelect
	}: {
		value?: number;
		dueTime: string;
		onSelect: (value: number | undefined) => void;
	} = $props();

	const choices = [
		{ value: undefined, label: 'Automatic' },
		{ value: -1, label: 'None' },
		{ value: 0, label: 'At time' },
		{ value: 10, label: '10 min' },
		{ value: 30, label: '30 min' },
		{ value: 60, label: '1 hour' }
	];

	function automaticLabel(minutes: number): string {
		if (minutes < 0) return 'off';
		if (minutes === 0) return 'at the due time';
		if (minutes === 60) return '1 hour before';
		return `${minutes} minutes before`;
	}
</script>

{#if dueTime}
	<div class="flex flex-wrap gap-1.5">
		{#each choices as choice (choice.label)}
			<button
				type="button"
				use:hapticTap
				onclick={() => onSelect(choice.value)}
				aria-pressed={value === choice.value}
				class="tap hairline min-h-11 rounded-full border px-3 py-1.5 text-caption font-medium"
				class:accent-bg={value === choice.value}
				class:sunken={value !== choice.value}
			>
				{choice.label}
			</button>
		{/each}
	</div>
	<p class="dim mt-1.5 text-caption">
		{value === undefined
			? `Uses the automatic reminder: ${automaticLabel(settings.reminderMinutes)}.`
			: value < 0
				? 'No reminder for this task.'
				: value === 0
					? 'Reminds you when the task is due.'
					: `Reminds you ${automaticLabel(value)}.`}
	</p>
{:else}
	<p class="dim text-caption">Add a due time to use reminders.</p>
{/if}
