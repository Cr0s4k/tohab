<script lang="ts">
	import type { HabitInput } from '$lib/habits';
	let { goal, kind = $bindable(), target = $bindable(), unit = $bindable(), scheduleKind = $bindable() }: {
		goal: HabitInput['goal']; kind: HabitInput['kind']; target: number; unit: string; scheduleKind: HabitInput['scheduleKind'];
	} = $props();
</script>

{#if goal === 'build'}
	<div class="space-y-2">
		<p class="text-sm font-medium">How will you track it?</p>
		<div class="sunken grid grid-cols-2 gap-1 rounded-xl p-1">
			<button type="button" onclick={() => { kind = 'binary'; target = 1; }} aria-pressed={kind === 'binary'} class="tap min-h-11 rounded-lg text-sm" class:chosen={kind === 'binary'}>Check it off</button>
			<button type="button" onclick={() => { kind = 'quantity'; }} aria-pressed={kind === 'quantity'} class="tap min-h-11 rounded-lg text-sm" class:chosen={kind === 'quantity'}>Count a quantity</button>
		</div>
	</div>
{/if}

{#if goal === 'break' || kind === 'quantity'}
	<div class="sunken space-y-3 rounded-2xl p-4">
		<p class="text-sm font-medium">{goal === 'break' ? 'Stay at or below' : 'Reach at least'}</p>
		<div class="grid grid-cols-[5rem_1fr] gap-2">
			<input aria-label={goal === 'break' ? 'Maximum quantity' : 'Target quantity'} required type="number" min={goal === 'break' ? 0 : 1} max="10000" step="1" bind:value={target} class="raised min-h-12 w-full rounded-xl px-3 text-lg font-semibold outline-none" />
			<input aria-label="Unit" bind:value={unit} maxlength="24" placeholder="times" class="raised min-h-12 min-w-0 rounded-xl px-3 text-sm outline-none" />
		</div>
		<div class="grid grid-cols-2 gap-1 rounded-xl">
			<button type="button" onclick={() => (scheduleKind = 'daily')} aria-pressed={scheduleKind !== 'weekly'} class="tap min-h-11 rounded-lg text-sm" class:chosen={scheduleKind !== 'weekly'}>Per day</button>
			<button type="button" onclick={() => (scheduleKind = 'weekly')} aria-pressed={scheduleKind === 'weekly'} class="tap min-h-11 rounded-lg text-sm" class:chosen={scheduleKind === 'weekly'}>Per week</button>
		</div>
		<p class="dim text-xs leading-relaxed">{goal === 'break' ? 'Log each occurrence. Zero is a valid limit.' : 'Each tap adds one to your total.'} {scheduleKind === 'weekly' ? 'Your total resets at the start of each week.' : ''}</p>
	</div>
{/if}

<style>
	.chosen { background: var(--surface-raised); color: var(--text); box-shadow: 0 1px 3px #0001; font-weight: 600; }
</style>
