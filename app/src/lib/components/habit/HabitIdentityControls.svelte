<script lang="ts">
	import { HABIT_COLORS, HABIT_EMOJI } from '$lib/habits';
	let { name = $bindable(), emoji = $bindable(), color = $bindable() }: {
		name: string; emoji: string; color: string;
	} = $props();
	const colorNames = ['Coral', 'Amber', 'Green', 'Teal', 'Blue', 'Purple'];
</script>

<label class="block">
	<span class="mb-2 block text-sm font-medium">Habit name</span>
	<input bind:value={name} required maxlength="200" placeholder="Habit name" class="sunken min-h-12 w-full rounded-xl px-4 text-base outline-none placeholder:opacity-50" />
</label>

<details class="hairline rounded-2xl border">
	<summary class="flex cursor-pointer items-center gap-3 p-3">
		<span class="grid size-10 place-items-center rounded-xl text-xl" style="background: color-mix(in oklch, {color} 18%, transparent)">{emoji}</span>
		<span class="flex-1 text-sm font-medium">Icon & colour</span>
		<span class="dim text-xs">Customise</span>
		<span class="dim" aria-hidden="true">⌄</span>
	</summary>
	<div class="hairline space-y-4 border-t p-3">
		<div role="group" aria-label="Habit icon" class="grid grid-cols-6 gap-1.5">
			{#each HABIT_EMOJI as option (option)}
				<button type="button" onclick={() => (emoji = option)} aria-label={`Emoji ${option}`} aria-pressed={emoji === option} class="tap grid min-h-11 place-items-center rounded-xl text-xl" class:selected={emoji === option}>{option}</button>
			{/each}
		</div>
		<div role="group" aria-label="Habit colour" class="grid grid-cols-6 gap-1.5">
			{#each HABIT_COLORS as option, i (option)}
				<button type="button" aria-label={colorNames[i]} aria-pressed={color === option} onclick={() => (color = option)} class="tap grid min-h-11 place-items-center rounded-xl" class:selected={color === option}>
					<span class="size-6 rounded-full" style:background={option}></span>
				</button>
			{/each}
		</div>
	</div>
</details>

<style>
	.selected { background: var(--selected-bg); }
	summary { list-style: none; }
	summary::-webkit-details-marker { display: none; }
	button:focus-visible { outline-offset: 2px; }
</style>
