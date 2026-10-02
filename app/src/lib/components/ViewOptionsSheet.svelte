<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { haptic, hapticTap } from '#lib/haptics.js';
	import {
		GROUP_CHOICES,
		ORDER_CHOICES,
		SORT_CHOICES,
		isCustomised,
		resetViewOptions,
		setViewOptions,
		viewOptions,
		type ViewOptions
	} from '#lib/viewOptions.svelte.js';

	let {
		open = false,
		scope,
		title = 'Sort & group',
		onClose
	}: {
		open?: boolean;
		scope: string;
		title?: string;
		onClose: () => void;
	} = $props();

	let opts = $derived(viewOptions(scope));

	function set(patch: Partial<ViewOptions>) {
		haptic('tap');
		setViewOptions(scope, patch);
	}
</script>

{#snippet section(label: string)}
	<h3 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">{label}</h3>
{/snippet}

<Sheet {open} {title} showHeader={false} {onClose}>
	{@render section('Grouping')}
	<div class="mb-5 grid grid-cols-3 gap-1.5">
		{#each GROUP_CHOICES as choice (choice.id)}
			<button
				type="button"
				use:hapticTap
				onclick={() => set({ group: choice.id })}
				class="tap rounded-xl py-2.5 text-[0.8rem] font-medium"
				class:accent-bg={opts.group === choice.id}
				class:sunken={opts.group !== choice.id}
			>
				{choice.label}
			</button>
		{/each}
	</div>

	{@render section('Sorting')}
	<div class="mb-5 grid grid-cols-4 gap-1.5">
		{#each SORT_CHOICES as choice (choice.id)}
			<button
				type="button"
				use:hapticTap
				onclick={() => set({ sort: choice.id })}
				class="tap rounded-xl py-2.5 text-[0.8rem] font-medium"
				class:accent-bg={opts.sort === choice.id}
				class:sunken={opts.sort !== choice.id}
			>
				{choice.label}
			</button>
		{/each}
	</div>

	{@render section('Order')}
	<div class="mb-5 flex gap-1.5">
		{#each ORDER_CHOICES as choice (choice.id)}
			<button
				type="button"
				use:hapticTap
				onclick={() => set({ order: choice.id })}
				class="tap flex-1 rounded-xl py-2.5 text-[0.8rem] font-medium"
				class:accent-bg={opts.order === choice.id}
				class:sunken={opts.order !== choice.id}
			>
				{choice.label}
			</button>
		{/each}
	</div>

	<button
		type="button"
		use:hapticTap
		onclick={() => set({ showDone: !opts.showDone })}
		class="tap sunken mb-5 flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left"
	>
		<span class="text-[0.85rem] font-medium">Show completed tasks</span>
		<span
			class="hairline flex h-6 w-10 shrink-0 items-center rounded-full border px-0.5"
			class:accent-bg={opts.showDone}
		>
			<span
				class="size-5 rounded-full"
				style="background: var(--surface-raised); transform: translateX({opts.showDone
					? 14
					: 0}px); transition: transform 160ms ease"
			></span>
		</span>
	</button>

	{#if isCustomised(scope)}
		<button
			type="button"
			use:hapticTap
			onclick={() => {
				haptic('warn');
				resetViewOptions(scope);
			}}
			class="tap dim w-full py-1 text-center text-[0.8rem] font-medium"
		>
			Reset to default
		</button>
	{/if}
</Sheet>
