<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = false,
		title = '',
		confirmLabel = 'Done',
		onClose,
		children
	}: {
		open?: boolean;
		title?: string;
		confirmLabel?: string;
		onClose: () => void;
		children: Snippet;
	} = $props();
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex flex-col justify-end" style="animation: fade-in 140ms ease">
		<button
			type="button"
			aria-label="Close"
			onclick={onClose}
			class="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
		></button>

		<div
			class="raised relative max-h-[88vh] overflow-y-auto rounded-t-3xl pb-safe"
			style="animation: sheet-in 200ms cubic-bezier(0.22, 1, 0.36, 1)"
		>
			<div
				class="hairline raised sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3"
			>
				<h2 class="text-base font-semibold">{title}</h2>
				<button type="button" onclick={onClose} class="tap accent-fg text-sm font-medium">
					{confirmLabel}
				</button>
			</div>
			<div class="px-4 py-4">
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
