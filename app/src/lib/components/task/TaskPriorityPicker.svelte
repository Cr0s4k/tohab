<script lang="ts">
	import { haptic, hapticTap } from '$lib/haptics';
	import { TASK_PRIORITIES } from '$lib/taskOptions';
	import { PRIORITY_LABELS, priorityClass } from '$lib/tasks';

	let { value, onSelect }: { value: number; onSelect: (value: number) => void } = $props();
</script>

<div class="flex gap-1.5">
	{#each TASK_PRIORITIES as priority (priority)}
		<button
			type="button"
			use:hapticTap
			onclick={() => {
				haptic('tap');
				onSelect(priority);
			}}
			class="tap sunken flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-caption font-medium"
			aria-pressed={value === priority}
			class:ring-2={value === priority}
			style="--tw-ring-color: var(--accent)"
		>
			<span class="{priorityClass(priority)} text-body font-bold">P{priority}</span>
			<span class="dim">{PRIORITY_LABELS[priority]}</span>
		</button>
	{/each}
</div>
