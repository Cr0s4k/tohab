<script lang="ts">
	import type { Snippet } from 'svelte';
	import { sheet, veil } from '$lib/motion';
	import { lockScroll, unlockScroll } from '$lib/scrollLock';

	let {
		open = false,
		title = '',
		confirmLabel = 'Done',
		showHeader = true,
		onClose,
		children
	}: {
		open?: boolean;
		title?: string;
		confirmLabel?: string;
		showHeader?: boolean;
		onClose: () => void;
		children: Snippet;
	} = $props();

	let pane = $state<HTMLElement | null>(null);

	$effect(() => {
		if (!open) return;
		lockScroll(() => pane);
		return unlockScroll;
	});
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center md:p-8">
		<button
			type="button"
			aria-label="Close"
			onclick={onClose}
			transition:veil
			class="absolute inset-0 touch-none bg-black/45"
		></button>

		<div
			bind:this={pane}
			class="raised hairline relative max-h-[88dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl pb-safe md:max-h-[80dvh] md:max-w-lg md:rounded-3xl md:border md:shadow-2xl"
			transition:sheet
		>
			{#if showHeader}
				<div
					class="hairline raised sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3"
				>
					<h2 class="text-subtitle font-semibold">{title}</h2>
					<button type="button" onclick={onClose} class="tap accent-fg text-copy font-medium">
						{confirmLabel}
					</button>
				</div>
			{/if}
			<div class={showHeader ? 'px-4 py-4' : 'px-4 pt-4 pb-0'}>
				{@render children()}
			</div>
		</div>
	</div>
{/if}

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape') onClose();
	}}
/>
