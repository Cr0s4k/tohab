<script lang="ts">
	import { humanDay } from '#lib/dates.js';
	import { haptic, hapticTap } from '#lib/haptics.js';
	import { taskDateShortcuts } from '#lib/taskOptions.js';

	let {
		due,
		dueTime,
		onDue,
		onDueTime,
		showSummary = false
	}: {
		due: string;
		dueTime: string;
		onDue: (value: string) => void;
		onDueTime: (value: string) => void;
		showSummary?: boolean;
	} = $props();

	function selectDue(value: string) {
		haptic('tap');
		onDue(value);
		if (!value) onDueTime('');
	}
</script>

<div class="mb-2 flex flex-wrap gap-1.5">
	{#each taskDateShortcuts() as shortcut (shortcut.label)}
		<button
			type="button"
			use:hapticTap
			onclick={() => selectDue(shortcut.value)}
			class="tap min-h-11 rounded-full px-3 py-1.5 text-caption font-medium"
			aria-pressed={due === shortcut.value}
			class:accent-bg={due === shortcut.value}
			class:sunken={due !== shortcut.value}
		>
			{shortcut.label}
		</button>
	{/each}
</div>
<div class="flex gap-2">
	<input
		type="date"
		aria-label="Due date"
		value={due}
		onchange={(event) => onDue(event.currentTarget.value)}
		class="sunken min-w-0 flex-1 rounded-xl px-3 py-2.5 text-copy outline-none"
	/>
	<input
		type="time"
		aria-label="Due time"
		value={dueTime}
		onchange={(event) => onDueTime(event.currentTarget.value)}
		class="sunken w-28 rounded-xl px-3 py-2.5 text-copy outline-none"
	/>
</div>
{#if showSummary && due}
	<p class="dim mt-1.5 text-caption">{humanDay(due)}</p>
{/if}
