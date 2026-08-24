<script lang="ts">
	import type { HabitInput } from '$lib/habits';

	let {
		goal,
		kind = $bindable(),
		target = $bindable(),
		unit = $bindable()
	}: {
		goal: HabitInput['goal'];
		kind: HabitInput['kind'];
		target: number;
		unit: string;
	} = $props();
</script>

{#if goal === 'break'}
	<div>
		<label class="block">
			<span class="dim mb-1.5 block text-caption font-semibold tracking-wide uppercase">No more than</span>
			<div class="flex items-center gap-2">
				<input type="number" min="0" max="10000" bind:value={target} class="sunken w-full rounded-xl px-3 py-2.5 text-sm outline-none" />
				<span class="dim shrink-0 text-sm">per day</span>
			</div>
		</label>
		<p class="dim mt-2 text-caption">Each tap records one slip. Staying at or under this limit counts as a win.</p>
	</div>
{:else}
	<div>
		<p class="dim mb-1.5 text-caption font-semibold tracking-wide uppercase">Type</p>
		<div class="flex gap-1.5">
			<button type="button" onclick={() => { kind = 'binary'; target = 1; }} class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-medium" aria-pressed={kind === 'binary'} class:accent-bg={kind === 'binary'} class:sunken={kind !== 'binary'}>
				Done / not done
			</button>
			<button type="button" onclick={() => { kind = 'quantity'; if (target < 2) target = 8; }} class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-medium" aria-pressed={kind === 'quantity'} class:accent-bg={kind === 'quantity'} class:sunken={kind !== 'quantity'}>
				Count a quantity
			</button>
		</div>
	</div>

	{#if kind === 'quantity'}
		<div class="flex gap-2">
			<label class="flex-1">
				<span class="dim mb-1.5 block text-caption font-semibold tracking-wide uppercase">Daily goal</span>
				<input type="number" min="1" max="10000" bind:value={target} class="sunken w-full rounded-xl px-3 py-2.5 text-sm outline-none" />
			</label>
			<label class="flex-1">
				<span class="dim mb-1.5 block text-caption font-semibold tracking-wide uppercase">Unit</span>
				<input bind:value={unit} placeholder="glasses" class="sunken w-full rounded-xl px-3 py-2.5 text-sm outline-none placeholder:opacity-50" />
			</label>
		</div>
	{/if}
{/if}
