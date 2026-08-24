<script lang="ts">
	import { haptic, hapticTap } from '$lib/haptics';
	import { describeRepeat, REPEAT_PRESETS } from '$lib/repeat';

	let {
		value,
		onSelect,
		showDescription = false
	}: {
		value: string;
		onSelect: (value: string) => void;
		showDescription?: boolean;
	} = $props();
</script>

<div class="flex flex-wrap gap-1.5">
	{#each REPEAT_PRESETS as repeat (repeat.label)}
		<button
			type="button"
			use:hapticTap
			onclick={() => {
				haptic('tap');
				onSelect(repeat.value);
			}}
			class="tap min-h-11 rounded-full px-3 py-1.5 text-caption font-medium"
			aria-pressed={value === repeat.value}
			class:accent-bg={value === repeat.value}
			class:sunken={value !== repeat.value}
		>
			{repeat.label}
		</button>
	{/each}
</div>
{#if showDescription && value}
	<p class="dim mt-1.5 text-caption">{describeRepeat(value)} · completing it moves the due date on</p>
{/if}
